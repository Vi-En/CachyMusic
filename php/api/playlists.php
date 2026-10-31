<?php
// CachyMusic - Playlists API (Zero-Dependency & MySQL-Compatible)
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
header('Content-Type: application/json; charset=utf-8');

@require_once(__DIR__ . '/../database.php');
@require_once(__DIR__ . '/../storage.php');

$currentUser = $_SESSION['username'] ?? 'default';
// Release session file lock immediately so concurrent requests do not block
session_write_close();
$method = $_SERVER['REQUEST_METHOD'];
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?: $_POST;

if ($method === 'GET') {
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
