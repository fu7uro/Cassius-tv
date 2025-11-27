#!/bin/bash
# Setup Production Secrets for Cassius TV
# Run this script to add your API keys to production

echo "🔐 Setting up production secrets for Cassius TV"
echo "================================================"
echo ""
echo "This will add your API keys to the production deployment."
echo "You'll be prompted to enter each key."
echo ""

# Read the keys from .dev.vars if they exist
if [ -f .dev.vars ]; then
    echo "📝 Found .dev.vars file. Reading keys..."
    source .dev.vars
    
    if [ ! -z "$PERPLEXITY_API_KEY" ]; then
        echo "✅ Perplexity API key found"
        echo "$PERPLEXITY_API_KEY" | npx wrangler pages secret put PERPLEXITY_API_KEY --project-name cassius-tv
    else
        echo "⚠️  Perplexity API key not found in .dev.vars"
        npx wrangler pages secret put PERPLEXITY_API_KEY --project-name cassius-tv
    fi
    
    if [ ! -z "$TMDB_API_KEY" ]; then
        echo "✅ TMDB API key found"
        echo "$TMDB_API_KEY" | npx wrangler pages secret put TMDB_API_KEY --project-name cassius-tv
    else
        echo "⚠️  TMDB API key not found in .dev.vars"
        npx wrangler pages secret put TMDB_API_KEY --project-name cassius-tv
    fi
else
    echo "⚠️  .dev.vars file not found"
    echo "Please run these commands manually:"
    echo ""
    echo "  npx wrangler pages secret put PERPLEXITY_API_KEY --project-name cassius-tv"
    echo "  npx wrangler pages secret put TMDB_API_KEY --project-name cassius-tv"
fi

echo ""
echo "🎉 Production secrets configured!"
echo "🌐 Your app: https://cassius-tv.pages.dev"
echo ""
echo "To verify secrets:"
echo "  npx wrangler pages secret list --project-name cassius-tv"
