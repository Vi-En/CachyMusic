<?php
// CachyMusic - Secure Audio Streaming Service
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
@set_time_limit(0);
@ini_set('max_execution_time', '0');
@ini_set('memory_limit', '512M');
@ignore_user_abort(false);
if (function_exists('apache_setenv')) {
    @apache_setenv('no-gzip', '1');
}
@ini_set('zlib.output_compression', 'Off');

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
header("Access-Control-Allow-Methods: GET, HEAD, OPTIONS");
header("Access-Control-Allow-Headers: Range, Origin, Accept, Content-Type, X-Cachy-Media-Version");
header("Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges, X-Cachy-Media-Version");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD, OPTIONS'); http_response_code(405); exit;
}

require_once __DIR__ . '/../platform.php';
$filePath = $_GET['path'] ?? $_GET['file'] ?? '';
$rawId = $_GET['tid'] ?? $_GET['id'] ?? null;
$trackId = $rawId === null ? null : cachy_positive_id($rawId);
if (!is_string($filePath) || strlen($filePath)>4096 || str_contains($filePath,"\0") || ($rawId !== null && $trackId === null)
    || (isset($_GET['path'],$_GET['file'])) || (isset($_GET['tid'],$_GET['id']))) {
    http_response_code(400); exit('Invalid media identifier.');
}
if ($trackId !== null && $filePath !== '') { http_response_code(400); exit('Ambiguous media identifier.'); }
if ($filePath === '' && $trackId === null) { http_response_code(400); exit('No file path or track ID provided.'); }

// 1. Establish authorized library root directories
$projectRoot=realpath(__DIR__.'/../../');
require_once __DIR__.'/../database.php';
require_once __DIR__.'/../cover_index.php';
require_once __DIR__.'/../media_access.php';
$mysql=Storage::hasMySQL();
$snapshot=$mysql?[]:cm_cover_snapshot($trackId);
if (!$mysql&&!isset($snapshot['tracks'])) {http_response_code(503);exit('Library storage unavailable.');}
$allowedRoots=cm_media_roots($snapshot,$mysql);

// 2. Resolve target file to canonical path
$realPath = false;

// If a track ID was provided or path is a bare ID, query storage
if ($trackId !== null) {
    $row = $snapshot['tracks'][(string)$trackId] ?? null;
    $candidatePath = $mysql ? Storage::getTrackPath($trackId) : cm_media_record_path($row);
    if (is_string($candidatePath) && $candidatePath !== '' && !str_contains($candidatePath,"\0")) {
        $candReal = realpath($candidatePath);
        if ($candReal && is_file($candReal) && is_readable($candReal)) {
            $realPath = $candReal;
        }
    }
}

// Check direct realpath
if (!$realPath && !empty($filePath)) {
    $cand = realpath($filePath);
    if ($cand && is_file($cand) && is_readable($cand)) {
        $realPath = $cand;
    }
}

// Check relative to project root
if (!$realPath && !empty($filePath)) {
    $alt = realpath($projectRoot . '/' . ltrim($filePath, '/'));
    if ($alt && is_file($alt) && is_readable($alt)) {
        $realPath = $alt;
    }
}

// Check relative to any allowed root (for relative filenames like "02 Chicago.flac")
if (!$realPath && !empty($filePath)) {
    $cleanRel = ltrim($filePath, '/');
    foreach ($allowedRoots as $root) {
        $cand = realpath($root . '/' . $cleanRel);
        if ($cand && is_file($cand) && is_readable($cand)) {
            $realPath = $cand;
            break;
        }
    }
}

// Check database lookup by file_path or full_path
if (!$realPath && !empty($filePath) && isset($connection) && $connection && !mysqli_connect_errno()) {
    $stmt = $connection->prepare("SELECT full_path, file_path FROM Tracks WHERE file_path = ? OR full_path = ? LIMIT 2");
    if ($stmt) {
        $stmt->bind_param("ss", $filePath, $filePath);
        $stmt->execute();
        $dbRes = $stmt->get_result();
        if ($dbRes && $dbRes->num_rows === 1 && ($dbRow = $dbRes->fetch_assoc())) {
            $candidatePath = $dbRow['full_path'] ?: $dbRow['file_path'];
            $candReal = realpath($candidatePath);
            if ($candReal && is_file($candReal) && is_readable($candReal)) {
                $realPath = $candReal;
            }
        }
    }
}

if ($realPath === false || !is_file($realPath) || !is_readable($realPath)) {
    http_response_code(404);
    exit('Audio file not found.');
}

// 3. Strict audio file extension whitelist
$ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));
$mimeMap = [
    'mp3'  => 'audio/mpeg',
    'm4a'  => 'audio/mp4',
    'flac' => 'audio/flac',
    'wav'  => 'audio/wav',
    'ogg'  => 'audio/ogg',
    'oga'  => 'audio/ogg',
    'opus' => 'audio/opus',
    'aac'  => 'audio/aac',
    'wma'  => 'audio/x-ms-wma',
    'aiff' => 'audio/aiff',
    'aif'  => 'audio/aiff',
    'alac' => 'audio/mp4',
    'mp4'  => 'audio/mp4',
];

if (!isset($mimeMap[$ext])) {
    http_response_code(403);
    exit('Access denied: file format is not an authorized audio type.');
}

// 4. Strict directory tree boundary verification
if (!cm_media_path_allowed($realPath,$allowedRoots)) {
    http_response_code(403);
    exit('Access denied: file path is outside authorized audio library directories.');
}

// 5. Stream Audio with HTTP Byte-Range support
require_once __DIR__.'/../recording_lock.php';
try {$recordingGuard=cm_recording_lock($realPath,false);} catch (Throwable $e) {$recordingGuard=false;}
if (!$recordingGuard) {http_response_code(503);header('Retry-After: 1');header('Cache-Control: no-store');exit('Recording temporarily unavailable.');}
// PHP closes the guard at request shutdown, including disconnect/error exits.

ignore_user_abort(false);

while (ob_get_level() > 0) {
    @ob_end_clean();
}

clearstatcache(true, $realPath);
$mime = $mimeMap[$ext];
// Read metadata from the actual opened file, not from a second pathname lookup.
// This is a change detector, not a cryptographic content identity.
$fp = @fopen($realPath, 'rb');
if (!$fp) { http_response_code(500); exit('Could not open audio file.'); }
if (!flock($fp,LOCK_SH|LOCK_NB)) {fclose($fp);http_response_code(503);header('Retry-After: 1');header('Cache-Control: no-store');exit('Recording temporarily unavailable.');}
$stat = fstat($fp);
clearstatcache(true,$realPath);$named=@lstat($realPath);
if (!cm_regular_stat($stat)||!cm_regular_stat($named)||$named['dev']!==$stat['dev']||$named['ino']!==$stat['ino']||realpath($realPath)!==$realPath) { fclose($fp); http_response_code(409);header('Cache-Control: no-store');exit; }
$size = (int)$stat['size'];
$version = hash('sha256', json_encode([$realPath, $stat['dev'], $stat['ino'], $size, $stat['mtime'], $stat['ctime']], JSON_INVALID_UTF8_SUBSTITUTE));
header("X-Cachy-Media-Version: $version");
$expectedVersion = $_SERVER['HTTP_X_CACHY_MEDIA_VERSION'] ?? '';
if ($expectedVersion !== '' && !hash_equals($version, $expectedVersion)) { fclose($fp); http_response_code(412); exit('Media source changed; reload track.'); }

// Lossy fallback removed: never transcode a source silently.
if (isset($_GET['transcode'])) { fclose($fp); http_response_code(400); exit('Lossy compatibility conversion disabled.'); }

if ($size <= 0) {
    header("Content-Type: $mime");
    header("Accept-Ranges: bytes");
    header("Cache-Control: no-store");
    header("Content-Length: 0");
    http_response_code(200);
    fclose($fp);
    exit;
}

$start = 0;
$end = $size - 1;
$isRangeRequest = false;

if (isset($_SERVER['HTTP_RANGE'])) {
    if (!preg_match('/^bytes\s*=\s*(\d*)\s*-\s*(\d*)$/iD', $_SERVER['HTTP_RANGE'], $matches) || ($matches[1] === '' && $matches[2] === '')) {
        fclose($fp); http_response_code(416); header("Content-Range: bytes */$size"); exit;
    }
    $isRangeRequest = true;
    if ($matches[1] === '' && $matches[2] !== '') {
        // RFC 7233 suffix range ("bytes=-N"): the LAST N bytes of the file
        $suffixLen = (int)$matches[2];
        if ($suffixLen <= 0) {
            fclose($fp);
            http_response_code(416);
            header("Content-Range: bytes */$size");
            exit;
        }
        $start = max(0, $size - $suffixLen);
        $end = $size - 1;
    } else {
        if ($matches[1] !== '') {
            $start = (int)$matches[1];
        }
        if ($matches[2] !== '') {
            $end = (int)$matches[2];
        }
    }
}

if ($end >= $size) {
    $end = $size - 1;
}

if ($start > $end || $start >= $size) {
    http_response_code(416);
    header("Content-Range: bytes */$size");
    exit;
}

$length = $end - $start + 1;

while (ob_get_level() > 0) {
    @ob_end_clean();
}

if ($_SERVER['REQUEST_METHOD'] !== 'HEAD' && fseek($fp, $start) !== 0) { fclose($fp); http_response_code(500); exit('Unable to seek audio file.'); }
header("Content-Type: $mime");
header("Accept-Ranges: bytes");
header("Cache-Control: no-store");
header("Content-Length: $length");

if ($isRangeRequest || ($length < $size && $isRangeRequest)) {
    http_response_code(206);
    header("Content-Range: bytes $start-$end/$size");
} else {
    http_response_code(200);
}

if ($_SERVER['REQUEST_METHOD'] === 'HEAD') {
    exit;
}

$buffer = 65536; // 64KB chunk buffer: streams without whole-file buffering
$remaining = $length;

while ($remaining > 0 && !feof($fp)) {
    if (connection_aborted() || connection_status() !== CONNECTION_NORMAL) {
        break;
    }
    $read = ($remaining > $buffer) ? $buffer : $remaining;
    $data = fread($fp, $read);
    if ($data === false || $data === '') {
        break;
    }
    echo $data;
    $remaining -= strlen($data);
    if (connection_aborted() || connection_status() !== CONNECTION_NORMAL) {
        break;
    }
    if (ob_get_level() > 0) {
        @ob_flush();
    }
    @flush();
}

fclose($fp);
exit;
