<?php
// CachyMusic - Dedicated High-Performance Cover Artwork Endpoint
// Serves embedded album artwork and lightweight thumbnails with persistent disk & HTTP caching

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

require_once(__DIR__ . '/../platform.php');
require_once(__DIR__ . '/../artwork_store.php');
require_once(__DIR__ . '/../cover_cache_budget.php');
require_once(__DIR__ . '/../cover_extract.php');
require_once(__DIR__ . '/../cover_jobs.php');
cachy_send_local_cors('GET, HEAD, OPTIONS');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'HEAD'], true)) { header('Allow: GET, HEAD, OPTIONS'); http_response_code(405); exit; }
$tid = array_key_exists('tid', $_GET) ? cachy_positive_id($_GET['tid']) : null;
$path = $_GET['path'] ?? '';
if ((array_key_exists('tid', $_GET) && $tid === null) || !is_string($path) || strlen($path)>4096 || str_contains($path, "\0") || ($tid !== null && $path !== '') || (isset($_GET['thumb']) && !is_string($_GET['thumb'])) || (isset($_GET['v']) && !is_string($_GET['v']))) {
    http_response_code(400); header('Cache-Control: no-store'); exit;
}
$isThumb = isset($_GET['thumb']) && $_GET['thumb'] !== '0' && $_GET['thumb'] !== 'false';
$deferred=CachyScanJob::session()!==null;
$polling=$deferred&&($_GET['defer']??null)==='1';
function cm_cover_request_job(string $key,string $path,?int $tid,bool $thumb,string $kind): bool {
    try {return cm_cover_job_enqueue(['key'=>$key,'path'=>$path,'tid'=>$tid,'thumb'=>$thumb,'kind'=>$kind]);} catch (Throwable $e) {return false;}
}
function cm_cover_pending(bool $accepted): never {
    http_response_code($accepted?202:503);header('Cache-Control: no-store');header('Retry-After: 1');header('Content-Type: text/plain');exit;
}


// Cache contents and sidecars are untrusted input, never arbitrary file responses.
function cachy_send_image(array $image, string $etag): void {
    header('Cache-Control: private, no-cache'); header('ETag: ' . $etag);
    if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
    header('Content-Type: ' . $image['mime']); header('Content-Length: ' . strlen($image['bytes']));
    echo $image['bytes']; exit;
}

function cachy_send_default_cover() {
    http_response_code(200);
    header('Content-Type: image/svg+xml; charset=UTF-8');
    header('Cache-Control: private, no-cache');
    readfile(__DIR__ . '/../../resources/images/default.svg');
    exit;
}

// A single local library snapshot supplies both identity and authorization.
// The committed reference takes precedence over all disposable caches.
require_once(__DIR__ . '/../database.php');
require_once(__DIR__ . '/../cover_index.php');
require_once(__DIR__ . '/../media_access.php');
$data = cm_cover_snapshot($tid);
if (!isset($data['tracks'])) { http_response_code(503); header('Cache-Control: no-store'); exit; }

$cacheDir = cachy_cache_dir() . DIRECTORY_SEPARATOR . 'covers';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0775, true);
}

// Resolve the actual recording before consulting any disposable cache.
// Legacy tid_* aliases are intentionally ignored: they are not source-bound.
$fullPath = '';
$mysql = Storage::hasMySQL();
if ($tid !== null) {
    $record = $data['tracks'][(string)$tid] ?? null;
    $stored = $mysql ? Storage::getTrackPath($tid) : cm_media_record_path($record);
    if (is_string($stored) && $stored !== '' && !str_contains($stored, "\0")) $fullPath = realpath($stored) ?: '';
} elseif ($path !== '') {
    $fullPath = realpath($path) ?: '';
}
if ($fullPath !== '' && (!is_file($fullPath) || !is_readable($fullPath))) $fullPath = '';

$allowedRoots=cm_media_roots($data,$mysql);
if ($fullPath!==''&&!cm_media_path_allowed($fullPath,$allowedRoots)) {http_response_code(403);exit('Access denied: unauthorized artwork path.');}

if (empty($fullPath) || !file_exists($fullPath)) {
    http_response_code(404);
    header('Content-Type: image/svg+xml');
    readfile(__DIR__ . '/../../resources/images/default.svg');
    exit;
}

if (!in_array(strtolower(pathinfo($fullPath, PATHINFO_EXTENSION)), ['mp3','wav','wave','ogg','oga','flac','m4a','aac','opus','wma','aiff','aif','alac','mp4'], true)) { http_response_code(403); exit; }
if ($tid !== null) {
    $track = $data['tracks'][(string)$tid] ?? null;
    if ($mysql && cm_media_record_path($track)!==$stored) $track=null;
    if ($track !== null && !is_array($track)) { http_response_code(503); header('Cache-Control: no-store'); exit; }
    if ($track === null && (isset($_GET['v']) || is_dir(cm_artwork_dir($tid)))) { http_response_code(404); header('Cache-Control: no-store'); exit; }
    if (is_array($track) && array_key_exists('artwork_hash', $track)) {
        $hash = $track['artwork_hash'];
        $art = is_string($hash) ? cm_artwork_read($tid, $hash) : null;
        if ($art === null) { http_response_code(503); header('Cache-Control: no-store'); exit; }
        // Thumbnails are disposable derivatives of the exact committed hash.
        // Never publish a partial thumbnail or let cache failure hide user data.
        $etag = '"artwork-' . $hash . '"';
        if ($isThumb) {
            try {
                $thumbDir = cachy_cache_dir() . DIRECTORY_SEPARATOR . 'covers';
                if (cachy_ensure_dir($thumbDir)) {
                    $thumb = $thumbDir . '/edit-' . $hash . '-128.jpg';
                    if (!is_link($thumbDir)) {
                        $image=$deferred?cachy_cover_read($thumb):cachy_cover_thumb(cm_artwork_dir($tid) . '/' . $hash . '.img', $thumb);
                        if ($deferred&&(!$image||$image['mime']!=='image/jpeg'||max($image['width'],$image['height'])>128)) {cm_cover_request_job($hash,$fullPath,$tid,true,'committed');$image=null;}
                        if ($image) cachy_send_image($image, '"artwork-' . $hash . '-128"');
                    }
                }
            } catch (Throwable $e) { /* full committed image remains available */ }
        }
        header('Cache-Control: private, no-cache');
        header('ETag: ' . $etag);
        if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
        header('Content-Type: ' . $art['mime']);
        header('Content-Length: ' . strlen($art['bytes']));
        echo $art['bytes']; exit;
    }
}

if (is_link($cacheDir) || !is_dir($cacheDir)) { cachy_send_default_cover(); }
// Include sidecar presence and identity, not only the audio mtime. A new or
// removed folder cover must invalidate negative and positive cache entries.
$source=cm_cover_source($fullPath);
if ($source===null) { http_response_code(404); exit; }
$cacheHash=$source['hash'];
$cacheFull = $cacheDir . '/' . $cacheHash . '.img';
$cacheThumb = $cacheDir . '/' . $cacheHash . '_thumb.jpg';
$cacheNone = $cacheDir . '/' . $cacheHash . '.none';
if (cm_cover_cache_stat($cacheNone)!==null && filesize($cacheNone)===0) cachy_send_default_cover();
function cachy_cover_deliver(array $image, string $cacheFull, string $cacheThumb, bool $isThumb): void {
    $hash = hash('sha256', $image['bytes']);
    if ($isThumb) {
        $thumb = cachy_cover_thumb($cacheFull, $cacheThumb);
        if ($thumb) cachy_send_image($thumb, '"cover-' . hash('sha256', $thumb['bytes']) . '-128"');
    }
    cachy_send_image($image, '"cover-' . $hash . '"');
}
$cached = cachy_cover_read($cacheFull);
if ($cached) {
    if ($deferred && $isThumb) {
        $thumb=cachy_cover_read($cacheThumb);
        if ($thumb&&$thumb['mime']==='image/jpeg'&&max($thumb['width'],$thumb['height'])<=128) cachy_send_image($thumb,'"cover-'.hash('sha256',$thumb['bytes']).'-128"');
        cm_cover_request_job($cacheHash,$fullPath,$tid,true,'source');
        cachy_send_image($cached,'"cover-'.hash('sha256',$cached['bytes']).'"');
    }
    cachy_cover_deliver($cached,$cacheFull,$cacheThumb,$isThumb);
}
if ($deferred) {
    $accepted=cm_cover_request_job($cacheHash,$fullPath,$tid,$isThumb,'source');
    if ($polling) cm_cover_pending($accepted);
    // An uncontrolled image element cannot interpret the polling protocol.
    // Return a non-cacheable placeholder instead of blocking the audio server.
    header('Cache-Control: no-store');header('Retry-After: 1');
    header('Content-Type: image/svg+xml; charset=UTF-8');
    readfile(__DIR__ . '/../../resources/images/default.svg');exit;
}

try { $image=cm_cover_extract($fullPath,$source); }
catch (Throwable $e) {http_response_code(409);header('Cache-Control: no-store');exit;}
if ($image) {
    // Cache publication failure must not make the original image disappear.
    if (!is_link($cacheFull) && cm_cover_cache_publish($cacheFull, $image['bytes'])) cachy_cover_deliver($image, $cacheFull, $cacheThumb, $isThumb);
    cachy_send_image($image, '"cover-' . hash('sha256', $image['bytes']) . '"');
}
if (!is_link($cacheNone)) cm_cover_cache_publish($cacheNone,'');
cachy_send_default_cover();
