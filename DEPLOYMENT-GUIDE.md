# Cassius TV - Deployment Guide

## Your GitHub Repo
**URL**: https://github.com/fu7uro/Cassius-tv

## What's in the Repo (This is CORRECT)
```
Cassius-tv/
├── src/                    # ✅ Backend TypeScript code
│   ├── index.tsx          # Main Hono app
│   ├── api/
│   │   ├── perplexity.ts  # AI discovery
│   │   └── tmdb.ts        # Metadata enrichment
│   └── renderer.tsx       # SSR renderer
├── public/static/         # ✅ Frontend files
│   ├── app.js            # UI JavaScript
│   └── style.css         # Custom styles
├── migrations/           # ✅ Database schema
│   └── 0001_initial_schema.sql
├── package.json          # ✅ Dependencies
├── wrangler.jsonc        # ✅ Cloudflare config
└── Other config files    # ✅ All configs
```

## What's NOT in Repo (This is CORRECT)
- `node_modules/` - You install these with `npm install`
- `dist/` - You build these with `npm run build`
- `.dev.vars` - Your API keys (keep private!)
- `.wrangler/` - Local dev cache

## Deployment Steps

### Option A: Deploy from GitHub (Recommended)
```bash
# 1. Clone your repo
git clone https://github.com/fu7uro/Cassius-tv.git
cd Cassius-tv

# 2. Install dependencies
npm install

# 3. Create .dev.vars with your API keys
cat > .dev.vars << 'KEYS'
PERPLEXITY_API_KEY=your_perplexity_key
TMDB_API_KEY=your_tmdb_key
KEYS

# 4. Build the project
npm run build

# 5. Test locally
npm run dev:sandbox

# 6. Deploy to Cloudflare
npm run deploy:prod
```

### Option B: Quick Local Test
```bash
# If you're already in this sandbox:
cd /home/user/webapp
npm run build
pm2 start ecosystem.config.cjs
```

## Your API Keys
You already added these to `.dev.vars` in the sandbox:
- ✅ PERPLEXITY_API_KEY
- ✅ TMDB_API_KEY

## Current Status
- ✅ Code pushed to GitHub
- ✅ Logo integrated
- ✅ Red/silver UI theme
- ✅ Smart discovery ready
- ⏳ Need to test with real API keys
- ⏳ Need to deploy to Cloudflare

## Quick Test
To verify everything works:
1. Make sure API keys are in `.dev.vars`
2. Run `npm run build && pm2 restart cassius-tv`
3. Click "Generate Guide" in the UI
4. Watch it discover free streams!

## Cloudflare Deployment
When ready:
1. Get Cloudflare API token
2. Create D1 database: `npx wrangler d1 create cassius-tv-db`
3. Update `wrangler.jsonc` with database ID
4. Deploy: `npm run deploy:prod`
5. Set up custom domain in Cloudflare

---
Built with ❤️ for Brandon & Family
