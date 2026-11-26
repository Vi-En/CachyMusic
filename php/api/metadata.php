<?php
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
require_once __DIR__.'/../metadata_edit.php';
require_once __DIR__.'/../scan_jobs.php';
$method=$_SERVER['REQUEST_METHOD']??'GET';
try {
if ($method === 'GET') {
    $tid = cachy_positive_id($_GET['tid'] ?? null);
    if ($tid <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing or invalid track ID (tid).']);
        exit;
    }

    $data = Storage::read();
    $track = Storage::hasMySQL()?Storage::sqlTrackRecord($tid):($data['tracks'][(string)$tid] ?? null);
    if ($track && Storage::hasMySQL()) {
        $mirror=$data['tracks'][(string)$tid]??null;
        if (cm_media_record_path($mirror)===cm_media_record_path($track)) {
            foreach (['comment','artwork_hash'] as $key) if (array_key_exists($key,$mirror)) $track[$key]=$mirror[$key];
        }
    }

    if (!$track) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Track not found.']);
        exit;
    }

    cm_meta_authorize(cm_media_record_path($track),$data);
    echo json_encode(['success' => true, 'track' => $track]);
    exit;
}

if ($method === 'POST') {
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') cm_meta_error(415,'JSON required');
    $raw=file_get_contents('php://input',false,null,0,15*1024*1024+1);
    if ($raw===false||strlen($raw)>15*1024*1024) cm_meta_error(413,'Request too large');
    $input=json_decode($raw,true);
    if (!is_array($input)) cm_meta_error(400,'Invalid JSON');
    if (CachyScanJob::session()!==null) cm_meta_error(409,'Use managed metadata editing; reload the client.');
    echo json_encode(cm_meta_edit($input),JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);exit;
}
cm_meta_error(405,'Method not allowed');
} catch (CachyMetadataError $e) {http_response_code($e->getCode());echo json_encode(['success'=>false,'message'=>$e->getMessage()]);}
catch (Throwable $e) {http_response_code(503);echo json_encode(['success'=>false,'message'=>'Metadata operation failed; check storage before retrying.']);}
