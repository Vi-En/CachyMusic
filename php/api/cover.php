<?php
// CachyMusic - Dedicated High-Performance Cover Artwork Endpoint
// Serves embedded album artwork and lightweight thumbnails with persistent disk & HTTP caching

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!empty($origin)) {
    $parsed = parse_url($origin);
    $host = $parsed['host'] ?? '';
    $serverHost = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), PHP_URL_HOST);
    if (in_array($host, ['localhost', '127.0.0.1', '::1'], true) || $host === $serverHost) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    }
}

// Persistent cache directory (survives reboots)
$cacheDir = __DIR__ . '/../../data/covers';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0775, true);
}
if (!is_writable($cacheDir)) {
    $xdg = getenv('XDG_CACHE_HOME') ?: (getenv('HOME') ? (getenv('HOME') . '/.cache') : sys_get_temp_dir());
    $cacheDir = $xdg . '/cachymusic_covers';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0775, true);
    }
}

$tid = isset($_GET['tid']) ? (int)$_GET['tid'] : 0;
$path = $_GET['path'] ?? '';
$isThumb = isset($_GET['thumb']) && $_GET['thumb'] !== '0' && $_GET['thumb'] !== 'false';

// -------------------------------------------------------------------------
// FAST-PATH: Direct zero-database cache hit by Track ID (Sub-millisecond)
// -------------------------------------------------------------------------
if ($tid > 0) {
    if ($isThumb) {
        $fastThumb = $cacheDir . '/tid_' . $tid . '_thumb.jpg';
        if (file_exists($fastThumb) && filesize($fastThumb) > 0) {
            $etag = '"tid-' . $tid . '-thumb-' . filemtime($fastThumb) . '"';
            if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
                http_response_code(304);
                exit;
            }
            header("Content-Type: image/jpeg");
            header("Cache-Control: public, max-age=31536000, immutable");
            header("ETag: $etag");
            header("Content-Length: " . filesize($fastThumb));
            readfile($fastThumb);
            exit;
        }
    } else {
        $fastFull = $cacheDir . '/tid_' . $tid . '.img';
        $fastMime = $cacheDir . '/tid_' . $tid . '.mime';
        if (file_exists($fastFull) && filesize($fastFull) > 0) {
            $mime = (file_exists($fastMime) ? trim(file_get_contents($fastMime)) : null) ?: 'image/jpeg';
            $etag = '"tid-' . $tid . '-full-' . filemtime($fastFull) . '"';
            if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
                http_response_code(304);
                exit;
            }
            header("Content-Type: $mime");
            header("Cache-Control: public, max-age=31536000, immutable");
            header("ETag: $etag");
            header("Content-Length: " . filesize($fastFull));
            readfile($fastFull);
            exit;
        }
    }
}

// -------------------------------------------------------------------------
// SLOW-PATH: Path resolution, sandbox check, and on-demand extraction
// -------------------------------------------------------------------------
require_once(__DIR__ . '/../database.php');

$fullPath = '';
if ($tid > 0) {
    $fullPath = Storage::getTrackPath($tid) ?: '';
}

if (empty($fullPath) && !empty($path)) {
    $real = realpath($path);
    if ($real && is_file($real) && is_readable($real)) {
        $fullPath = $real;
    }
}

// Security: Sandbox boundary check
$projectRoot = realpath(__DIR__ . '/../../');
$allowedRoots = [
    realpath($projectRoot . '/resources/audio'),
    realpath($projectRoot . '/downloads'),
];

$defaultDir = Storage::getDefaultDirectory();
if ($defaultDir && is_dir($defaultDir)) {
    $realDef = realpath($defaultDir);
    if ($realDef) $allowedRoots[] = $realDef;
}
$slskAcc = Storage::getSoulseekAccount();
if (!empty($slskAcc['downloads_dir'])) {
    $slskDown = realpath($slskAcc['downloads_dir']);
    if ($slskDown && is_dir($slskDown)) $allowedRoots[] = $slskDown;
}
if (!empty($slskAcc['shared_dir'])) {
    $slskShare = realpath($slskAcc['shared_dir']);
    if ($slskShare && is_dir($slskShare)) $allowedRoots[] = $slskShare;
}

$userHome = getenv('HOME') ?: ($_SERVER['HOME'] ?? (getenv('USER') ? '/home/' . getenv('USER') : ''));
if ($userHome) {
    if (is_dir($userHome . '/Music/Main')) {
        $mainMusic = realpath($userHome . '/Music/Main');
        if ($mainMusic) $allowedRoots[] = $mainMusic;
    }
    if (is_dir($userHome . '/Music')) {
        $systemMusic = realpath($userHome . '/Music');
        if ($systemMusic) $allowedRoots[] = $systemMusic;
    }
    if (is_dir($userHome . '/Downloads')) {
        $downMusic = realpath($userHome . '/Downloads');
        if ($downMusic) $allowedRoots[] = $downMusic;
    }
}
$allowedRoots = array_values(array_unique(array_filter($allowedRoots)));

if (!empty($fullPath)) {
    $isPathAllowed = false;
    foreach ($allowedRoots as $root) {
        if ($root && ($fullPath === $root || strpos($fullPath, rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR) === 0)) {
            $isPathAllowed = true;
            break;
        }
    }
    if (!$isPathAllowed) {
        http_response_code(403);
        exit('Access denied: unauthorized artwork path.');
    }
}

if (empty($fullPath) || !file_exists($fullPath)) {
    http_response_code(404);
    header('Content-Type: image/svg+xml');
    readfile(__DIR__ . '/../../resources/images/default.svg');
    exit;
}

$cacheHash = md5($fullPath . '_' . filemtime($fullPath));
$cacheFull = $cacheDir . '/' . $cacheHash . '.img';
$cacheThumb = $cacheDir . '/' . $cacheHash . '_thumb.jpg';
$cacheMime = $cacheDir . '/' . $cacheHash . '.mime';

// Check if hash-based cache files already exist
if (file_exists($cacheFull) && filesize($cacheFull) > 0) {
    // Generate thumbnail if missing
    if (!file_exists($cacheThumb) || filesize($cacheThumb) === 0) {
        $thumbCmd = "ffmpeg -y -v quiet -i " . escapeshellarg($cacheFull) . " -vf \"scale=128:128:force_original_aspect_ratio=decrease\" -q:v 3 -f image2 " . escapeshellarg($cacheThumb) . " 2>/dev/null";
        @exec($thumbCmd);
    }
    // Link by tid for future fast-path hits
    if ($tid > 0) {
        if (!file_exists($cacheDir . '/tid_' . $tid . '.img')) @copy($cacheFull, $cacheDir . '/tid_' . $tid . '.img');
        if (file_exists($cacheMime) && !file_exists($cacheDir . '/tid_' . $tid . '.mime')) @copy($cacheMime, $cacheDir . '/tid_' . $tid . '.mime');
        if (file_exists($cacheThumb) && !file_exists($cacheDir . '/tid_' . $tid . '_thumb.jpg')) @copy($cacheThumb, $cacheDir . '/tid_' . $tid . '_thumb.jpg');
    }

    if ($isThumb && file_exists($cacheThumb) && filesize($cacheThumb) > 0) {
        $etag = '"' . $cacheHash . '-thumb"';
        if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
            http_response_code(304);
            exit;
        }
        header("Content-Type: image/jpeg");
        header("Cache-Control: public, max-age=31536000, immutable");
        header("ETag: $etag");
        header("Content-Length: " . filesize($cacheThumb));
        readfile($cacheThumb);
        exit;
    }

    $mime = (file_exists($cacheMime) ? trim(file_get_contents($cacheMime)) : null) ?: 'image/jpeg';
    $etag = '"' . $cacheHash . '"';
    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
        http_response_code(304);
        exit;
    }
    header("Content-Type: $mime");
    header("Cache-Control: public, max-age=31536000, immutable");
    header("ETag: $etag");
    header("Content-Length: " . filesize($cacheFull));
    readfile($cacheFull);
    exit;
}

// Extract embedded artwork via ffmpeg
$cmd = "ffmpeg -v quiet -i " . escapeshellarg($fullPath) . " -an -c:v copy -f image2 - 2>/dev/null";
$imgBytes = @shell_exec($cmd);

if ($imgBytes && strlen($imgBytes) > 100) {
    $mime = 'image/jpeg';
    if (substr($imgBytes, 0, 8) === "\x89PNG\x0D\x0A\x1A\x0A") {
        $mime = 'image/png';
    }

    @file_put_contents($cacheFull, $imgBytes);
    @file_put_contents($cacheMime, $mime);

    // Generate lightweight 128x128 thumbnail
    $thumbCmd = "ffmpeg -y -v quiet -i " . escapeshellarg($cacheFull) . " -vf \"scale=128:128:force_original_aspect_ratio=decrease\" -q:v 3 -f image2 " . escapeshellarg($cacheThumb) . " 2>/dev/null";
    @exec($thumbCmd);

    // Link by tid for fast-path
    if ($tid > 0) {
        @copy($cacheFull, $cacheDir . '/tid_' . $tid . '.img');
        @copy($cacheMime, $cacheDir . '/tid_' . $tid . '.mime');
        if (file_exists($cacheThumb)) @copy($cacheThumb, $cacheDir . '/tid_' . $tid . '_thumb.jpg');
    }

    if ($isThumb && file_exists($cacheThumb) && filesize($cacheThumb) > 0) {
        $etag = '"' . $cacheHash . '-thumb"';
        header("Content-Type: image/jpeg");
        header("Cache-Control: public, max-age=31536000, immutable");
        header("ETag: $etag");
        header("Content-Length: " . filesize($cacheThumb));
        readfile($cacheThumb);
        exit;
    }

    $etag = '"' . $cacheHash . '"';
    header("Content-Type: $mime");
    header("Cache-Control: public, max-age=31536000, immutable");
    header("ETag: $etag");
    header("Content-Length: " . strlen($imgBytes));
    echo $imgBytes;
    exit;
}

// Check for folder cover art (cover.jpg, folder.jpg, album.jpg, etc.)
$trackDir = dirname($fullPath);
$commonCovers = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'album.jpg'];
foreach ($commonCovers as $cc) {
    $candidate = $trackDir . '/' . $cc;
    if (file_exists($candidate) && is_readable($candidate)) {
        $cMime = (strtolower(pathinfo($candidate, PATHINFO_EXTENSION)) === 'png') ? 'image/png' : 'image/jpeg';
        @copy($candidate, $cacheFull);
        @file_put_contents($cacheMime, $cMime);

        // Generate thumbnail
        $thumbCmd = "ffmpeg -y -v quiet -i " . escapeshellarg($cacheFull) . " -vf \"scale=128:128:force_original_aspect_ratio=decrease\" -q:v 3 -f image2 " . escapeshellarg($cacheThumb) . " 2>/dev/null";
        @exec($thumbCmd);

        if ($tid > 0) {
            @copy($cacheFull, $cacheDir . '/tid_' . $tid . '.img');
            @copy($cacheMime, $cacheDir . '/tid_' . $tid . '.mime');
            if (file_exists($cacheThumb)) @copy($cacheThumb, $cacheDir . '/tid_' . $tid . '_thumb.jpg');
        }

        if ($isThumb && file_exists($cacheThumb) && filesize($cacheThumb) > 0) {
            $etag = '"' . $cacheHash . '-thumb"';
            if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
                http_response_code(304);
                exit;
            }
            header("Content-Type: image/jpeg");
            header("Cache-Control: public, max-age=31536000, immutable");
            header("ETag: $etag");
            header("Content-Length: " . filesize($cacheThumb));
            readfile($cacheThumb);
            exit;
        }

        $etag = '"' . $cacheHash . '"';
        if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
            http_response_code(304);
            exit;
        }
        header("Content-Type: $cMime");
        header("Cache-Control: public, max-age=31536000, immutable");
        header("ETag: $etag");
        readfile($candidate);
        exit;
    }
}

// No cover available - serve high-fidelity default album artwork SVG
http_response_code(200);
header('Content-Type: image/svg+xml; charset=UTF-8');
header('Cache-Control: public, max-age=604800, stale-while-revalidate=2592000');
readfile(__DIR__ . '/../../resources/images/default.svg');
exit;
