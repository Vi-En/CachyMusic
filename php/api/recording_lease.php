<?php
require_once __DIR__.'/../platform.php';
require_once __DIR__.'/../database.php';
require_once __DIR__.'/../cover_index.php';
require_once __DIR__.'/../media_access.php';
require_once __DIR__.'/../recording_leases.php';
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: private, no-store');
function cm_lease_reply(int $status,array $body): never {http_response_code($status);echo json_encode($body);exit;}
try {
    if (!in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true)) cm_lease_reply(403,['success'=>false]);
    if (($_SERVER['REQUEST_METHOD']??'')!=='POST') {header('Allow: POST');cm_lease_reply(405,['success'=>false]);}
    if (strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]))!=='application/json') cm_lease_reply(415,['success'=>false]);
    $raw=file_get_contents('php://input',false,null,0,8193);
    if (!is_string($raw)||strlen($raw)>8192) cm_lease_reply(413,['success'=>false]);
    $req=json_decode($raw,true);if (!is_array($req)||!cm_recording_lease_id($req['owner']??null)) cm_lease_reply(400,['success'=>false]);
    $owner=$req['owner'];$action=$req['action']??null;
    if ($action==='release') {cm_recording_lease_release($owner);cm_lease_reply(200,['success'=>true]);}
    if ($action!=='renew'||($tid=cachy_positive_id($req['tid']??null))===null||!is_string($req['path']??null)||strlen($req['path'])>4096||str_contains($req['path'],"\0")) cm_lease_reply(400,['success'=>false]);
    // SQL original edits remain disabled; never infer SQL identity from JSON.
    if (Storage::hasMySQL()) cm_lease_reply(409,['success'=>false]);
    $authorityGuard=cm_recording_authority_lock(false);
    if (!$authorityGuard) cm_lease_reply(409,['success'=>false]);
    try {
        $snapshot=cm_cover_snapshot($tid);$path=cm_media_record_path($snapshot['tracks'][(string)$tid]??null);
        $real=$path!==null?realpath($path):false;
        $accepted=$real&&$path===$req['path']&&cm_media_path_allowed($real,cm_media_roots($snapshot,false))&&cm_recording_lease_renew($owner,$real);
    } finally {fclose($authorityGuard);}
    if (!$accepted) cm_lease_reply(409,['success'=>false]);
    cm_lease_reply(200,['success'=>true,'ttl'=>CM_RECORDING_LEASE_TTL]);
} catch (Throwable $e) {cm_lease_reply(503,['success'=>false]);}
