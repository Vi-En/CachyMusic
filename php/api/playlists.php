<?php
// CachyMusic - Playlists API (Zero-Dependency & MySQL-Compatible)
if (session_status() === PHP_SESSION_NONE) {
    session_cache_limiter('');
    session_start();
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');

@require_once(__DIR__ . '/../database.php');
@require_once(__DIR__ . '/../storage.php');

$currentUser = $_SESSION['username'] ?? 'default';
if (session_status()===PHP_SESSION_ACTIVE) session_write_close();

// Enable transparent gzip compression for playlists responses
if (!in_array('ob_gzhandler', ob_list_handlers(), true) && extension_loaded('zlib') && !ini_get('zlib.output_compression')) {
    @ob_start('ob_gzhandler');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
function playlist_bad(int $status,string $message): never {http_response_code($status);echo json_encode(['success'=>false,'message'=>$message]);exit;}
function positive_playlist_id($value) { return (is_int($value)||is_string($value)) && preg_match('/^[1-9][0-9]*$/D',(string)$value) && filter_var($value,FILTER_VALIDATE_INT)!==false; }
if (!in_array($method,['GET','POST'],true)) playlist_bad(405,'Method not allowed.');
$data=[];
if ($method==='POST') {
    // Enforce a request-size cap before decoding; preserve form compatibility.
    $limit=1048576;
    if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH']>$limit) playlist_bad(413,'Playlist request too large.');
    $rawInput=file_get_contents('php://input',false,null,0,$limit+1);
    if ($rawInput===false||strlen($rawInput)>$limit) playlist_bad(413,'Playlist request too large.');
    $contentType=strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]));
    if ($contentType==='application/json' || ($rawInput!=='' && !$contentType)) {
        $decoded=json_decode($rawInput,true,32);
        if (!is_array($decoded)||($decoded!==[]&&array_is_list($decoded))||json_last_error()!==JSON_ERROR_NONE) playlist_bad(400,'Invalid playlist request.');
        $data=$decoded;
    } else if ($rawInput==='' || in_array($contentType,['application/x-www-form-urlencoded','multipart/form-data'],true)) $data=$_POST;
    else playlist_bad(415,'Unsupported request format.');
    if (!is_array($data)) playlist_bad(400,'Invalid playlist request.');
    if (isset($data['action'],$_GET['action']) && $data['action']!==$_GET['action']) playlist_bad(400,'Conflicting actions.');
    $action=$data['action']??$_GET['action']??'';
    if (!is_string($action)||!in_array($action,['create','edit','edit_members','delete','add_track','remove_track','add_tracks'],true)) playlist_bad(400,'Invalid playlist action.');
    if (in_array($action,['create','edit','edit_members'],true) && (!is_string($data['name']??null)||trim($data['name'])===''||strlen($data['name'])>200||preg_match('//u',$data['name'])!==1||preg_match('/[\x00-\x1f\x7f]/',$data['name']))) playlist_bad(400,'Invalid playlist name.');
    if (array_key_exists('tracks',$data)) {
        if (!is_array($data['tracks'])||!array_is_list($data['tracks'])||count($data['tracks'])>25000) playlist_bad(400,'Invalid playlist membership.');
        foreach ($data['tracks'] as $id) if (!positive_playlist_id($id)) playlist_bad(400,'Invalid track ID.');
    }
}
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
        $ok=Storage::editPlaylist((int)($data['plid']??0),$data['name'],$data['tracks']??null,$currentUser,$data['revision']??null,$action==='edit_members');
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

