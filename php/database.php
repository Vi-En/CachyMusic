<?php
// CachyMusic - Zero-Dependency Resilient Database & Storage Connector
// Attempts MySQL connection if mysqli is enabled; seamlessly falls back to SQLite3 / atomic JSON storage.

require_once(__DIR__ . '/platform.php');
require_once(__DIR__ . '/storage.php');

$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbUser = getenv('DB_USER') ?: 'MusicPlayer';
$dbPass = getenv('DB_PASS') ?: 'CachyOS';
$dbName = getenv('DB_NAME') ?: 'MusicPlayer';

$connection = null;

if (function_exists('mysqli_connect')) {
    try {
        $connection = @mysqli_connect($dbHost, $dbUser, $dbPass, $dbName);
        if ($connection && !mysqli_connect_errno()) {
            @mysqli_set_charset($connection, 'utf8mb4');
        } else {
            $connection = null;
        }
    } catch (Throwable $e) {
        $connection = null;
    }
}

Storage::init();
