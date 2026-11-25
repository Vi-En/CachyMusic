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

// This response contains private library paths and can trigger a rescan.
header('Cache-Control: private, no-store');

header('Content-Type: application/json; charset=utf-8');
@require_once(__DIR__ . '/scan.php');

