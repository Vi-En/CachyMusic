<?php
// CachyMusic - Linux MPRIS2 Bridge State Store
// Bridges browser/PWA state with native Linux D-Bus player controls
header('Content-Type: application/json; charset=utf-8');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $host = parse_url($origin, PHP_URL_HOST) ?: '';
    if (in_array(strtolower($host), ['localhost', '127.0.0.1', '::1', '[::1]'], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Cache-Control: private, no-store');
function mpris_error(int $code, string $message): void {
    http_response_code($code); echo json_encode(['success'=>false,'message'=>$message]); exit;
}
require_once __DIR__.'/../durable_file.php';
function mpris_atomic_write(string $path,string $content): bool { return !is_link($path) && cm_replace_file($path,$content,0600); }
function mpris_read_json(int $limit): array {
    if (strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]))!=='application/json') mpris_error(415,'JSON required');
    $origin=$_SERVER['HTTP_ORIGIN']??'';
    if ($origin!=='' && !in_array(strtolower((string)parse_url($origin,PHP_URL_HOST)),['localhost','127.0.0.1','::1','[::1]'],true)) mpris_error(403,'Origin not permitted');
    $raw = file_get_contents('php://input', false, null, 0, $limit+1);
    if ($raw === false || strlen($raw) > $limit) mpris_error(413, 'Request too large');
    $json = json_decode($raw, true);
    if (!is_array($json)) mpris_error(400, 'Invalid JSON payload');
    return $json;
}
$action = $_GET['action'] ?? $_POST['action'] ?? 'get_state';
if (!is_string($action)) mpris_error(400, 'Invalid action');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (in_array($action,['get_state','command_status'],true) ? $method !== 'GET' : $method !== 'POST') mpris_error(405, 'Method not allowed');
$stateDir = getenv('XDG_STATE_HOME') ?: ((getenv('HOME') ?: sys_get_temp_dir()) . '/.local/state');
$cachyStateDir = rtrim($stateDir, '/\\') . '/cachymusic';
if (!is_dir($cachyStateDir) && !@mkdir($cachyStateDir, 0700, true) && !is_dir($cachyStateDir)) mpris_error(503, 'State directory unavailable');
$stateFile = $cachyStateDir . '/mpris_player_state.json';
$cmdFile = $cachyStateDir . '/mpris_command_queue.json';
$legacyCmdFile = $cachyStateDir . '/mpris_pending_command.json';
$artCacheFile = $cachyStateDir . '/current_cover.jpg';
// Serialize queue publication, claims and acknowledgements.
function mpris_command_lock(string $dir) {
    $path = $dir . '/mpris_command.lock';
    if (is_link($path)) mpris_error(503, 'Command lock unavailable');
    $lock = @fopen($path, 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        if (is_resource($lock)) fclose($lock);
        mpris_error(503, 'Command mailbox busy');
    }
    return $lock;
}
// Keep the journal bounded. An expired claim is uncertain, not safe to replay:
// Next/Seek/Toggle may already have executed before the acknowledgement was lost.
function mpris_id($value): bool { return is_string($value) && preg_match('/^[a-f0-9]{32}$/D',$value) === 1; }
function mpris_queue_read(string $path, string $legacy): array {
    if (is_link($path)) mpris_error(503,'Command journal unavailable');
    if (!file_exists($path)) {
        // Never replay the pre-upgrade destructive mailbox; report its presence.
        return ['pending'=>[], 'receipts'=>[], 'legacy_pending'=>file_exists($legacy)||is_link($legacy)];
    }
    $raw = is_file($path) ? @file_get_contents($path,false,null,0,262145) : false;
    $q = is_string($raw) && strlen($raw)<=262144 ? json_decode($raw,true) : null;
    if (!is_array($q) || !is_array($q['pending']??null) || !array_is_list($q['pending']) || count($q['pending'])>64 || !is_array($q['receipts']??null) || !array_is_list($q['receipts']) || count($q['receipts'])>256 || !is_bool($q['legacy_pending']??null)) mpris_error(503,'Command journal corrupt');
    $seen=[];
    foreach ($q['pending'] as $i=>$entry) {
        if (!is_array($entry) || !mpris_id($entry['id']??null) || isset($seen[$entry['id']]) || !is_array($entry['payload']??null) || !is_numeric($entry['created']??null) || !is_finite((float)$entry['created']) || !array_key_exists('owner',$entry) || !array_key_exists('until',$entry) || ($entry['owner']!==null && (!mpris_id($entry['owner']) || $i!==0 || !is_numeric($entry['until']) || !is_finite((float)$entry['until']))) || ($entry['owner']===null && $entry['until']!==null)) mpris_error(503,'Command journal corrupt');
        if (mpris_payload($entry['payload'],503) !== $entry['payload']) mpris_error(503,'Command journal payload is not canonical');
        $seen[$entry['id']]=true;
    }
    foreach ($q['receipts'] as $entry) {
        if (!is_array($entry) || !mpris_id($entry['id']??null) || isset($seen[$entry['id']]) || !in_array($entry['outcome']??null,['dispatched','failed','uncertain','expired'],true) || !is_array($entry['payload']??null) || !array_key_exists('owner',$entry) || ($entry['owner']!==null && !mpris_id($entry['owner']))) mpris_error(503,'Command journal corrupt');
        if (mpris_payload($entry['payload'],503) !== $entry['payload']) mpris_error(503,'Command journal payload is not canonical');
        $seen[$entry['id']]=true;
    }
    return $q;
}
function mpris_finish(array &$q,string $outcome): void {
    $e=array_shift($q['pending']);
    $q['receipts'][]=['id'=>$e['id'],'owner'=>$e['owner'],'payload'=>$e['payload'],'outcome'=>$outcome];
    if (count($q['receipts'])>256) array_shift($q['receipts']);
}
function mpris_expire(array &$q,float $now): void {
    while ($q['pending']) {
        $e=$q['pending'][0];
        if ($e['owner']!==null) { if ($e['until']>$now) break; mpris_finish($q,'uncertain'); }
        elseif ($e['created']+60<=$now) mpris_finish($q,'expired');
        else break;
    }
}
function mpris_queue_write(string $path,array $q): void {
    $bytes=json_encode($q,JSON_UNESCAPED_SLASHES|JSON_PRESERVE_ZERO_FRACTION);
    if (!is_string($bytes) || strlen($bytes)>262144 || !mpris_atomic_write($path,$bytes)) mpris_error(503,'Command journal write failed');
}
function mpris_payload(array $json,int $errorCode=400): array {
    $cmd=$json['command']??null;
    if (!in_array($cmd,['PlayPause','Play','Pause','Stop','Next','Previous','Seek','SeekTo','SetVolume','ToggleShuffle','SetShuffle','SetLoopStatus'],true)) mpris_error($errorCode,'Invalid command');
    $payload=['command'=>$cmd];
    $key=['Seek'=>'offset','SeekTo'=>'position','SetVolume'=>'volume'][$cmd]??null;
    if ($key!==null) {
        $v=$json[$key]??null;
        if ((!is_int($v)&&!is_float($v)) || !is_finite($v) || ($cmd==='SeekTo'&&$v<0) || ($cmd==='SetVolume'&&($v<0||$v>1.5))) mpris_error($errorCode,'Invalid command value');
        $payload[$key]=(float)$v;
    }
    if ($cmd==='SetShuffle') { if (!is_bool($json['shuffle']??null)) mpris_error($errorCode,'Invalid shuffle'); $payload['shuffle']=$json['shuffle']; }
    if ($cmd==='SetLoopStatus') { if (!is_string($json['loopStatus']??null)||!in_array(strtolower($json['loopStatus']),['none','track','playlist'],true)) mpris_error($errorCode,'Invalid repeat'); $payload['loopStatus']=strtolower($json['loopStatus']); }
    return $payload;
}
switch ($action) {
    case 'update_state':
        $json = mpris_read_json(15*1024*1024);
        if (!in_array($json['status'] ?? null, ['Playing','Paused','Stopped'], true)) mpris_error(400, 'Invalid playback status');
        foreach (['position','duration','volume'] as $key) {
            $v = $json[$key] ?? null;
            if ((!is_int($v) && !is_float($v)) || !is_finite($v) || $v < 0 || ($key==='volume' && $v > 1.5)) mpris_error(400, 'Invalid playback value');
        }
        foreach (['title','artist','album','artUrl','coverPath'] as $key) {
            $v = $json[$key] ?? '';
            if (!is_string($v) || strlen($v) > (in_array($key,['artUrl','coverPath'],true) ? 14*1024*1024 : 65536)) mpris_error(400,'Invalid playback text');
        }
        $json['updated_at'] = microtime(true);
        $artUrl = $json['artUrl'] ?? '';
        $json['artFileUrl'] = '';
        if (strpos($artUrl, 'data:image/') === 0 && strpos($artUrl, ';base64,') !== false) {
            $parts = explode(';base64,', $artUrl, 2);
            $decoded = base64_decode($parts[1], true);
            if ($decoded === false || strlen($decoded)>10*1024*1024 || !@getimagesizefromstring($decoded)) mpris_error(400, 'Invalid artwork');
            if (!mpris_atomic_write($artCacheFile, $decoded)) mpris_error(503,'Artwork cache write failed');
            $json['artFileUrl'] = 'file://' . $artCacheFile . '?v=' . hash('sha256',$decoded);
            // Native clients use the materialized file, not a second base64 copy.
            $json['artUrl'] = ''; $json['coverPath'] = '';
        } elseif ($artUrl !== '') {
            $json['artFileUrl'] = $artUrl;
        }
        $bytes = json_encode($json, JSON_UNESCAPED_SLASHES);
        if (!is_string($bytes) || !mpris_atomic_write($stateFile, $bytes)) mpris_error(503,'Playback state write failed');
        echo json_encode(['success'=>true]);
        break;
    case 'get_state':
        if (is_file($stateFile) && !is_link($stateFile)) {
            $raw = @file_get_contents($stateFile, false, null, 0, 15*1024*1024+1);
            if (!is_string($raw) || strlen($raw)>15*1024*1024 || !is_array(json_decode($raw,true))) mpris_error(503,'Playback state unavailable');
            echo $raw;
        } else echo json_encode(['status'=>'Stopped','title'=>'CachyMusic','position'=>0]);
        break;
    case 'send_command':
    case 'get_command':
    case 'ack_command':
    case 'command_status':
        $json=$action==='command_status'?[]:mpris_read_json(8192);
        $lock=mpris_command_lock($cachyStateDir);
        $q=mpris_queue_read($cmdFile,$legacyCmdFile); $before=$q; $now=microtime(true);
        mpris_expire($q,$now);
        $result=['success'=>true]; $code=200;
        if ($action==='send_command') {
            $payload=mpris_payload($json); $id=$json['id']??bin2hex(random_bytes(16));
            if (!mpris_id($id)) mpris_error(400,'Invalid command identity');
            $match=null;
            foreach (array_merge($q['pending'],$q['receipts']) as $e) if ($e['id']===$id) {$match=$e;break;}
            if ($match!==null) {
                if ($match['payload']!==$payload) mpris_error(409,'Command identity conflict');
                $result+=['id'=>$id,'outcome'=>$match['outcome']??'queued'];
            } elseif (count($q['pending'])>=64) { $code=429;$result=['success'=>false,'message'=>'Command queue full']; }
            else { $q['pending'][]=['id'=>$id,'payload'=>$payload,'created'=>$now,'owner'=>null,'until'=>null];$result+=['id'=>$id,'outcome'=>'queued']; }
        } elseif ($action==='get_command') {
            $owner=$json['client']??null;if (!mpris_id($owner)) mpris_error(400,'Command client identity required; reload the player');
            $result+=['command'=>null];
            if ($q['pending']) {
                $e=&$q['pending'][0];
                if ($e['owner']===null) {$e['owner']=$owner;$e['until']=$now+15;}
                if ($e['owner']===$owner) $result=array_merge($result,$e['payload'],['id'=>$e['id'],'lease_ms'=>(int)floor(max(0,$e['until']-$now)*1000)]);
                unset($e);
            }
        } elseif ($action==='ack_command') {
            $owner=$json['client']??null;$id=$json['id']??null;$outcome=$json['outcome']??null;
            if (!mpris_id($owner)||!mpris_id($id)||!in_array($outcome,['dispatched','failed'],true)) mpris_error(400,'Invalid acknowledgement');
            $match=null; foreach ($q['receipts'] as $e) if ($e['id']===$id) {$match=$e;break;}
            if ($match!==null && $match['owner']===$owner) $result+=['id'=>$id,'outcome'=>$match['outcome']];
            elseif ($q['pending'] && $q['pending'][0]['id']===$id && $q['pending'][0]['owner']===$owner) {mpris_finish($q,$outcome);$result+=['id'=>$id,'outcome'=>$outcome];}
            else {$code=409;$result=['success'=>false,'message'=>'Unknown command claim'];}
        } else {
            $result+=['pending'=>count($q['pending']),'claimed'=>($q['pending'][0]['owner']??null)!==null,'legacy_pending'=>$q['legacy_pending'],'receipts'=>array_map(fn($e)=>['id'=>$e['id'],'outcome'=>$e['outcome']],$q['receipts'])];
        }
        if ($q!==$before) mpris_queue_write($cmdFile,$q);
        fclose($lock);http_response_code($code);echo json_encode($result);break;
    default: mpris_error(400,'Unknown action');
}
