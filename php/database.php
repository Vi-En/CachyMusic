<?php
// Local JSON is authoritative by default. An explicitly configured MySQL
// connection must succeed; never silently switch that profile to local storage.
require_once(__DIR__ . '/platform.php');
require_once(__DIR__ . '/storage.php');

$connection = null;
$dbRequested = getenv('CACHYMUSIC_DB_ENABLED') === '1' || PlaylistSql::enabled();
if ($dbRequested) {
    $dbHost = getenv('DB_HOST');
    $dbUser = getenv('DB_USER');
    $dbPass = getenv('DB_PASS');
    $dbName = getenv('DB_NAME');
    if (function_exists('mysqli_connect') && $dbHost && $dbUser && $dbPass !== false && $dbPass !== '' && $dbName) {
        try {
            $connection = @mysqli_connect($dbHost, $dbUser, $dbPass, $dbName);
            if (!$connection || mysqli_connect_errno() || !@mysqli_set_charset($connection, 'utf8mb4')) $connection = null;
        } catch (Throwable $e) {
            $connection = null;
        }
    }
    unset($dbPass);
    if (!$connection) {
        $message = 'Configured MySQL database unavailable. Check the connection and configuration; local storage was not substituted.';
        if (PHP_SAPI === 'cli') throw new RuntimeException($message);
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(['success'=>false,'message'=>$message]);
        exit;
    }
}
Storage::init();
