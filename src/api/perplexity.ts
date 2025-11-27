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
      preferredTypes: { movie: 0, tv: 0 }
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
   */
  private generateSmartQueries(context: any, preferences: any): string[] {
    const queries: string[] = [];

    // Base query for free streaming
    const baseQuery = 'free streaming available on Tubi Pluto Crackle Roku Plex Peacock';

    // Genre-based queries
    Array.from(context.favoriteGenres).forEach(genre => {
      queries.push(`best ${genre} movies ${baseQuery} 2024`);
      queries.push(`hidden gem ${genre} TV shows ${baseQuery}`);
    });

    // Similar to high-rated content
    context.highRatedTitles.slice(0, 3).forEach((title: string) => {
      queries.push(`movies similar to ${title} ${baseQuery}`);
    });

    // Trending content query
    queries.push(`trending movies and shows ${baseQuery} ${new Date().getFullYear()}`);

    // Award-winning content
    queries.push(`award winning movies ${baseQuery} critics choice`);

    return queries.slice(0, 6); // Limit to 6 queries for efficiency
  }

  /**
   * Search for content using Perplexity API
   */
  private async searchForContent(query: string): Promise<DiscoveredContent[]> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'pplx-7b-online', // Using online model for real-time data
          messages: [
            {
              role: 'system',
              content: `You are a streaming content expert. Find FREE streaming movies and TV shows based on the query. 
                       Return a JSON array with: title, type (movie/tv), streamUrl (if found), provider (Tubi/Pluto/etc).
                       Focus ONLY on content that is currently available for FREE streaming.`
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          stream: false
        })
      });

      if (!response.ok) {
        console.error('Perplexity API error:', response.status);
        return [];
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) return [];

      // Parse the response
      try {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // Fallback: extract titles from text response
        return this.extractContentFromText(content);
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