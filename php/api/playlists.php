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
function positive_playlist_id($value) { return (is_int($value)||is_string($value)) && preg_match('/^[1-9][0-9]*$/D',(string)$value) && filter_var($value,FILTER_VALIDATE_INT)!==false; }
try {

if ($method === 'GET') {
    header('Cache-Control: private, no-store');
    if (isset($_GET['plid'])&&!positive_playlist_id($_GET['plid'])) { http_response_code(400);echo json_encode(['success'=>false,'message'=>'Invalid playlist ID.']);exit; }
    $plid = isset($_GET['plid']) ? (int)$_GET['plid'] : null;

    if ($plid) {
        $playlist = Storage::getPlaylist($plid);
        if (!$playlist || !in_array($playlist['username']??'',[$currentUser,'default'],true)) {
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
    if ((Storage::hasMySQL()&&!PlaylistSql::enabled()) || (PlaylistSql::enabled()&&!Storage::hasMySQL())) { http_response_code(503); echo json_encode(['success'=>false,'message'=>'MySQL playlist changes require the explicit transactional migration and a working database.']); exit; }
    $action = $data['action'] ?? $_GET['action'] ?? '';
    if(in_array($action,['edit','edit_members','delete','add_track','remove_track','add_tracks'],true)&&!positive_playlist_id($data['plid']??null) || in_array($action,['add_track','remove_track'],true)&&!positive_playlist_id($data['tid']??null)){http_response_code(400);echo json_encode(['success'=>false,'message'=>'Invalid playlist or track ID.']);exit;}

    if ($action === 'create') {
        $name = trim($data['name'] ?? '');
        if ($name==='' || strlen($name)>200) {
            echo json_encode(['success' => false, 'message' => 'Playlist name is required.']);
            exit;
        }

        foreach(Storage::getPlaylists($currentUser) as $existing)if(strcasecmp($existing['name'],$name)===0){echo json_encode(['success'=>false,'message'=>'A playlist with that name already exists.']);exit;}
        $newPlid = Storage::createPlaylist($name, $currentUser,$data['tracks']??[]);
        if ($newPlid) {
            echo json_encode([
                'success' => true,
                'plid'    => $newPlid,
                'playlist' => array_values(array_filter(Storage::getPlaylists($currentUser),fn($p)=>(int)$p['plid']===$newPlid))[0]??null,
                'name'    => $name,
                'message' => 'Playlist created.'
            ]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Failed to create playlist.']);
        }
        exit;
    }

    if (in_array($action,['edit','edit_members'],true)) {
        $ok=Storage::editPlaylist((int)($data['plid']??0),(string)($data['name']??''),$data['tracks']??null,$currentUser,$data['revision']??null,$action==='edit_members');
        echo json_encode(['success'=>$ok,'message'=>$ok?'Playlist updated.':'Could not save playlist; membership or name may have changed.', 'playlist'=>$ok?array_values(array_filter(Storage::getPlaylists($currentUser),fn($p)=>(int)$p['plid']===(int)$data['plid']))[0]??null:null]);exit;
    }
    if ($action === 'delete') {
        $plid = (int)($data['plid'] ?? 0);
        if (!$plid) {
            echo json_encode(['success' => false, 'message' => 'Invalid playlist ID.']);
            exit;
        }

        if (Storage::deletePlaylist($plid, $currentUser,$data['revision']??null)) {
            echo json_encode(['success' => true, 'message' => 'Playlist deleted.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Could not delete playlist (permission denied or not found).']);
        }
        exit;
    }

    if ($action === 'add_tracks') {
        $plid=(int)$data['plid'];$ok=Storage::addTracksToPlaylist($plid,$data['tracks']??null,$currentUser,$data['revision']??null);
        echo json_encode(['success'=>$ok,'message'=>$ok?'Songs added.':'Playlist changed or a selected track is unavailable. No songs added.', 'playlist'=>$ok?array_values(array_filter(Storage::getPlaylists($currentUser),fn($p)=>(int)$p['plid']===$plid))[0]??null:null]);exit;
    }
    if ($action === 'add_track') {
        $plid = (int)($data['plid'] ?? 0);
        $tid = (int)($data['tid'] ?? 0);

        if (!$plid || !$tid) {
            echo json_encode(['success' => false, 'message' => 'Missing playlist ID or track ID.']);
            exit;
        }

        $res = Storage::addTrackToPlaylist($plid, $tid,$currentUser);
        if ($res === 'already_in_playlist') {
            echo json_encode(['success' => false, 'message' => 'Track already in playlist.']);
        } elseif ($res) {
            echo json_encode(['success' => true, 'message' => 'Track added to playlist.', 'playlist'=>array_values(array_filter(Storage::getPlaylists($currentUser),fn($p)=>(int)$p['plid']===$plid))[0]??null]);
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

        if (Storage::removeTrackFromPlaylist($plid, $tid,$currentUser)) {
            echo json_encode(['success' => true, 'message' => 'Track removed from playlist.', 'playlist'=>array_values(array_filter(Storage::getPlaylists($currentUser),fn($p)=>(int)$p['plid']===$plid))[0]??null]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Could not remove track.']);
        }
        exit;
    }
}

echo json_encode(['success' => false, 'message' => 'Invalid request.']);
} catch(Throwable $e) { http_response_code(503); echo json_encode(['success'=>false,'message'=>'Playlist storage is unavailable. Reload before retrying.']); }
exit;

