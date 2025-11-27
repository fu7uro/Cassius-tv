import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { discoverContentWithPerplexity } from './api/perplexity'
import { enrichContentWithTMDB } from './api/tmdb'

// Type definitions for Cloudflare bindings
type Bindings = {
  DB?: D1Database
  PERPLEXITY_API_KEY: string
  TMDB_API_KEY: string
}

type Variables = {
  // Add any per-request variables here
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Enable CORS for all API routes
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}))

// Serve static files from public directory
app.use('/static/*', serveStatic({ root: './public' }))
app.use('/favicon.ico', serveStatic({ root: './public' }))

// ============================
// API Routes
// ============================

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: c.env.DB ? 'connected' : 'not configured'
  })
})

// Get user preferences
app.get('/api/preferences', async (c) => {
  const { DB } = c.env
  
  if (!DB) {
    // Return default preferences if DB not configured
    return c.json({
      recommendations_per_type: 12,
      auto_refresh: true,
      refresh_interval: 7,
      ui_theme: 'dark',
      preferred_quality: 'HD'
    })
  }

  try {
    const result = await DB.prepare('SELECT * FROM preferences WHERE id = 1').first()
    return c.json(result || {
      recommendations_per_type: 12,
      auto_refresh: true,
      refresh_interval: 7,
      ui_theme: 'dark',
      preferred_quality: 'HD'
    })
  } catch (error) {
    console.error('Error fetching preferences:', error)
    return c.json({ error: 'Failed to fetch preferences' }, 500)
  }
})

// Update user preferences
app.put('/api/preferences', async (c) => {
  const { DB } = c.env
  
  if (!DB) {
    return c.json({ error: 'Database not configured' }, 503)
  }

  try {
    const body = await c.req.json()
    
    await DB.prepare(`
      INSERT OR REPLACE INTO preferences (
        id, auto_refresh, refresh_interval, recommendations_per_type,
        preferred_quality, ui_theme, show_adult_content
      ) VALUES (1, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.auto_refresh ?? true,
      body.refresh_interval ?? 7,
      body.recommendations_per_type ?? 12,
      body.preferred_quality ?? 'HD',
      body.ui_theme ?? 'dark',
      body.show_adult_content ?? false
    ).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error updating preferences:', error)
    return c.json({ error: 'Failed to update preferences' }, 500)
  }
})

// Get all categories
app.get('/api/categories', async (c) => {
  const { DB } = c.env
  
  if (!DB) {
    // Return default categories if DB not configured
    return c.json([
      { id: 1, name: 'Action', color: '#DC2626', icon: 'fire' },
      { id: 2, name: 'Comedy', color: '#F59E0B', icon: 'face-smile' },
      { id: 3, name: 'Drama', color: '#7C3AED', icon: 'masks-theater' },
      { id: 4, name: 'Horror', color: '#991B1B', icon: 'ghost' },
      { id: 5, name: 'Sci-Fi', color: '#0EA5E9', icon: 'rocket' },
    ])
  }

  try {
    const { results } = await DB.prepare('SELECT * FROM categories ORDER BY display_order').all()
    return c.json(results)
  } catch (error) {
    console.error('Error fetching categories:', error)
    return c.json({ error: 'Failed to fetch categories' }, 500)
  }
})

// Get library content
app.get('/api/library', async (c) => {
  const { DB } = c.env
  const { category, type } = c.req.query()
  
  if (!DB) {
    return c.json({ content: [], total: 0 })
  }

  try {
    let query = 'SELECT * FROM content WHERE in_library = TRUE'
    const params = []
    
    if (type && type !== 'all') {
      query += ' AND type = ?'
      params.push(type)
    }
    
    if (category) {
      query += ` AND id IN (
        SELECT content_id FROM content_categories WHERE category_id = ?
      )`
      params.push(category)
    }
    
    query += ' ORDER BY added_at DESC'
    
    const stmt = DB.prepare(query)
    if (params.length > 0) {
      stmt.bind(...params)
    }
    
    const { results } = await stmt.all()
    return c.json({ content: results, total: results.length })
  } catch (error) {
    console.error('Error fetching library:', error)
    return c.json({ error: 'Failed to fetch library' }, 500)
  }
})

// Add content to library
app.post('/api/library', async (c) => {
  const { DB } = c.env
  
  if (!DB) {
    return c.json({ error: 'Database not configured' }, 503)
  }

  try {
    const content = await c.req.json()
    
    const result = await DB.prepare(`
      INSERT INTO content (
        tmdb_id, title, type, poster_url, backdrop_url, 
        stream_url, overview, release_year, runtime,
        seasons, episodes, genre, source, in_library
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
      ON CONFLICT(tmdb_id) DO UPDATE SET
        in_library = TRUE,
        stream_url = excluded.stream_url,
        added_at = CURRENT_TIMESTAMP
    `).bind(
      content.tmdb_id || null,
      content.title,
      content.type,
      content.poster_url || null,
      content.backdrop_url || null,
      content.stream_url || null,
      content.overview || null,
      content.release_year || null,
      content.runtime || null,
      content.seasons || null,
      content.episodes || null,
      content.genre || null,
      content.source || 'manual'
    ).run()
    
    return c.json({ 
      success: true, 
      id: result.meta.last_row_id 
    })
  } catch (error) {
    console.error('Error adding to library:', error)
    return c.json({ error: 'Failed to add to library' }, 500)
  }
})

// Remove from library
app.delete('/api/library/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  if (!DB) {
    return c.json({ error: 'Database not configured' }, 503)
  }

  try {
    await DB.prepare('UPDATE content SET in_library = FALSE WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('Error removing from library:', error)
    return c.json({ error: 'Failed to remove from library' }, 500)
  }
})

// Rate content
app.post('/api/ratings', async (c) => {
  const { DB } = c.env
  
  if (!DB) {
    return c.json({ error: 'Database not configured' }, 503)
  }

  try {
    const { content_id, rating } = await c.req.json()
    
    // Validate rating
    if (rating < 1 || rating > 5) {
      return c.json({ error: 'Rating must be between 1 and 5' }, 400)
    }
    
    await DB.prepare(`
      INSERT OR REPLACE INTO ratings (content_id, rating, rated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).bind(content_id, rating).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error saving rating:', error)
    return c.json({ error: 'Failed to save rating' }, 500)
  }
})

// Discover new content using Perplexity + TMDB
app.post('/api/discover', async (c) => {
  const { DB, PERPLEXITY_API_KEY, TMDB_API_KEY } = c.env
  
  // Check API keys
  if (!PERPLEXITY_API_KEY || PERPLEXITY_API_KEY === 'your_perplexity_api_key_here') {
    return c.json({ 
      error: 'Perplexity API key not configured',
      message: 'Please add your Perplexity API key in the settings or .dev.vars file'
    }, 400)
  }

  if (!TMDB_API_KEY || TMDB_API_KEY === 'your_tmdb_api_key_here') {
    return c.json({ 
      error: 'TMDB API key not configured',
      message: 'Please add your TMDB API key in the settings or .dev.vars file'
    }, 400)
  }

  try {
    // Get user library and ratings from DB (if available)
    let userLibrary = [];
    let ratings = [];
    let preferences = {
      recommendations_per_type: 12,
      auto_refresh: true,
      refresh_interval: 7,
      ui_theme: 'dark',
      preferred_quality: 'HD'
    };

    if (DB) {
      try {
        const libraryResult = await DB.prepare('SELECT * FROM content WHERE in_library = TRUE').all();
        userLibrary = libraryResult.results || [];

        const ratingsResult = await DB.prepare('SELECT * FROM ratings').all();
        ratings = ratingsResult.results || [];

        const prefsResult = await DB.prepare('SELECT * FROM preferences WHERE id = 1').first();
        if (prefsResult) {
          preferences = prefsResult as any;
        }
      } catch (dbError) {
        console.error('Database query error:', dbError);
        // Continue with empty data
      }
    }

    // Discover content with Perplexity
    console.log('Discovering content with Perplexity...');
    const discovered = await discoverContentWithPerplexity(
      PERPLEXITY_API_KEY,
      userLibrary,
      ratings,
      preferences
    );

    console.log(`Found ${discovered.length} potential items`);

    // Enrich each discovered item with TMDB data
    const enrichmentPromises = discovered.map(async (item) => {
      try {
        const enriched = await enrichContentWithTMDB(
          TMDB_API_KEY,
          item.title,
          item.type
        );
        
        if (enriched) {
          // Merge Perplexity and TMDB data
          return {
            ...enriched,
            stream_url: item.streamUrl || enriched.stream_urls?.[0],
            source: 'recommendation'
          };
        }
        
        // Fallback to Perplexity data if TMDB fails
        return {
          title: item.title,
          type: item.type,
          stream_url: item.streamUrl,
          source: 'recommendation'
        };
      } catch (error) {
        console.error(`Failed to enrich "${item.title}":`, error);
        return null;
      }
    });

    const enrichedContent = (await Promise.all(enrichmentPromises))
      .filter(item => item !== null);

    // Save discovered content to DB (if available)
    if (DB && enrichedContent.length > 0) {
      for (const content of enrichedContent) {
        try {
          await DB.prepare(`
            INSERT OR IGNORE INTO content (
              tmdb_id, title, type, poster_url, backdrop_url, 
              stream_url, overview, release_year, runtime,
              seasons, episodes, genre, source, in_library
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)
          `).bind(
            content.tmdb_id || null,
            content.title,
            content.type,
            content.poster_url || null,
            content.backdrop_url || null,
            content.stream_url || null,
            content.overview || null,
            content.release_year || null,
            content.runtime || null,
            content.seasons || null,
            content.episodes || null,
            content.genres?.join(', ') || null,
            content.source || 'recommendation'
          ).run();
        } catch (insertError) {
          console.error('Failed to insert content:', insertError);
        }
      }
    }

    // Separate movies and TV shows
    const movies = enrichedContent.filter(item => item.type === 'movie');
    const tvShows = enrichedContent.filter(item => item.type === 'tv');

    return c.json({
      success: true,
      movies: movies.slice(0, preferences.recommendations_per_type),
      tvShows: tvShows.slice(0, preferences.recommendations_per_type),
      total: enrichedContent.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Discovery error:', error);
    return c.json({ 
      error: 'Failed to discover content',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
})

// ============================
// Main UI Route
// ============================

app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cassius TV - Free Streaming Guide</title>
        
        <!-- Tailwind CSS -->
        <script src="https://cdn.tailwindcss.com"></script>
        
        <!-- Font Awesome Icons -->
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        
        <!-- Custom Styles -->
        <style>
          /* Netflix-style dark theme */
          body {
            background: #141414;
            color: #e5e5e5;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          
          /* Custom scrollbar */
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          
          ::-webkit-scrollbar-track {
            background: #1a1a1a;
          }
          
          ::-webkit-scrollbar-thumb {
            background: #555;
            border-radius: 4px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: #777;
          }
          
          /* Content card hover effect */
          .content-card {
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
          }
          
          .content-card:hover {
            transform: scale(1.05);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.8);
            z-index: 10;
          }
          
          /* Rating stars */
          .star-rating {
            color: #fbbf24;
          }
          
          .star-rating .star {
            cursor: pointer;
            transition: color 0.2s;
          }
          
          .star-rating .star:hover,
          .star-rating .star.active {
            color: #f59e0b;
          }

          /* Loading spinner */
          .spinner {
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top: 3px solid #e50914;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          /* Category row */
          .category-row {
            scroll-behavior: smooth;
          }
        </style>
    </head>
    <body>
        <!-- Navigation -->
        <nav class="fixed top-0 left-0 right-0 bg-gradient-to-b from-black via-black/80 to-transparent z-50 px-4 lg:px-8 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-8">
              <!-- Logo -->
              <h1 class="text-2xl lg:text-3xl font-bold text-red-600">
                <i class="fas fa-tv mr-2"></i>Cassius TV
              </h1>
              
              <!-- Nav Links -->
              <div class="hidden md:flex items-center space-x-6">
                <button class="hover:text-white transition" onclick="showHome()">Home</button>
                <button class="hover:text-white transition" onclick="showLibrary()">My Library</button>
                <button class="hover:text-white transition" onclick="showCategories()">Categories</button>
              </div>
            </div>
            
            <!-- Right side actions -->
            <div class="flex items-center space-x-4">
              <!-- Search -->
              <button class="hover:text-white transition">
                <i class="fas fa-search text-xl"></i>
              </button>
              
              <!-- Generate Guide Button -->
              <button onclick="generateGuide()" class="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold transition flex items-center space-x-2">
                <i class="fas fa-wand-magic-sparkles"></i>
                <span class="hidden sm:inline">Generate Guide</span>
              </button>
              
              <!-- Settings -->
              <button onclick="showSettings()" class="hover:text-white transition">
                <i class="fas fa-cog text-xl"></i>
              </button>
            </div>
          </div>
        </nav>
        
        <!-- Main Content -->
        <main class="pt-20 pb-8 px-4 lg:px-8 min-h-screen">
          <!-- Loading State -->
          <div id="loading" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div class="text-center">
              <div class="spinner mx-auto mb-4"></div>
              <p class="text-lg">Finding your perfect shows...</p>
            </div>
          </div>
          
          <!-- Content Container -->
          <div id="content-container">
            <!-- Hero Section -->
            <section class="mb-12 mt-8">
              <div class="bg-gradient-to-r from-red-600/20 to-transparent rounded-xl p-8">
                <h2 class="text-4xl font-bold mb-4">Welcome to Your Free Streaming Guide</h2>
                <p class="text-xl text-gray-300 mb-6">Discover amazing free content tailored to your taste</p>
                <div class="flex flex-wrap gap-4">
                  <button onclick="generateGuide()" class="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg font-semibold transition">
                    <i class="fas fa-play mr-2"></i>Get Started
                  </button>
                  <button onclick="showAddContent()" class="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg font-semibold transition">
                    <i class="fas fa-plus mr-2"></i>Add Content
                  </button>
                </div>
              </div>
            </section>
            
            <!-- Recommendations Section -->
            <section id="recommendations" class="mb-12">
              <h3 class="text-2xl font-bold mb-6">
                <i class="fas fa-sparkles mr-2 text-yellow-500"></i>
                Recommended For You
              </h3>
              <div id="recommendations-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <!-- Placeholder cards -->
                <div class="content-card bg-gray-800 rounded-lg overflow-hidden">
                  <div class="aspect-[2/3] bg-gray-700 animate-pulse"></div>
                  <div class="p-3">
                    <div class="h-4 bg-gray-700 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            </section>
            
            <!-- Library Section -->
            <section id="library" class="mb-12">
              <h3 class="text-2xl font-bold mb-6">
                <i class="fas fa-bookmark mr-2 text-blue-500"></i>
                My Library
              </h3>
              <div id="library-grid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <!-- Library items will be loaded here -->
              </div>
            </section>
          </div>
        </main>
        
        <!-- Add Content Modal -->
        <div id="add-content-modal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div class="bg-gray-900 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 class="text-2xl font-bold mb-4">Add Custom Content</h3>
            <form id="add-content-form">
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium mb-2">Title *</label>
                  <input type="text" name="title" required class="w-full px-3 py-2 bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600">
                </div>
                
                <div>
                  <label class="block text-sm font-medium mb-2">Type *</label>
                  <select name="type" required class="w-full px-3 py-2 bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600">
                    <option value="movie">Movie</option>
                    <option value="tv">TV Show</option>
                  </select>
                </div>
                
                <div>
                  <label class="block text-sm font-medium mb-2">Stream URL *</label>
                  <input type="url" name="stream_url" required class="w-full px-3 py-2 bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600">
                </div>
                
                <div>
                  <label class="block text-sm font-medium mb-2">Poster Image URL</label>
                  <input type="url" name="poster_url" class="w-full px-3 py-2 bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600">
                </div>
                
                <div>
                  <label class="block text-sm font-medium mb-2">Description</label>
                  <textarea name="overview" rows="3" class="w-full px-3 py-2 bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"></textarea>
                </div>
                
                <div>
                  <label class="block text-sm font-medium mb-2">Category</label>
                  <select name="category" class="w-full px-3 py-2 bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600">
                    <option value="">Select Category...</option>
                  </select>
                </div>
              </div>
              
              <div class="flex justify-end space-x-4 mt-6">
                <button type="button" onclick="closeAddContent()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition">
                  Cancel
                </button>
                <button type="submit" class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition">
                  Add to Library
                </button>
              </div>
            </form>
          </div>
        </div>
        
        <!-- Scripts -->
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app