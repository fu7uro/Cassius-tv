-- Migration 0002: Add sports type and recommendation history tracking

-- First, we need to drop the CHECK constraint on type
-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we'll need to handle this differently
-- For now, just add a new table for recommendation history

-- Recommendation history table (to prevent duplicate recommendations)
CREATE TABLE IF NOT EXISTS recommendation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id TEXT,
  title TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  genre TEXT,
  recommended_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  shown_count INTEGER DEFAULT 1
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_rec_history_tmdb ON recommendation_history(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_rec_history_date ON recommendation_history(recommended_at);

-- Note: To properly support 'sports' type, we need to recreate the content table
-- Since we have data, we'll do this carefully:

-- Step 1: Create new content table with updated constraints
CREATE TABLE IF NOT EXISTS content_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tmdb_id TEXT UNIQUE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('movie', 'tv', 'sports')),
  poster_url TEXT,
  backdrop_url TEXT,
  stream_url TEXT,
  overview TEXT,
  release_year INTEGER,
  runtime INTEGER,
  seasons INTEGER,
  episodes INTEGER,
  genre TEXT,
  source TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_watched DATETIME,
  in_library BOOLEAN DEFAULT FALSE,
  watch_count INTEGER DEFAULT 0
);

-- Step 2: Copy existing data
INSERT INTO content_new 
SELECT * FROM content;

-- Step 3: Drop old table
DROP TABLE content;

-- Step 4: Rename new table
ALTER TABLE content_new RENAME TO content;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
CREATE INDEX IF NOT EXISTS idx_content_library ON content(in_library);
CREATE INDEX IF NOT EXISTS idx_content_genre ON content(genre);
