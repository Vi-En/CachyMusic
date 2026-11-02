<?php
// CachyMusic - Playlists API (Zero-Dependency & MySQL-Compatible)
if (session_status() === PHP_SESSION_NONE) {
    session_cache_limiter('');
    session_start();
}
header('Content-Type: application/json; charset=utf-8');

@require_once(__DIR__ . '/../database.php');
@require_once(__DIR__ . '/../storage.php');

$currentUser = $_SESSION['username'] ?? 'default';

// Enable transparent gzip compression for playlists responses
if (!in_array('ob_gzhandler', ob_list_handlers(), true) && extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    @ob_start('ob_gzhandler');
}

$method = $_SERVER['REQUEST_METHOD'];
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?: $_POST;

if ($method === 'GET') {
    $libFile = __DIR__ . '/../../data/library.json';
    if (file_exists($libFile)) {
        $mtime = filemtime($libFile);
        $etag = '"pl-' . dechex($mtime) . '-' . dechex(filesize($libFile)) . '"';
        header("ETag: $etag");
        header("Last-Modified: " . gmdate('D, d M Y H:i:s', $mtime) . " GMT");
        header("Cache-Control: public, max-age=60, stale-while-revalidate=300");

        $ifNoneMatch = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
        if (!empty($ifNoneMatch) && trim($ifNoneMatch, '" ') === trim($etag, '" ')) {
            http_response_code(304);
            exit;
        }
    }
    $plid = isset($_GET['plid']) ? (int)$_GET['plid'] : null;

    if ($plid) {
        $playlist = Storage::getPlaylist($plid);
        if (!$playlist) {
            echo json_encode(['success' => false, 'message' => 'Playlist not found.']);
            exit;
        }

        echo json_encode([
            'success'  => true,
            'playlist' => $playlist
        ]);
        exit;
    } else {
        $playlists = Storage::getPlaylists($currentUser);
        echo json_encode(['success' => true, 'playlists' => $playlists]);
        exit;
    }
}

if ($method === 'POST') {
    $action = $data['action'] ?? $_GET['action'] ?? '';

    if ($action === 'create') {
        $name = trim($data['name'] ?? '');
        if (empty($name)) {
            echo json_encode(['success' => false, 'message' => 'Playlist name is required.']);
            exit;
        }

        $newPlid = Storage::createPlaylist($name, $currentUser);
        if ($newPlid) {
            echo json_encode([
                'success' => true,
                'plid'    => $newPlid,
                'name'    => $name,
                'message' => 'Playlist created.'
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Failed to create playlist.']);
        }
        exit;
    }

    if ($action === 'delete') {
        $plid = (int)($data['plid'] ?? 0);
        if (!$plid) {
            echo json_encode(['success' => false, 'message' => 'Invalid playlist ID.']);
            exit;
        }

        if (Storage::deletePlaylist($plid, $currentUser)) {
            echo json_encode(['success' => true, 'message' => 'Playlist deleted.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Could not delete playlist (permission denied or not found).']);
        }
        exit;
    }

    if ($action === 'add_track') {
        $plid = (int)($data['plid'] ?? 0);
        $tid = (int)($data['tid'] ?? 0);

        if (!$plid || !$tid) {
            echo json_encode(['success' => false, 'message' => 'Missing playlist ID or track ID.']);
            exit;
        }

        $res = Storage::addTrackToPlaylist($plid, $tid);
        if ($res === 'already_in_playlist') {
            echo json_encode(['success' => false, 'message' => 'Track already in playlist.']);
        } elseif ($res) {
            echo json_encode(['success' => true, 'message' => 'Track added to playlist.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Could not add track to playlist.']);
        }
        exit;
    }

    if ($action === 'remove_track') {
        $plid = (int)($data['plid'] ?? 0);
        $tid = (int)($data['tid'] ?? 0);

        if (!$plid || !$tid) {
            echo json_encode(['success' => false, 'message' => 'Missing playlist ID or track ID.']);
            exit;
        }

        if (Storage::removeTrackFromPlaylist($plid, $tid)) {
            echo json_encode(['success' => true, 'message' => 'Track removed from playlist.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Could not remove track.']);
        }
        exit;
    }
}

echo json_encode(['success' => false, 'message' => 'Invalid request.']);
exit;

