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
   */
  private generateSmartQueries(context: any, preferences: any): string[] {
    const queries: string[] = [];
    const year = new Date().getFullYear();

    // TIER 1: Primary free streaming services (highest priority)
    const tier1Services = 'Plex Tubi Crackle "Roku Channel" "Pluto TV"';
    
    // TIER 2: Secondary free services
    const tier2Services = 'Peacock-Free Freevee YouTube-Movies Vudu-Free Hoopla Kanopy';

    // If library is empty, use popular/trending queries
    if (context.isEmpty) {
      queries.push(`best highly rated movies free on ${tier1Services} ${year} IMDb 7+ rating`);
      queries.push(`top rated TV shows streaming free ${tier1Services} ${year} critically acclaimed`);
      queries.push(`hidden gem movies free on ${tier1Services} underrated must watch`);
      queries.push(`best action movies free streaming ${tier1Services} ${year}`);
      queries.push(`best comedy movies free on ${tier1Services} ${year}`);
      queries.push(`popular TV shows free ${tier1Services} binge worthy series`);
      queries.push(`classic movies free streaming ${tier1Services} timeless films`);
      queries.push(`best thrillers free on ${tier1Services} ${year} suspenseful`);
      return queries;
    }

    // Build queries based on user's library
    
    // 1. Check primary services for user's favorite content
    if (context.highRatedTitles.length > 0) {
      context.highRatedTitles.slice(0, 2).forEach((title: string) => {
        queries.push(`"${title}" streaming free on ${tier1Services} watch now ${year}`);
      });
    }

    // 2. Genre-specific searches on primary services
    Array.from(context.favoriteGenres).slice(0, 2).forEach(genre => {
      queries.push(`best ${genre} movies streaming free ${tier1Services} available now ${year}`);
      queries.push(`underrated ${genre} TV shows free on ${tier1Services} hidden gems`);
    });

    // 3. Similar content on any free service
    if (context.highRatedTitles.length > 0) {
      queries.push(`movies similar to ${context.highRatedTitles[0]} free streaming ${tier1Services} ${tier2Services}`);
    }

    // 4. Trending on free platforms
    queries.push(`trending now free movies ${tier1Services} most watched ${year}`);

    return queries.slice(0, 8); // Allow more queries for better coverage
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
          model: 'pplx-70b-online', // Using larger model for better accuracy
          messages: [
            {
              role: 'system',
              content: `You are an expert at finding FREE streaming content. Your task is to find movies and TV shows that are CURRENTLY available for free streaming.

CRITICAL REQUIREMENTS:
1. ONLY return content that is 100% FREE to watch (no trials, no subscriptions)
2. Prioritize these services IN ORDER: Plex, Tubi, Crackle, Roku Channel, Pluto TV, Peacock Free, Freevee
3. Include the DIRECT streaming URL when possible (not just the service name)
4. Verify the content is actually available (not just listed)
5. Take your time - accuracy is more important than speed

Return a JSON array with EXACTLY this structure:
[{
  "title": "Exact Title",
  "type": "movie" or "tv",
  "streamUrl": "direct URL to watch (if available)",
  "provider": "Service Name",
  "confidence": 0.0 to 1.0 (how sure you are it's free and available)
}]

If you find a great match on a priority service, that's worth 10 mediocre matches elsewhere.`
            },
            {
              role: 'user',
              content: `${query}

Please search thoroughly and return the BEST free options available right now. Take your time to verify availability.`
            }
          ],
          temperature: 0.3, // Lower temperature for more consistent results
          max_tokens: 2000, // More tokens for detailed responses
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