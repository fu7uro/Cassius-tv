# Cassius TV - Your Personal Free Streaming Guide 📺

## Project Overview
- **Name**: Cassius TV
- **Goal**: AI-powered discovery of free streaming content tailored to your personal taste
- **Features**: Smart recommendations, Netflix-style UI, library management, ratings system, iWebTV integration

## 🌐 URLs
- **Production**: https://cassius-tv.pages.dev (Live! 🎉)
- **Deployment**: https://46a50f98.cassius-tv.pages.dev
- **GitHub**: https://github.com/fu7uro/Cassius-tv
- **Development**: https://3000-ivvxdgb7l2aqcwppbtmus-583b4d74.sandbox.novita.ai

## 🎯 Current Features (Completed)

### ✅ Core Infrastructure
- Cloudflare Pages + Hono backend with TypeScript
- D1 SQLite database with comprehensive schema
- Netflix-style responsive UI optimized for mobile/iPad
- PM2 process management for development

### ✅ Content Discovery Engine
- **Perplexity AI Integration**: Searches for free streaming content based on your preferences
- **TMDB Metadata Enrichment**: Fetches posters, descriptions, ratings, and streaming availability
- **Smart Query Generation**: Creates targeted searches based on your library and ratings
- **Provider Detection**: Identifies free streaming services (Tubi, Pluto, Crackle, Roku, Plex, etc.)

### ✅ Library Management
- Add/remove content to personal library
- Manual content addition with custom URLs
- Category-based organization (Action, Comedy, Drama, etc.)
- Persistent storage in D1 database

### ✅ Rating System
- 5-star rating for all content
- Ratings influence future recommendations
- Visual star ratings on hover

### ✅ iWebTV Integration
- Cast button copies stream URL to clipboard
- Attempts to open iWebTV app directly
- Fallback instructions for manual paste

### ✅ User Interface
- Dark Netflix-style theme
- Responsive card grid layout
- Hover effects with action buttons
- Loading states and notifications
- Mobile-first design for iPad usage

## 📊 Data Architecture
- **Storage**: Cloudflare D1 (SQLite)
- **Tables**: 
  - `content` - Movies and TV shows
  - `ratings` - User ratings
  - `categories` - Content categories
  - `providers` - Streaming services
  - `preferences` - User settings
  - `watch_history` - Viewing history
- **Relationships**: Many-to-many content-categories, one-to-many ratings

## 🚀 Functional Entry Points

### API Endpoints
- `GET /` - Main UI application
- `GET /api/health` - Health check
- `GET /api/preferences` - Get user preferences
- `PUT /api/preferences` - Update preferences
- `GET /api/categories` - List all categories
- `GET /api/library?category=X&type=Y` - Get library content
- `POST /api/library` - Add content to library
- `DELETE /api/library/:id` - Remove from library
- `POST /api/ratings` - Rate content
- `POST /api/discover` - Generate AI recommendations (requires API keys)

### UI Actions
- **Generate Guide** - Discovers 12 movies + 12 TV shows
- **Add Content** - Manually add streaming URLs
- **Play** - Opens stream in new tab
- **Cast** - Copies URL for iWebTV
- **Rate** - 1-5 star rating system
- **Add/Remove Library** - Manage saved content

## 🔧 Configuration Required

### API Keys Setup
Edit `.dev.vars` file and add your API keys:
```bash
PERPLEXITY_API_KEY=your_actual_perplexity_key
TMDB_API_KEY=your_actual_tmdb_key
```

### Database Setup (for production)
1. Create Cloudflare D1 database:
   ```bash
   npx wrangler d1 create cassius-tv-db
   ```
2. Copy the database ID from output
3. Update `wrangler.jsonc` with the ID
4. Apply migrations:
   ```bash
   npm run db:migrate:prod
   ```

## 📝 User Guide

### Getting Started
1. Open the app in your browser
2. Click "Generate Guide" to discover free content
3. Content will be enriched with posters and metadata from TMDB
4. Add favorites to your library for future reference

### Using with iWebTV on iPad
1. Find content you want to watch
2. Click the blue Cast button
3. The stream URL is copied to clipboard
4. iWebTV should open automatically
5. If not, open iWebTV manually and paste the URL

### Managing Your Library
1. Click the + button to add content to library
2. Use the trash icon to remove items
3. Rate content with 1-5 stars
4. Higher ratings improve future recommendations

### Adding Custom Content
1. Click "Add Content" button
2. Enter title and streaming URL
3. Optionally add poster image URL
4. Select a category
5. Submit to save to library

## 🚧 Features Not Yet Implemented

1. **Settings Page UI** - API key configuration through web interface
2. **Search Functionality** - Text search across library
3. **Categories View** - Browse by genre/category
4. **Watch History Tracking** - Track what you've watched
5. **Advanced Filtering** - Filter by year, rating, etc.
6. **Bulk Import** - Import multiple URLs at once
7. **Export/Backup** - Export library to JSON

## 💡 Recommended Next Steps

### High Priority
1. **Configure API Keys**: Add your Perplexity and TMDB keys to `.dev.vars`
2. **Deploy to Cloudflare**: Set up production deployment for iPad access
3. **Test Discovery**: Verify Perplexity finds quality free streams
4. **Refine Prompts**: Tune Perplexity queries for better results

### Medium Priority
1. **Add Search UI**: Implement the search functionality
2. **Settings Page**: Build UI for API key management
3. **Cache Results**: Store discovery results to reduce API calls
4. **Provider Validation**: Verify stream URLs are actually free

### Low Priority
1. **Watch Party**: Share viewing sessions
2. **Recommendations Algorithm**: ML-based recommendations
3. **Social Features**: Share lists with friends
4. **Multiple Profiles**: Support family members

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Local development
npm run dev:sandbox    # Sandbox with public URL
npm run dev:d1        # With D1 database

# Build
npm run build

# Database
npm run db:migrate:local  # Apply migrations locally
npm run db:seed           # Add test data
npm run db:reset          # Reset database

# Deployment
npm run deploy:prod      # Deploy to Cloudflare Pages

# Process Management
pm2 list                 # List running processes
pm2 logs cassius-tv     # View logs
pm2 restart cassius-tv  # Restart server
```

## 🏗️ Tech Stack
- **Backend**: Hono + TypeScript on Cloudflare Workers
- **Frontend**: Vanilla JS + Tailwind CSS
- **Database**: Cloudflare D1 (SQLite)
- **AI**: Perplexity API for discovery
- **Metadata**: TMDB API for enrichment
- **Deployment**: Cloudflare Pages
- **Process Manager**: PM2

## 📦 Deployment Status
- **Platform**: Cloudflare Pages
- **Status**: ✅ LIVE in production!
- **Database**: D1 SQLite (78f7fb6b-751b-4999-b780-381ffb31400f)
- **Last Updated**: November 27, 2025
- **Project**: cassius-tv

## 🎨 Design Philosophy
- **Simplicity First**: No overcomplicated architecture
- **Free Content Focus**: Only recommend genuinely free streams
- **User Control**: You decide what to save and rate
- **Privacy**: All data stays in your own Cloudflare account
- **Mobile Optimized**: Designed for iPad/tablet viewing

## 🤝 Collaboration Notes
This project was rebuilt from scratch after the previous implementation became overcomplicated. The new architecture focuses on:
- Clean separation of concerns
- Minimal dependencies
- Fast performance on edge network
- Easy deployment and maintenance

---

**Created by Brandon (CEO, Futuro Corporation)**
Built with collaborative AI assistance for maximum innovation 🚀