// TMDB API Integration for Metadata Enrichment
// =============================================

export interface TMDBContent {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
}

export interface TMDBWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export interface EnrichedContent {
  tmdb_id: string;
  title: string;
  type: 'movie' | 'tv';
  poster_url?: string;
  backdrop_url?: string;
  overview?: string;
  release_year?: number;
  runtime?: number;
  seasons?: number;
  episodes?: number;
  genres?: string[];
  rating?: number;
  providers?: TMDBWatchProvider[];
  stream_urls?: string[];
}

export class TMDBClient {
  private apiKey: string;
  private baseUrl = 'https://api.themoviedb.org/3';
  private imageBaseUrl = 'https://image.tmdb.org/t/p';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search for a movie or TV show by title
   */
  async searchContent(title: string, type: 'movie' | 'tv'): Promise<TMDBContent | null> {
    try {
      const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
      const response = await fetch(
        `${this.baseUrl}/${endpoint}?api_key=${this.apiKey}&query=${encodeURIComponent(title)}`
      );

      if (!response.ok) {
        console.error('TMDB search error:', response.status);
        return null;
      }

      const data = await response.json();
      return data.results?.[0] || null;
    } catch (error) {
      console.error('Error searching TMDB:', error);
      return null;
    }
  }

  /**
   * Get detailed information about a movie or TV show
   */
  async getDetails(id: number, type: 'movie' | 'tv'): Promise<any> {
    try {
      const endpoint = type === 'movie' ? `movie/${id}` : `tv/${id}`;
      const response = await fetch(
        `${this.baseUrl}/${endpoint}?api_key=${this.apiKey}&append_to_response=watch/providers`
      );

      if (!response.ok) {
        console.error('TMDB details error:', response.status);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching TMDB details:', error);
      return null;
    }
  }

  /**
   * Get watch providers for a movie or TV show
   */
  async getWatchProviders(id: number, type: 'movie' | 'tv', region: string = 'US'): Promise<TMDBWatchProvider[]> {
    try {
      const endpoint = type === 'movie' ? `movie/${id}/watch/providers` : `tv/${id}/watch/providers`;
      const response = await fetch(
        `${this.baseUrl}/${endpoint}?api_key=${this.apiKey}`
      );

      if (!response.ok) {
        console.error('TMDB providers error:', response.status);
        return [];
      }

      const data = await response.json();
      const regionData = data.results?.[region];

      if (!regionData) return [];

      // Combine free, ads, and flatrate providers
      const providers = [
        ...(regionData.free || []),
        ...(regionData.ads || []),
        ...(regionData.flatrate || [])
      ];

      // Filter for free streaming services
      const freeProviders = ['Tubi TV', 'Pluto TV', 'The Roku Channel', 'Crackle', 'Plex', 'Peacock', 'Freevee'];
      return providers.filter((p: any) => 
        freeProviders.some(free => p.provider_name?.includes(free))
      );
    } catch (error) {
      console.error('Error fetching watch providers:', error);
      return [];
    }
  }

  /**
   * Get genre name by ID
   */
  async getGenres(): Promise<Map<number, string>> {
    try {
      const [movieGenres, tvGenres] = await Promise.all([
        fetch(`${this.baseUrl}/genre/movie/list?api_key=${this.apiKey}`).then(r => r.json()),
        fetch(`${this.baseUrl}/genre/tv/list?api_key=${this.apiKey}`).then(r => r.json())
      ]);

      const genreMap = new Map<number, string>();
      
      [...(movieGenres.genres || []), ...(tvGenres.genres || [])].forEach((genre: any) => {
        genreMap.set(genre.id, genre.name);
      });

      return genreMap;
    } catch (error) {
      console.error('Error fetching genres:', error);
      return new Map();
    }
  }

  /**
   * Enrich content with TMDB metadata
   */
  async enrichContent(title: string, type: 'movie' | 'tv'): Promise<EnrichedContent | null> {
    // Search for the content
    const searchResult = await this.searchContent(title, type);
    if (!searchResult) return null;

    // Get detailed information
    const details = await this.getDetails(searchResult.id, type);
    if (!details) return null;

    // Get watch providers
    const providers = await this.getWatchProviders(searchResult.id, type);

    // Get genres
    const genreMap = await this.getGenres();
    const genres = details.genres?.map((g: any) => g.name) || 
                   searchResult.genre_ids?.map(id => genreMap.get(id)).filter(Boolean) || [];

    // Build enriched content object
    const enriched: EnrichedContent = {
      tmdb_id: searchResult.id.toString(),
      title: type === 'movie' ? (searchResult.title || title) : (searchResult.name || title),
      type,
      poster_url: searchResult.poster_path 
        ? `${this.imageBaseUrl}/w500${searchResult.poster_path}`
        : undefined,
      backdrop_url: searchResult.backdrop_path
        ? `${this.imageBaseUrl}/w1280${searchResult.backdrop_path}`
        : undefined,
      overview: searchResult.overview,
      release_year: type === 'movie' 
        ? new Date(searchResult.release_date || '').getFullYear()
        : new Date(searchResult.first_air_date || '').getFullYear(),
      rating: searchResult.vote_average,
      genres,
      providers
    };

    // Add type-specific details
    if (type === 'movie' && details) {
      enriched.runtime = details.runtime;
    } else if (type === 'tv' && details) {
      enriched.seasons = details.number_of_seasons;
      enriched.episodes = details.number_of_episodes;
    }

    // Generate potential stream URLs based on providers
    enriched.stream_urls = this.generateStreamUrls(enriched.title, providers);

    return enriched;
  }

  /**
   * Generate potential streaming URLs based on providers
   */
  private generateStreamUrls(title: string, providers: TMDBWatchProvider[]): string[] {
    const urls: string[] = [];
    // Clean title for better search results
    const cleanTitle = title.replace(/[^\w\s]/g, '').toLowerCase().replace(/\s+/g, '-');
    const searchTitle = encodeURIComponent(title);

    // Always add primary free services with working search URLs
    urls.push(`https://tubitv.com/search?q=${searchTitle}`);
    urls.push(`https://www.roku.com/whats-on/search/${searchTitle}`);
    urls.push(`https://pluto.tv/en/search?query=${searchTitle}`);
    
    // Provider-specific URLs if available
    providers.forEach(provider => {
      switch (provider.provider_name) {
        case 'Tubi TV':
          // Tubi uses different URL structure
          urls.push(`https://tubitv.com/search?q=${searchTitle}`);
          break;
        case 'The Roku Channel':
          urls.push(`https://www.roku.com/whats-on/search/${searchTitle}`);
          break;
        case 'Plex':
          urls.push(`https://watch.plex.tv/search?query=${searchTitle}`);
          break;
      }
    });

    // Dedupe URLs
    return [...new Set(urls)];
  }
}

/**
 * Main enrichment function to be called from API route
 */
export async function enrichContentWithTMDB(
  apiKey: string,
  title: string,
  type: 'movie' | 'tv'
): Promise<EnrichedContent | null> {
  const client = new TMDBClient(apiKey);
  return await client.enrichContent(title, type);
}