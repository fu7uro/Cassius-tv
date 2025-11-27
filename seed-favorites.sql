-- Brandon's favorite movies and TV shows for recommendations

-- Movies
INSERT INTO content (title, type, genre, source, in_library) VALUES
('Primal Fear', 'movie', 'Thriller, Drama', 'seed', TRUE),
('Inception', 'movie', 'Sci-Fi, Thriller', 'seed', TRUE),
('Goodfellas', 'movie', 'Crime, Drama', 'seed', TRUE),
('The Rock', 'movie', 'Action, Thriller', 'seed', TRUE),
('The Usual Suspects', 'movie', 'Crime, Mystery, Thriller', 'seed', TRUE),
('The Godfather', 'movie', 'Crime, Drama', 'seed', TRUE),
('Scarface', 'movie', 'Crime, Drama', 'seed', TRUE),
('V for Vendetta', 'movie', 'Action, Thriller, Drama', 'seed', TRUE),
('Animal House', 'movie', 'Comedy', 'seed', TRUE);

-- TV Shows
INSERT INTO content (title, type, genre, source, in_library) VALUES
('Breaking Bad', 'tv', 'Crime, Drama, Thriller', 'seed', TRUE),
('Sons of Anarchy', 'tv', 'Crime, Drama', 'seed', TRUE),
('Prison Break', 'tv', 'Action, Thriller', 'seed', TRUE),
('Dexter', 'tv', 'Crime, Drama, Thriller', 'seed', TRUE),
('Criminal Minds', 'tv', 'Crime, Drama, Mystery', 'seed', TRUE);

-- Add high ratings (5 stars) for all seed content to influence recommendations
INSERT INTO ratings (content_id, rating)
SELECT id, 5 FROM content WHERE source = 'seed';
