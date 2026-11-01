<?php
// CachyMusic - Secure Audio Streaming Service
@set_time_limit(0);
@ini_set('max_execution_time', '0');
@ini_set('memory_limit', '512M');
if (function_exists('apache_setenv')) {
    @apache_setenv('no-gzip', '1');
}
@ini_set('zlib.output_compression', '0');

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
header("Access-Control-Allow-Headers: Range, Origin, Accept, Content-Type");
header("Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$filePath = $_GET['path'] ?? $_GET['file'] ?? '';
$trackId = $_GET['tid'] ?? $_GET['id'] ?? null;

if (empty($filePath) && empty($trackId)) {
    http_response_code(400);
    exit('No file path or track ID provided.');
}

// 1. Establish authorized library root directories
$projectRoot = realpath(__DIR__ . '/../../');
$allowedRoots = [
    realpath($projectRoot . '/resources/audio'),
    realpath($projectRoot . '/downloads'),
];

@require_once(__DIR__ . '/../database.php');

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

// Filter allowed roots
$allowedRoots = array_values(array_unique(array_filter($allowedRoots)));

// 2. Resolve target file to canonical path
$realPath = false;

// If a track ID was provided or path is a bare ID, query storage
if (!empty($trackId)) {
    $candidatePath = Storage::getTrackPath($trackId);
    if ($candidatePath) {
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
    $stmt = $connection->prepare("SELECT full_path, file_path FROM Tracks WHERE file_path = ? OR full_path = ? OR file_path LIKE ? LIMIT 1");
    if ($stmt) {
        $likePattern = '%' . basename($filePath);
        $stmt->bind_param("sss", $filePath, $filePath, $likePattern);
        $stmt->execute();
        $dbRes = $stmt->get_result();
        if ($dbRow = $dbRes->fetch_assoc()) {
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
];

if (!isset($mimeMap[$ext])) {
    http_response_code(403);
    exit('Access denied: file format is not an authorized audio type.');
}

// 4. Strict directory tree boundary verification
$isPathAllowed = false;
foreach ($allowedRoots as $allowedRoot) {
    if (!$allowedRoot) continue;
    if ($realPath === $allowedRoot || strpos($realPath, rtrim($allowedRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR) === 0) {
        $isPathAllowed = true;
        break;
    }
}

if (!$isPathAllowed) {
    http_response_code(403);
    exit('Access denied: file path is outside authorized audio library directories.');
}

// 5. Stream Audio with HTTP Byte-Range support
ignore_user_abort(true);

while (ob_get_level() > 0) {
    @ob_end_clean();
}

clearstatcache(true, $realPath);
$mime = $mimeMap[$ext];
$size = (int)filesize($realPath);

// Optional on-the-fly FFmpeg transcode fallback for non-standard codecs (e.g. AC3/DTS/WMA wrapped in .flac/.m4a)
if (isset($_GET['transcode']) && $_GET['transcode'] === '1') {
    $ffmpegBin = trim((string)@shell_exec('command -v ffmpeg 2>/dev/null'));
    if ($ffmpegBin !== '') {
        header("Content-Type: audio/mpeg");
        header("Accept-Ranges: none");
        header("Cache-Control: no-store");
        http_response_code(200);
        if ($_SERVER['REQUEST_METHOD'] === 'HEAD') {
            exit;
        }
        $cmd = escapeshellcmd($ffmpegBin) . ' -v error -i ' . escapeshellarg($realPath) . ' -vn -acodec libmp3lame -b:a 320k -f mp3 pipe:1 2>/dev/null';
        $proc = @popen($cmd, 'r');
        if (is_resource($proc)) {
            while (!feof($proc)) {
                if (connection_aborted() || connection_status() !== CONNECTION_NORMAL) {
                    break;
                }
                $chunk = fread($proc, 65536);
                if ($chunk === false || $chunk === '') {
                    break;
                }
                echo $chunk;
                if (ob_get_level() > 0) {
        @ob_flush();
    }
    @flush();
            }
            @pclose($proc);
            exit;
        }
    }
}

if ($size <= 0) {
    header("Content-Type: $mime");
    header("Accept-Ranges: bytes");
    header("Cache-Control: public, max-age=86400");
    header("Content-Length: 0");
    http_response_code(200);
    exit;
}

$start = 0;
$end = $size - 1;
$isRangeRequest = false;

if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/i', $_SERVER['HTTP_RANGE'], $matches)) {
    $isRangeRequest = true;
    if ($matches[1] === '' && $matches[2] !== '') {
        // RFC 7233 suffix range ("bytes=-N"): the LAST N bytes of the file
        $suffixLen = (int)$matches[2];
        if ($suffixLen <= 0) {
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

header("Content-Type: $mime");
header("Accept-Ranges: bytes");
header("Cache-Control: public, max-age=86400");
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

$fp = fopen($realPath, 'rb');
if (!$fp) {
    http_response_code(500);
    exit('Could not open audio file.');
}

fseek($fp, $start);
$buffer = 262144; // 256KB buffer for high throughput
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
