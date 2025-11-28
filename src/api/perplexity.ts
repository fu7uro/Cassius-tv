// Perplexity API Integration for Content Discovery
// ================================================

export interface DiscoveryOptions {
  userLibrary: any[];
  ratings: any[];
  preferences: any;
  count?: number;
}

export interface DiscoveredContent {
  title: string;
  type: 'movie' | 'tv';
  streamUrl?: string;
  provider?: string;
  confidence: number;
}

export class PerplexityDiscovery {
  private apiKey: string;
  private baseUrl = 'https://api.perplexity.ai';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate personalized content recommendations
   */
  async discoverContent(options: DiscoveryOptions): Promise<DiscoveredContent[]> {
    const { userLibrary, ratings, preferences, count = 12 } = options;

    // Build context from user's library and ratings
    const context = this.buildUserContext(userLibrary, ratings);

    // Generate search queries based on user preferences
    const queries = this.generateSmartQueries(context, preferences);

    // Execute searches in parallel
    const searchPromises = queries.map(query => this.searchForContent(query));
    const searchResults = await Promise.all(searchPromises);

    // Flatten and deduplicate results
    const allContent = this.deduplicateContent(searchResults.flat());

    // Score and rank content
    const rankedContent = this.rankContent(allContent, context);

    // Return top N results
    return rankedContent.slice(0, count);
  }

  /**
   * Build user context from library and ratings
   */
  private buildUserContext(library: any[], ratings: any[]) {
    const context = {
      favoriteGenres: new Set<string>(),
      highRatedTitles: [] as string[],
      lowRatedTitles: [] as string[],
      preferredTypes: { movie: 0, tv: 0 },
      isEmpty: library.length === 0
    };

    // Analyze library
    library.forEach(item => {
      if (item.genre) {
        context.favoriteGenres.add(item.genre);
      }
      context.preferredTypes[item.type as 'movie' | 'tv']++;
    });

    // Analyze ratings
    ratings.forEach(rating => {
      const content = library.find(item => item.id === rating.content_id);
      if (content) {
        if (rating.rating >= 4) {
          context.highRatedTitles.push(content.title);
        } else if (rating.rating <= 2) {
          context.lowRatedTitles.push(content.title);
        }
      }
    });

    return context;
  }

  /**
   * Generate smart search queries based on user context
   * FOCUS: Get actual movie/show TITLES, not streaming platform names
   * NEVER mention streaming platforms - focus only on content quality
   */
  private generateSmartQueries(context: any, preferences: any): string[] {
    const queries: string[] = [];
    const year = new Date().getFullYear();

    // If library is empty, get popular content titles
    if (context.isEmpty) {
      queries.push(`What are 12 highly rated movies from ${year-5} to ${year} with IMDb rating 7.0 or higher? Give me just the movie titles.`);
      queries.push(`What are 12 critically acclaimed TV shows from ${year-3} to ${year}? Give me just the show titles.`);
      queries.push(`What are 8 underrated hidden gem movies that film critics love? Give me just the movie titles.`);
      queries.push(`What are 8 must-watch thriller movies from ${year-5} to ${year}? Give me just the movie titles.`);
      return queries;
    }

    // Build queries based on user's library and ratings
    
    // 1. Movies similar to user's favorites (based on user's 4-5 star ratings)
    if (context.highRatedTitles.length > 0) {
      const topFavorite = context.highRatedTitles[0];
      queries.push(`What are 12 movies similar to "${topFavorite}" with same genre and themes? Give me just the movie titles.`);
      
      if (context.highRatedTitles.length > 1) {
        const secondFavorite = context.highRatedTitles[1];
        queries.push(`What are 12 movies like "${secondFavorite}" that fans would enjoy? Give me just the movie titles.`);
      }
    }

    // 2. Genre-based recommendations from favorite genres
    Array.from(context.favoriteGenres).slice(0, 2).forEach(genre => {
      queries.push(`What are 12 best ${genre} movies from ${year-10} to ${year}? Give me just the movie titles.`);
      queries.push(`What are 8 highly rated ${genre} TV shows worth watching? Give me just the show titles.`);
    });

    // 3. Recent popular content in user's preferred genres
    if (context.favoriteGenres.size > 0) {
      const topGenre = Array.from(context.favoriteGenres)[0];
      queries.push(`What are 12 recent ${topGenre} movies from ${year-2} to ${year} with great reviews? Give me just the movie titles.`);
    }

    // 4. If user has low-rated content, avoid similar content
    if (context.lowRatedTitles.length > 0) {
      console.log(`[Context] User dislikes: ${context.lowRatedTitles.join(', ')}`);
    }

    return queries.slice(0, 6); // Reduced queries for better focus
  }

  /**
   * Search for content using Perplexity API
   */
  private async searchForContent(query: string): Promise<DiscoveredContent[]> {
    console.log(`[Perplexity] Searching: ${query}`);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar', // Using current Perplexity model
          messages: [
            {
              role: 'system',
              content: `You are a movie and TV show recommendation expert. Your ONLY job is to recommend SPECIFIC movie and TV show TITLES.

CRITICAL RULES - FOLLOW EXACTLY:
1. Return ONLY actual movie/TV show titles (e.g., "The Godfather", "Breaking Bad", "Inception")
2. DO NOT return streaming platform names (NO "Plex", "Tubi", "Netflix", "Amazon", etc.)
3. DO NOT return search terms, category names, or lists (NO "Best Action Movies", "Top 10")
4. Each title must be a real, specific, watchable piece of content
5. Focus on high-quality recommendations based on user's taste
6. Ignore any mentions of streaming services in the user query - focus only on finding great titles

Return a JSON array with EXACTLY this structure:
[{
  "title": "Exact Movie/Show Title",
  "type": "movie" or "tv",
  "confidence": 0.9
}]

EXAMPLES OF PERFECT RESPONSES:
✅ "The Shawshank Redemption" (movie)
✅ "Inception" (movie)
✅ "Breaking Bad" (TV show)
✅ "The Wire" (TV show)
✅ "Parasite" (movie)
✅ "The Godfather" (movie)

EXAMPLES OF TERRIBLE RESPONSES (NEVER DO THIS):
❌ "Plex Movies"
❌ "Tubi Free Content"
❌ "Best Action Movies"
❌ "Streaming Platforms"
❌ "Netflix Originals"
❌ "Top 10 Thrillers"
❌ "Free Streaming Content"

If the user mentions streaming platforms, IGNORE those mentions and focus ONLY on great movie/show titles.`
            },
            {
              role: 'user',
              content: `${query}

Remember: Return ONLY specific movie/TV show titles, not platform names or categories.`
            }
          ],
          temperature: 0.3, // Lower temperature for more consistent results
          max_tokens: 2000, // More tokens for detailed responses
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Perplexity] API error ${response.status}:`, errorText);
        return [];
      }

      const data = await response.json();
      console.log('[Perplexity] Raw API response:', JSON.stringify(data, null, 2).substring(0, 500));
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.error('[Perplexity] No content in response');
        return [];
      }

      console.log('[Perplexity] Content received:', content);

      // Parse the response
      try {
        const parsed = JSON.parse(content);
        const results = Array.isArray(parsed) ? parsed : [];
        console.log(`[Perplexity] Successfully parsed ${results.length} titles:`, results.map(r => r.title).join(', '));
        return results;
      } catch (parseError) {
        console.error('[Perplexity] Failed to parse JSON, using text fallback:', parseError);
        console.log('[Perplexity] Raw content:', content);
        // Fallback: extract titles from text response
        const extracted = this.extractContentFromText(content);
        console.log(`[Perplexity] Extracted ${extracted.length} titles from text`);
        return extracted;
      }
    } catch (error) {
      console.error('Error searching for content:', error);
      return [];
    }
  }

  /**
   * Extract content from plain text response
   */
  private extractContentFromText(text: string): DiscoveredContent[] {
    const content: DiscoveredContent[] = [];
    
    // Simple pattern matching for movie/show titles
    const lines = text.split('\n');
    lines.forEach(line => {
      // Look for patterns like "1. Title (Year)" or "- Title"
      const match = line.match(/(?:\d+\.|[-•])\s*(.+?)(?:\s*\((\d{4})\))?(?:\s*-\s*(.+))?$/);
      if (match) {
        const title = match[1].trim();
        const provider = match[3]?.trim();
        
        // Guess type based on keywords
        const isTV = /series|show|season/i.test(line);
        
        content.push({
          title,
          type: isTV ? 'tv' : 'movie',
          provider,
          confidence: 0.7
        });
      }
    });

    return content;
  }

  /**
   * Deduplicate content by title
   */
  private deduplicateContent(content: DiscoveredContent[]): DiscoveredContent[] {
    const seen = new Set<string>();
    return content.filter(item => {
      const key = `${item.title.toLowerCase()}_${item.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Rank content based on user preferences and confidence
   */
  private rankContent(content: DiscoveredContent[], context: any): DiscoveredContent[] {
    return content.sort((a, b) => {
      // Prefer content with stream URLs
      if (a.streamUrl && !b.streamUrl) return -1;
      if (!a.streamUrl && b.streamUrl) return 1;

      // Sort by confidence
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }
}

/**
 * Main discovery function to be called from API route
 */
export async function discoverContentWithPerplexity(
  apiKey: string,
  userLibrary: any[],
  ratings: any[],
  preferences: any
): Promise<DiscoveredContent[]> {
  const discovery = new PerplexityDiscovery(apiKey);
  
  return await discovery.discoverContent({
    userLibrary,
    ratings,
    preferences,
    count: preferences.recommendations_per_type || 12
  });
}