<?php
// CachyMusic - Tracks API Endpoint
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

require_once(__DIR__ . '/../platform.php');
cachy_send_local_cors('GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Enable transparent gzip compression for large library payloads
if (!in_array('ob_gzhandler', ob_list_handlers(), true) && extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    @ob_start('ob_gzhandler');
}

// Conditional HTTP caching for GET and HEAD requests
if (in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true) && empty($_GET['directory'])) {
    $libFile = __DIR__ . '/../../data/library.json';
    if (file_exists($libFile)) {
        $mtime = filemtime($libFile);
        $etag = '"tracks-' . dechex($mtime) . '-' . dechex(filesize($libFile)) . '"';
        header("ETag: $etag");
        header("Last-Modified: " . gmdate('D, d M Y H:i:s', $mtime) . " GMT");
        header("Cache-Control: public, max-age=60, stale-while-revalidate=300");

        $ifNoneMatch = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
        if (!empty($ifNoneMatch) && trim($ifNoneMatch, '" ') === trim($etag, '" ')) {
            http_response_code(304);
            exit;
        }
    }
}

header('Content-Type: application/json; charset=utf-8');
@require_once(__DIR__ . '/scan.php');

