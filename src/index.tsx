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

// Serve favicon and app icons
app.use('/favicon.ico', serveStatic({ root: './public' }))
app.use('/favicon-16x16.png', serveStatic({ root: './public' }))
app.use('/favicon-32x32.png', serveStatic({ root: './public' }))
app.use('/apple-touch-icon.png', serveStatic({ root: './public' }))
app.use('/icon-192.png', serveStatic({ root: './public' }))
app.use('/icon-512.png', serveStatic({ root: './public' }))
app.use('/manifest.json', serveStatic({ root: './public' }))

// ============================
// API Routes
// ============================

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: c.env.DB ? 'connected' : 'not configured',
    perplexity_configured: !!c.env.PERPLEXITY_API_KEY,
    tmdb_configured: !!c.env.TMDB_API_KEY,
    env_keys: Object.keys(c.env)
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
        preferred_quality, ui_theme, show_adult_content, perplexity_api_key, tmdb_api_key
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.auto_refresh ?? true,
      body.refresh_interval ?? 7,
      body.recommendations_per_type ?? 12,
      body.preferred_quality ?? 'HD',
      body.ui_theme ?? 'dark',
      body.show_adult_content ?? false,
      body.perplexity_api_key ?? null,
      body.tmdb_api_key ?? null
    ).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error updating preferences:', error)
    return c.json({ error: 'Failed to update preferences' }, 500)
  }
})

// Save favorite titles for better recommendations
app.post('/api/preferences/favorites', async (c) => {
  const { DB } = c.env
  
  if (!DB) {
    return c.json({ error: 'Database not configured' }, 503)
  }

  try {
    const { favorites } = await c.req.json()
    
    // Store as JSON in preferences for now (can normalize later)
    await DB.prepare(`
      INSERT OR REPLACE INTO preferences (id, perplexity_api_key, tmdb_api_key)
      VALUES (1, 
        (SELECT perplexity_api_key FROM preferences WHERE id = 1),
        (SELECT tmdb_api_key FROM preferences WHERE id = 1)
      )
    `).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error saving favorites:', error)
    return c.json({ error: 'Failed to save favorites' }, 500)
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

// Test Perplexity API directly with correct model
app.get('/api/test-perplexity', async (c) => {
  const { PERPLEXITY_API_KEY, DB } = c.env
  
  if (!PERPLEXITY_API_KEY) {
    return c.json({ error: 'No API key' }, 400)
  }
  
  // Check library count
  let libraryCount = 0;
  if (DB) {
    const result = await DB.prepare('SELECT COUNT(*) as count FROM content WHERE in_library = TRUE').first();
    libraryCount = result?.count || 0;
  }
  
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{
          role: 'system',
          content: 'You are a helpful assistant.'
        }, {
          role: 'user',
          content: 'List 3 popular free streaming movies available on Tubi. Just list their titles.'
        }],
        temperature: 0.7,
        max_tokens: 500
      })
    })
    
    const data = await response.json()
    
    return c.json({
      library_count: libraryCount,
      perplexity_status: response.status,
      perplexity_ok: response.ok,
      perplexity_response: data
    })
  } catch (error) {
    return c.json({
      library_count: libraryCount,
      error: 'Fetch failed',
      message: error instanceof Error ? error.message : 'Unknown'
    }, 500)
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

    // Get recommendation history to filter out duplicates
    let recommendationHistory = [];
    if (DB) {
      try {
        // Get titles recommended in last 30 days
        const historyResult = await DB.prepare(`
          SELECT title, tmdb_id, shown_count 
          FROM recommendation_history 
          WHERE recommended_at > datetime('now', '-30 days')
        `).all();
        recommendationHistory = historyResult.results || [];
        console.log(`Found ${recommendationHistory.length} items in recent recommendation history`);
      } catch (histError) {
        console.error('Failed to load recommendation history:', histError);
      }
    }
    
    // Discover content with Perplexity
    console.log('Discovering content with Perplexity...');
    console.log('Library size:', userLibrary.length);
    console.log('Ratings count:', ratings.length);
    
    let discovered = [];
    try {
      discovered = await discoverContentWithPerplexity(
        PERPLEXITY_API_KEY,
        userLibrary,
        ratings,
        preferences
      );
      console.log(`Found ${discovered.length} potential items from Perplexity`);
      
      // Filter out recently recommended content
      const historyTitles = new Set(recommendationHistory.map(h => h.title.toLowerCase()));
      const filteredDiscovered = discovered.filter(item => {
        const titleLower = item.title.toLowerCase();
        return !historyTitles.has(titleLower);
      });
      
      console.log(`After filtering history: ${filteredDiscovered.length} items (removed ${discovered.length - filteredDiscovered.length} duplicates)`);
      discovered = filteredDiscovered;
      
    } catch (perplexityError) {
      console.error('Perplexity discovery error:', perplexityError);
      return c.json({
        error: 'Perplexity API error',
        message: perplexityError instanceof Error ? perplexityError.message : 'Unknown error',
        library_size: userLibrary.length
      }, 500);
    }

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
          // Use search URLs that actually work
          const searchUrl = `https://tubitv.com/search?q=${encodeURIComponent(enriched.title)}`;
          return {
            ...enriched,
            stream_url: searchUrl,
            stream_urls: enriched.stream_urls || [searchUrl],
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

    // Save discovered content to DB and track in recommendation history
    if (DB && enrichedContent.length > 0) {
      for (const content of enrichedContent) {
        try {
          // Save to content table
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
          
          // Track in recommendation history
          await DB.prepare(`
            INSERT INTO recommendation_history (tmdb_id, title, type, genre, shown_count)
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(title) DO UPDATE SET 
              shown_count = shown_count + 1,
              recommended_at = CURRENT_TIMESTAMP
          `).bind(
            content.tmdb_id || null,
            content.title,
            content.type,
            content.genres?.join(', ') || null
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
        
        <!-- Favicon and App Icons -->
        <link rel="icon" type="image/x-icon" href="/favicon.ico">
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
        
        <!-- PWA Manifest -->
        <link rel="manifest" href="/manifest.json">
        
        <!-- iOS Meta Tags for Standalone App -->
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <meta name="apple-mobile-web-app-title" content="Cassius TV">
        
        <!-- Theme Colors -->
        <meta name="theme-color" content="#dc2626">
        <meta name="msapplication-TileColor" content="#dc2626">
        
        <!-- SEO Meta Tags -->
        <meta name="description" content="Discover and organize free movies and TV shows from streaming platforms like Tubi, Plex, Crackle, and more.">
        <meta name="keywords" content="free streaming, movies, tv shows, tubi, plex, crackle, free movies">
        
        <!-- Tailwind CSS -->
        <script src="https://cdn.tailwindcss.com"></script>
        
        <!-- Font Awesome Icons -->
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        
        <!-- Custom Styles -->
        <style>
          /* Modern dark theme with red/silver aesthetic */
          :root {
            --bg-primary: #0a0a0a;
            --bg-secondary: #1a1a1a;
            --bg-tertiary: #2a2a2a;
            --text-primary: #f5f5f5;
            --text-secondary: #c0c0c0;
            --accent-red: #dc2626;
            --accent-red-hover: #ef4444;
            --accent-silver: #a1a1aa;
            --accent-silver-bright: #d4d4d8;
          }
          
          body {
            background: var(--bg-primary);
            color: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          
          /* Custom scrollbar */
          ::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          
          ::-webkit-scrollbar-track {
            background: var(--bg-secondary);
            border-radius: 5px;
          }
          
          ::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, var(--accent-red), var(--accent-silver));
            border-radius: 5px;
            border: 2px solid var(--bg-secondary);
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, var(--accent-red-hover), var(--accent-silver-bright));
          }
          
          /* Content card hover effect */
          .content-card {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            background: var(--bg-secondary);
            border: 1px solid transparent;
          }
          
          .content-card:hover {
            transform: scale(1.05) translateY(-4px);
            box-shadow: 
              0 20px 40px rgba(220, 38, 38, 0.2),
              0 0 0 1px var(--accent-red);
            z-index: 10;
            background: linear-gradient(145deg, var(--bg-secondary), var(--bg-tertiary));
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
            border: 3px solid var(--accent-silver);
            border-radius: 50%;
            border-top: 3px solid var(--accent-red);
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            box-shadow: 0 0 20px rgba(220, 38, 38, 0.5);
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
        <nav class="fixed top-0 left-0 right-0 bg-gradient-to-b from-black/95 via-black/80 to-transparent z-50 px-4 lg:px-8 py-4 backdrop-blur-sm">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-8">
              <!-- Logo -->
              <div class="flex items-center space-x-3">
                <img src="https://ik.imagekit.io/futuro2025/IMG_8714.jpg?updatedAt=1763987329728" 
                     alt="Cassius TV" 
                     class="h-10 w-10 lg:h-12 lg:w-12 rounded-lg shadow-lg shadow-red-600/20">
                <h1 class="text-2xl lg:text-3xl font-bold bg-gradient-to-r from-red-600 to-gray-400 bg-clip-text text-transparent">
                  Cassius TV
                </h1>
              </div>
              
              <!-- Nav Links -->
              <div class="hidden md:flex items-center space-x-6">
                <button class="hover:text-white transition" onclick="showHome()">Home</button>
                
                <!-- Movies Dropdown -->
                <div class="relative group">
                  <button class="hover:text-white transition text-blue-400 flex items-center">
                    Movies
                    <i class="fas fa-chevron-down ml-1 text-xs"></i>
                  </button>
                  <div class="absolute top-full left-0 mt-2 bg-gray-900 rounded-lg shadow-xl border border-gray-800 py-2 min-w-[200px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <button onclick="showMovies()" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">
                      <i class="fas fa-film mr-2 text-blue-400"></i>All Movies
                    </button>
                    <div class="border-t border-gray-800 my-2"></div>
                    <button onclick="showMoviesByGenre('Drama')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Drama</button>
                    <button onclick="showMoviesByGenre('Comedy')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Comedy</button>
                    <button onclick="showMoviesByGenre('Action')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Action</button>
                    <button onclick="showMoviesByGenre('Thriller')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Thriller</button>
                    <button onclick="showMoviesByGenre('Crime')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Crime</button>
                    <button onclick="showMoviesByGenre('Horror')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Horror</button>
                  </div>
                </div>
                
                <!-- TV Shows Dropdown -->
                <div class="relative group">
                  <button class="hover:text-white transition text-purple-400 flex items-center">
                    TV Shows
                    <i class="fas fa-chevron-down ml-1 text-xs"></i>
                  </button>
                  <div class="absolute top-full left-0 mt-2 bg-gray-900 rounded-lg shadow-xl border border-gray-800 py-2 min-w-[200px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <button onclick="showTVShows()" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">
                      <i class="fas fa-tv mr-2 text-purple-400"></i>All TV Shows
                    </button>
                    <div class="border-t border-gray-800 my-2"></div>
                    <button onclick="showTVByGenre('Drama')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Drama</button>
                    <button onclick="showTVByGenre('Comedy')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Comedy</button>
                    <button onclick="showTVByGenre('Action')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Action</button>
                    <button onclick="showTVByGenre('Thriller')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Thriller</button>
                    <button onclick="showTVByGenre('Documentary')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Documentary</button>
                  </div>
                </div>
                
                <!-- Sports Dropdown -->
                <div class="relative group">
                  <button class="hover:text-white transition text-orange-400 flex items-center">
                    Sports
                    <i class="fas fa-chevron-down ml-1 text-xs"></i>
                  </button>
                  <div class="absolute top-full left-0 mt-2 bg-gray-900 rounded-lg shadow-xl border border-gray-800 py-2 min-w-[200px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <button onclick="showSports()" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">
                      <i class="fas fa-football mr-2 text-orange-400"></i>All Sports
                    </button>
                    <div class="border-t border-gray-800 my-2"></div>
                    <button onclick="showSportsByType('UFC')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">UFC</button>
                    <button onclick="showSportsByType('Football')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Football</button>
                    <button onclick="showSportsByType('Basketball')" class="block w-full text-left px-4 py-2 hover:bg-gray-800 transition">Basketball</button>
                  </div>
                </div>
                
                <button class="hover:text-white transition" onclick="showLibrary()">My Library</button>
              </div>
            </div>
            
            <!-- Right side actions -->
            <div class="flex items-center space-x-4">
              <!-- Search -->
              <button class="hover:text-white transition">
                <i class="fas fa-search text-xl"></i>
              </button>
              
              <!-- Generate Guide Button -->
              <button onclick="generateGuide()" class="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 px-4 py-2 rounded-lg font-semibold transition-all duration-300 flex items-center space-x-2 shadow-lg hover:shadow-red-600/30">
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
              <div class="relative bg-gradient-to-br from-red-600/10 via-gray-900/50 to-gray-400/10 rounded-2xl p-8 border border-gray-800 overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-r from-red-600/5 to-transparent animate-pulse"></div>
                <div class="relative z-10">
                  <h2 class="text-4xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                    Welcome to Your Free Streaming Guide
                  </h2>
                  <p class="text-xl text-gray-300 mb-6">Discover amazing free content tailored to your taste</p>
                  <div class="flex flex-wrap gap-4">
                    <button onclick="generateGuide()" class="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 px-6 py-3 rounded-lg font-semibold transition-all duration-300 shadow-xl hover:shadow-red-600/40 hover:scale-105">
                      <i class="fas fa-play mr-2"></i>Get Started
                    </button>
                    <button onclick="showAddContent()" class="bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 px-6 py-3 rounded-lg font-semibold transition-all duration-300 shadow-xl hover:shadow-gray-600/40">
                      <i class="fas fa-plus mr-2"></i>Add Content
                    </button>
                  </div>
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
        <div id="add-content-modal" class="hidden fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div class="bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-800 shadow-2xl">
            <h3 class="text-3xl font-bold mb-6 bg-gradient-to-r from-red-600 to-gray-400 bg-clip-text text-transparent">Add Custom Content</h3>
            <form id="add-content-form">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Left Column -->
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium mb-2 text-gray-300">Title *</label>
                    <input type="text" name="title" required placeholder="e.g., The Shawshank Redemption" 
                           class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all">
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium mb-2 text-gray-300">Type *</label>
                    <select name="type" required class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent">
                      <option value="movie">🎬 Movie</option>
                      <option value="tv">📺 TV Show</option>
                      <option value="sports">🏈 Sports Event</option>
                    </select>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium mb-2 text-gray-300">Genre</label>
                    <input type="text" name="genre" placeholder="e.g., Action, Drama, UFC, Football..."
                           class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent">
                    <p class="text-xs text-gray-500 mt-1">Optional - helps with filtering</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium mb-2 text-gray-300">Stream URL *</label>
                    <input type="url" name="stream_url" required placeholder="https://..." 
                           class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent">
                    <p class="text-xs text-gray-500 mt-1">Direct link to stream or player page</p>
                  </div>

                  <div>
                    <label class="block text-sm font-medium mb-2 text-gray-300">Release Year</label>
                    <input type="number" name="release_year" min="1900" max="2025" placeholder="2024"
                           class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent">
                  </div>
                </div>
                
                <!-- Right Column -->
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium mb-2 text-gray-300">Poster Image</label>
                    <input type="file" id="poster-image-upload" accept="image/*" 
                           onchange="handleImageUpload(this)"
                           class="hidden">
                    <button type="button" onclick="document.getElementById('poster-image-upload').click()" 
                            class="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg transition flex items-center justify-center">
                      <i class="fas fa-upload mr-2"></i>
                      Choose from Photos
                    </button>
                    <div id="poster-preview" class="mt-2 w-full h-48 bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700 overflow-hidden">
                      <i class="fas fa-image text-3xl text-gray-600"></i>
                    </div>
                    <input type="hidden" id="poster-data" name="poster_data" value="">
                    <p class="text-xs text-gray-500 mt-1">Upload from your device's photo library</p>
                  </div>
                  

                </div>
                
                <!-- Full Width Description -->
                <div class="col-span-1 md:col-span-2">
                  <label class="block text-sm font-medium mb-2 text-gray-300">Description</label>
                  <textarea name="overview" rows="3" placeholder="Brief description or notes about this content..."
                            class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"></textarea>
                </div>

                <!-- Tags/Keywords -->
                <div class="col-span-1 md:col-span-2">
                  <label class="block text-sm font-medium mb-2 text-gray-300">Tags (comma separated)</label>
                  <input type="text" name="tags" placeholder="action, thriller, must-watch, classic"
                         class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent">
                </div>
              </div>
              
              <div class="flex justify-between items-center mt-8 pt-6 border-t border-gray-800">
                <button type="button" onclick="autofillFromURL()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition text-sm">
                  <i class="fas fa-magic mr-2"></i>Auto-fill from URL
                </button>
                <div class="flex space-x-4">
                  <button type="button" onclick="closeAddContent()" class="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition">
                    Cancel
                  </button>
                  <button type="submit" class="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-lg font-semibold transition-all shadow-lg hover:shadow-red-600/30">
                    <i class="fas fa-save mr-2"></i>Add to Library
                  </button>
                </div>
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