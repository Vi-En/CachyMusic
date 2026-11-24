<?php
// CachyMusic - Track Metadata Editor API
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

header('Content-Type: application/json; charset=utf-8');
require_once(__DIR__ . '/../database.php');
require_once(__DIR__ . '/../flac_metadata.php');
require_once(__DIR__ . '/../mp3_metadata.php');
require_once(__DIR__ . '/../pcm_metadata.php');
require_once(__DIR__ . '/../packet_metadata.php');
function cm_meta_error(int $status,string $message): void { http_response_code($status); echo json_encode(['success'=>false,'message'=>$message]); exit; }

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
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') cm_meta_error(415,'JSON required');
    $raw = file_get_contents('php://input', false, null, 0, 15 * 1024 * 1024 + 1);
    if ($raw === false || strlen($raw)>15*1024*1024) cm_meta_error(413,'Request too large');
    $input = json_decode($raw, true);
    if (!is_array($input)) {
        cm_meta_error(400,'Invalid JSON');
    }

    $tid = isset($input['tid']) ? (int)$input['tid'] : 0;
    if ($tid <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing or invalid track ID (tid).']);
        exit;
    }

    $fields = [];
    $allowed = ['title', 'artist', 'album', 'genre', 'year', 'track_num', 'lyrics', 'comment'];
    foreach ($allowed as $f) {
        if (array_key_exists($f,$input)) {
            $v=$input[$f]; if($v!==null && !is_string($v) && !is_int($v)) cm_meta_error(400,'Invalid field');
            if(strlen((string)$v)>($f==='lyrics'?262144:4096)) cm_meta_error(400,'Field too long');
            $fields[$f] = $v;
        }
    }

    // Require an indexed track and validate artwork before writing anything.
    $filePath = Storage::getTrackPath($tid);
    if (!$filePath) cm_meta_error(404,'Track not found');
    $coverData=$input['cover_data']??null; $coverSaved=false; $rawBinary=null; $info=null;
    if ($coverData !== null) {
        if(!is_string($coverData)||!preg_match('#^data:(image/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$#D',$coverData,$m)) cm_meta_error(400,'Unsupported artwork');
        $rawBinary=base64_decode($m[2],true);
        if($rawBinary===false||strlen($rawBinary)>10*1024*1024) cm_meta_error(400,'Invalid artwork size');
        $info=@getimagesizefromstring($rawBinary);
        if(!$info||$info['mime']!==$m[1]||$info[0]<1||$info[1]<1||$info[0]>8192||$info[1]>8192||$info[0]*$info[1]>16000000) cm_meta_error(400,'Invalid artwork dimensions');
        $cacheDir=cachy_cache_dir().DIRECTORY_SEPARATOR.'covers';
        if(!is_dir($cacheDir)&&!@mkdir($cacheDir,0700,true)) cm_meta_error(500,'Cannot save artwork');
        // Existing cover endpoint reads these aliases. Invalidate thumbnails to avoid stale art.
        $tmp=tempnam($cacheDir,'.cm-cover-');
        if(!$tmp||file_put_contents($tmp,$rawBinary)!==strlen($rawBinary)||!rename($tmp,$cacheDir.'/tid_'.$tid.'.img')) {if($tmp)@unlink($tmp);cm_meta_error(500,'Cannot save artwork');}
        if(file_put_contents($cacheDir.'/tid_'.$tid.'.mime',$info['mime'],LOCK_EX)===false)cm_meta_error(500,'Cannot save artwork type');
        @unlink($cacheDir.'/tid_'.$tid.'_thumb.jpg');
        $fields['has_cover']=1;$coverSaved=true;
    }

    $updatedTrack = Storage::updateTrackMetadata($tid, $fields);
    if (!$updatedTrack) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Track not found or could not be updated.']);
        exit;
    }

    if ($coverSaved) {
        $updatedTrack['has_cover'] = 1;
        $updatedTrack['cover'] = 'php/api/cover.php?tid=' . $tid;
    }

    // Only write to the original file following an explicit user request.
    $tagWriteAttempted=false; $tagWriteSuccess=false;
    $realPath=realpath($filePath);$dir=Storage::getDefaultDirectory();$root=$dir?realpath($dir):false;
    if(($input['write_file']??false)===true && $realPath && $root && is_dir($root) && !is_link($filePath) && is_file($realPath) && is_writable($realPath)
        && cachy_is_allowed_scan_path(dirname($realPath)) && str_starts_with(cachy_normalize_path($realPath),rtrim(cachy_normalize_path($root),'/').'/')
        && in_array(strtolower(pathinfo($realPath,PATHINFO_EXTENSION)),['flac','mp3','wav','wave','aif','aiff','ogg','opus','oga','m4a','alac'],true)) {
        $tagWriteAttempted=true;$writer=match(strtolower(pathinfo($realPath,PATHINFO_EXTENSION))){'flac'=>'cm_flac_rewrite','mp3'=>'cm_mp3_rewrite','ogg','opus','oga','m4a','alac'=>'cm_packet_rewrite',default=>'cm_pcm_tag_rewrite'};
        $tagWriteSuccess=$writer($realPath,$fields,$rawBinary,$info);
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
