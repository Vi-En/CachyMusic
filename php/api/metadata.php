<?php
// CachyMusic - Track Metadata Editor API
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!empty($origin)) {
    $parsed = parse_url($origin);
    $host = $parsed['host'] ?? '';
    $serverHost = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), PHP_URL_HOST);
    if (in_array($host, ['localhost', '127.0.0.1', '::1', 'appassets.androidplatform.net'], true) || $host === $serverHost) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    }
}

header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
require_once(__DIR__ . '/../database.php');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $tid = isset($_GET['tid']) ? (int)$_GET['tid'] : 0;
    if ($tid <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing or invalid track ID (tid).']);
        exit;
    }

    $data = Storage::read();
    $track = $data['tracks'][(string)$tid] ?? null;
    if (!$track) {
        foreach ($data['tracks'] ?? [] as $t) {
            if ((int)($t['tid'] ?? 0) === $tid) {
                $track = $t;
                break;
            }
        }
    }

    if (!$track) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Track not found.']);
        exit;
    }

    echo json_encode(['success' => true, 'track' => $track]);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);
    if (!is_array($input)) {
        $input = $_POST;
    }

    $tid = isset($input['tid']) ? (int)$input['tid'] : 0;
    if ($tid <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing or invalid track ID (tid).']);
        exit;
    }

    $fields = [];
    $allowed = ['title', 'artist', 'album', 'genre', 'year', 'track_num', 'lyrics'];
    foreach ($allowed as $f) {
        if (isset($input[$f])) {
            $fields[$f] = $input[$f];
        }
    }

    $updatedTrack = Storage::updateTrackMetadata($tid, $fields);
    if (!$updatedTrack) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Track not found or could not be updated.']);
        exit;
    }

    // Attempt hardware physical file tag write if file is local and writable
    $filePath = Storage::getTrackPath($tid);
    $tagWriteAttempted = false;
    $tagWriteSuccess = false;

    $realPath = $filePath ? realpath($filePath) : false;
    $allowedExts = ['flac', 'mp3', 'm4a', 'ogg', 'wav', 'aac', 'opus', 'aiff'];

    if ($realPath && is_file($realPath) && is_writable($realPath)) {
        $ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));
        if (in_array($ext, $allowedExts, true)) {
            $title = (string)($fields['title'] ?? $updatedTrack['title'] ?? '');
            $artist = (string)($fields['artist'] ?? $updatedTrack['artist'] ?? '');
            $album = (string)($fields['album'] ?? $updatedTrack['album'] ?? '');
            $genre = (string)($fields['genre'] ?? $updatedTrack['genre'] ?? '');
            $year = (string)($fields['year'] ?? $updatedTrack['year'] ?? '');
            $trackNum = (string)($fields['track_num'] ?? $updatedTrack['track_num'] ?? '');
            $escapedPath = escapeshellarg($realPath);

            if ($ext === 'flac' && is_executable('/usr/bin/metaflac')) {
                $tagWriteAttempted = true;
                $cmd = "/usr/bin/metaflac " .
                       "--remove-tag=TITLE " . escapeshellarg("--set-tag=TITLE=" . $title) . " " .
                       "--remove-tag=ARTIST " . escapeshellarg("--set-tag=ARTIST=" . $artist) . " " .
                       "--remove-tag=ALBUM " . escapeshellarg("--set-tag=ALBUM=" . $album) . " " .
                       "--remove-tag=GENRE " . escapeshellarg("--set-tag=GENRE=" . $genre) . " " .
                       "--remove-tag=DATE " . escapeshellarg("--set-tag=DATE=" . $year) . " " .
                       "--remove-tag=TRACKNUMBER " . escapeshellarg("--set-tag=TRACKNUMBER=" . $trackNum) . " " .
                       $escapedPath . " 2>&1";
                exec($cmd, $out, $ret);
                $tagWriteSuccess = ($ret === 0);
            } elseif (is_executable('/usr/bin/ffmpeg')) {
                $tagWriteAttempted = true;
                $tmpFile = tempnam(sys_get_temp_dir(), 'cm_tag_') . '.' . $ext;
                $cmd = "/usr/bin/ffmpeg -y -v quiet -i {$escapedPath} " .
                       "-metadata " . escapeshellarg("title=" . $title) . " " .
                       "-metadata " . escapeshellarg("artist=" . $artist) . " " .
                       "-metadata " . escapeshellarg("album=" . $album) . " " .
                       "-metadata " . escapeshellarg("genre=" . $genre) . " " .
                       "-metadata " . escapeshellarg("date=" . $year) . " " .
                       "-metadata " . escapeshellarg("track=" . $trackNum) . " " .
                       "-codec copy " . escapeshellarg($tmpFile) . " 2>&1";
                exec($cmd, $out, $ret);
                if ($ret === 0 && file_exists($tmpFile) && filesize($tmpFile) > 1024) {
                    rename($tmpFile, $realPath);
                    $tagWriteSuccess = true;
                } elseif (file_exists($tmpFile)) {
                    @unlink($tmpFile);
                }
            }
        }
    }

    echo json_encode([
        'success'           => true,
        'message'           => 'Metadata saved successfully.',
        'track'             => $updatedTrack,
        'tagWriteAttempted' => $tagWriteAttempted,
        'tagWriteSuccess'   => $tagWriteSuccess
    ]);
    exit;
}
