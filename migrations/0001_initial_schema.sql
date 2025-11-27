-- Content library table (movies and TV shows)
CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id TEXT UNIQUE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  poster_url TEXT,
  backdrop_url TEXT,
  stream_url TEXT,
  overview TEXT,
  release_year INTEGER,
  runtime INTEGER,
  seasons INTEGER,
  episodes INTEGER,
  genre TEXT,
  source TEXT, -- 'recommendation', 'manual', 'search'
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_watched DATETIME,
  in_library BOOLEAN DEFAULT FALSE,
  watch_count INTEGER DEFAULT 0
);

-- User ratings table
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  rated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#FF0000',
  icon TEXT DEFAULT 'folder',
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Content categories junction table (many-to-many)
CREATE TABLE IF NOT EXISTS content_categories (
  content_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  PRIMARY KEY (content_id, category_id),
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Streaming providers table
CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  base_url TEXT,
  is_free BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0
);

-- Content providers junction table
CREATE TABLE IF NOT EXISTS content_providers (
  content_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  stream_url TEXT NOT NULL,
  quality TEXT DEFAULT 'HD',
  last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (content_id, provider_id),
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- User preferences table
CREATE TABLE IF NOT EXISTS preferences (
  id INTEGER PRIMARY KEY DEFAULT 1,
  perplexity_api_key TEXT,
  tmdb_api_key TEXT,
  auto_refresh BOOLEAN DEFAULT TRUE,
  refresh_interval INTEGER DEFAULT 7, -- days
  last_refresh DATETIME,
  recommendations_per_type INTEGER DEFAULT 12,
  preferred_quality TEXT DEFAULT 'HD',
  ui_theme TEXT DEFAULT 'dark',
  show_adult_content BOOLEAN DEFAULT FALSE
);

-- Watch history table
CREATE TABLE IF NOT EXISTS watch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  progress INTEGER DEFAULT 0, -- percentage watched
  season INTEGER,
  episode INTEGER,
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
CREATE INDEX IF NOT EXISTS idx_content_library ON content(in_library);
CREATE INDEX IF NOT EXISTS idx_ratings_content ON ratings(content_id);
CREATE INDEX IF NOT EXISTS idx_history_content ON watch_history(content_id);
CREATE INDEX IF NOT EXISTS idx_content_categories_content ON content_categories(content_id);
CREATE INDEX IF NOT EXISTS idx_content_categories_category ON content_categories(category_id);

-- Insert default categories
INSERT OR IGNORE INTO categories (name, color, icon, display_order) VALUES 
  ('Action', '#DC2626', 'fire', 1),
  ('Comedy', '#F59E0B', 'face-smile', 2),
  ('Drama', '#7C3AED', 'masks-theater', 3),
  ('Horror', '#991B1B', 'ghost', 4),
  ('Sci-Fi', '#0EA5E9', 'rocket', 5),
  ('Documentary', '#10B981', 'book-open', 6),
  ('Romance', '#EC4899', 'heart', 7),
  ('Thriller', '#6B7280', 'user-secret', 8),
  ('Animation', '#8B5CF6', 'wand-magic-sparkles', 9),
  ('Crime', '#1F2937', 'user-ninja', 10),
  ('Family', '#34D399', 'people-group', 11),
  ('Fantasy', '#A78BFA', 'dragon', 12);

-- Insert default streaming providers
INSERT OR IGNORE INTO providers (name, logo_url, base_url, is_free, priority) VALUES 
  ('Tubi', 'https://cdn.adrise.tv/tubitv-logo.png', 'https://tubitv.com', TRUE, 1),
  ('Pluto TV', 'https://images.pluto.tv/logo.png', 'https://pluto.tv', TRUE, 2),
  ('Crackle', 'https://www.crackle.com/logo.png', 'https://www.crackle.com', TRUE, 3),
  ('Roku Channel', 'https://therokuchannel.roku.com/logo.png', 'https://therokuchannel.roku.com', TRUE, 4),
  ('Plex', 'https://www.plex.tv/logo.png', 'https://watch.plex.tv', TRUE, 5),
  ('Peacock Free', 'https://www.peacocktv.com/logo.png', 'https://www.peacocktv.com', TRUE, 6),
  ('YouTube', 'https://www.youtube.com/logo.png', 'https://www.youtube.com', TRUE, 7),
  ('Freevee', 'https://www.amazon.com/freevee/logo.png', 'https://www.amazon.com/freevee', TRUE, 8);