-- Run exactly once on a backed-up, quiescent existing SQL database. DDL auto-commits.
-- Check all three existing tables use InnoDB; do not run against an unverified schema.
ALTER TABLE Playlists ADD COLUMN revision BIGINT UNSIGNED NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS PlaylistAllocator (singleton INT NOT NULL PRIMARY KEY, highwater INT NOT NULL) ENGINE=InnoDB;
INSERT INTO PlaylistAllocator(singleton,highwater) SELECT 1,COALESCE(MAX(plid),0) FROM Playlists ON DUPLICATE KEY UPDATE highwater=GREATEST(PlaylistAllocator.highwater,VALUES(highwater));
