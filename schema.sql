-- ==============================================================================
-- CachyMusic Workstation Database Schema
-- Database: MusicPlayer
-- Character Set: utf8mb4 / utf8mb4_unicode_ci
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `MusicPlayer` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `MusicPlayer`;

-- ------------------------------------------------------------------------------
-- Table: Accounts
-- User accounts for workstation access
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Accounts` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table: DefaultDirectory
-- Tracks the user's active/default music library directory path
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `DefaultDirectory` (
  `ddid` TINYINT(4) NOT NULL DEFAULT 1,
  `default_directory` VARCHAR(500) NOT NULL,
  PRIMARY KEY (`ddid`),
  CONSTRAINT `chk_single_row` CHECK (`ddid` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table: Tracks
-- Audio file metadata cache for instant (<50ms) workstation loading
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Tracks` (
  `tid` INT(11) NOT NULL AUTO_INCREMENT,
  `file_path` VARCHAR(500) NOT NULL,
  `full_path` VARCHAR(1000) DEFAULT NULL,
  `title` VARCHAR(255) DEFAULT NULL,
  `artist` VARCHAR(255) DEFAULT NULL,
  `album` VARCHAR(255) DEFAULT NULL,
  `genre` VARCHAR(100) DEFAULT NULL,
  `year` INT(11) DEFAULT NULL,
  `track_num` VARCHAR(50) DEFAULT NULL,
  `duration` FLOAT DEFAULT 0,
  `bitrate` INT(11) DEFAULT NULL,
  `sample_rate` INT(11) DEFAULT NULL,
  `channels` INT(11) DEFAULT NULL,
  `format` VARCHAR(50) DEFAULT NULL,
  `file_size` BIGINT(20) DEFAULT 0,
  `mtime` BIGINT(20) DEFAULT 0,
  `has_cover` TINYINT(1) DEFAULT 0,
  `lyrics` MEDIUMTEXT DEFAULT NULL,
  PRIMARY KEY (`tid`),
  UNIQUE KEY `file_path` (`file_path`),
  KEY `idx_full_path` (`full_path`(255)),
  KEY `idx_mtime` (`mtime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table: Playlists
-- User-created playlists
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Playlists` (
  `plid` INT(11) NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(50) DEFAULT 'default',
  `playlist_name` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`plid`),
  UNIQUE KEY `playlist_name` (`playlist_name`),
  KEY `idx_user_playlist` (`username`, `playlist_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table: PlaylistTracks
-- Maps tracks into ordered playlist positions
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `PlaylistTracks` (
  `ptid` INT(11) NOT NULL AUTO_INCREMENT,
  `plid` INT(11) NOT NULL,
  `tid` INT(11) NOT NULL,
  `position` INT(11) NOT NULL,
  PRIMARY KEY (`ptid`),
  KEY `plid` (`plid`),
  KEY `tid` (`tid`),
  CONSTRAINT `fk_pltracks_playlist` FOREIGN KEY (`plid`) REFERENCES `Playlists` (`plid`) ON DELETE CASCADE,
  CONSTRAINT `fk_pltracks_track` FOREIGN KEY (`tid`) REFERENCES `Tracks` (`tid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- Table: SoulseekAccount
-- Stores Soulseek / Nicotine+ configuration and encrypted credentials
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `SoulseekAccount` (
  `id` TINYINT(4) NOT NULL DEFAULT 1,
  `username` VARCHAR(100) NOT NULL DEFAULT '',
  `password` TEXT NOT NULL DEFAULT '',
  `is_powered_on` TINYINT(1) NOT NULL DEFAULT 0,
  `downloads_dir` VARCHAR(500) NOT NULL DEFAULT '',
  `shared_dir` VARCHAR(500) NOT NULL DEFAULT '',
  `last_updated` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_single_slsk` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

