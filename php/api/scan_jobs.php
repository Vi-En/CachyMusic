<?php
require_once __DIR__.'/../scan_jobs.php';
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: private, no-store');
cachy_send_local_cors('GET, POST, OPTIONS');
function scan_reply(int $status,$body): never {http_response_code($status);echo is_string($body)?$body:json_encode($body,JSON_INVALID_UTF8_SUBSTITUTE);exit;}
try {
    $method=$_SERVER['REQUEST_METHOD']??'GET';
    if ($method==='OPTIONS') scan_reply(200,[]);
    if ($method==='GET'&&isset($_GET['directory'])) {require_once __DIR__.'/../database.php';if (($snapshot=Storage::read())===[]) scan_reply(503,['message'=>'Library storage unavailable']);$directory=Storage::hasMySQL()?Storage::getDefaultDirectory():($snapshot['default_directory']??null);scan_reply(200,['directory'=>is_string($directory)?trim($directory):Storage::getDefaultDirectory()]);}
    if ($method==='GET'&&!isset($_GET['id'])) scan_reply(200,['enabled'=>CachyScanJob::session()!==null,'ready'=>CachyScanJob::ready()]);
    if (!CachyScanJob::session()) scan_reply(503,['message'=>'Managed background scanning unavailable']);
    if ($method==='GET') {
        $id=$_GET['id'];if (!CachyScanJob::validId($id)) scan_reply(400,['message'=>'Invalid scan ID']);
        [$status,$body]=CachyScanJob::status($id,($_GET['result']??'')==='1');scan_reply($status,$body);
    }
    if ($method!=='POST') scan_reply(405,['message'=>'Method not allowed']);
    $editRoute=($_GET['metadata']??'')==='1';
    if ($editRoute&&strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]))!=='application/json') scan_reply(415,['message'=>'JSON required']);
    $limit=$editRoute?15*1024*1024:16384;
    $raw=file_get_contents('php://input',false,null,0,$limit+1);if (!is_string($raw)||strlen($raw)>$limit) scan_reply(413,['message'=>'Scan request too large']);
    $req=json_decode($raw,true);if (!is_array($req)||!CachyScanJob::validId($req['id']??null)) scan_reply(400,['message'=>'Invalid scan request']);
    if ($editRoute) {
        if (($req['action']??null)!=='start'||!is_array($req['edit']??null)) scan_reply(400,['message'=>'Invalid metadata job']);
        $hash=hash('sha256',json_encode($req['edit'],JSON_THROW_ON_ERROR));
        [$status,$body]=CachyScanJob::start($req['id'],['directory'=>'','preserveDirectory'=>true,'kind'=>'metadata','payloadHash'=>$hash],$req['edit']);scan_reply($status,$body);
    }
    if (($req['kind']??null)==='metadata') scan_reply(400,['message'=>'Use metadata job endpoint']);
    if (($req['action']??null)==='cancel') {[$status,$body]=CachyScanJob::cancel($req['id']);scan_reply($status,$body);}
    if (($req['action']??null)!=='start'||!CachyScanJob::validRequest($req)) scan_reply(400,['message'=>'Invalid scan request']);
    [$status,$body]=CachyScanJob::start($req['id'],['directory'=>trim($req['directory']),'preserveDirectory'=>$req['preserveDirectory']]+(isset($req['kind'])?['kind'=>$req['kind']]:[])+(array_key_exists('expectedDirectory',$req)?['expectedDirectory'=>$req['expectedDirectory']]:[]));scan_reply($status,$body);
} catch (CachyMetadataError $e) {scan_reply($e->getCode(),['success'=>false,'message'=>$e->getMessage()]);} catch (Throwable $e) {scan_reply(503,['message'=>'Background scan state unavailable; restart or inspect profile storage.']);}
