<?php
require_once __DIR__.'/database.php';
require_once __DIR__.'/media_access.php';
require_once __DIR__.'/recording_leases.php';
require_once __DIR__.'/flac_metadata.php';
require_once __DIR__.'/mp3_metadata.php';
require_once __DIR__.'/pcm_metadata.php';
require_once __DIR__.'/packet_metadata.php';
final class CachyMetadataError extends RuntimeException {}
function cm_meta_error(int $status,string $message): never { throw new CachyMetadataError($message,$status); }
function cm_meta_authorize($path,array $snapshot): void {
    if (!is_string($path)||$path===''||str_contains($path,"\0")) cm_meta_error(404,'Track not found');
    $real=realpath($path);
    if ($real===false||!is_file($real)||!is_readable($real)) cm_meta_error(404,'Track unavailable');
    if (!cm_media_path_allowed($real,cm_media_roots($snapshot,Storage::hasMySQL()))) cm_meta_error(403,'Track is outside authorized library directories');
}

// Bind deferred edits to the authorized recording and its observed version.
// Filesystem identity is not a cryptographic content fingerprint.
function cm_meta_context(array $input, ?array $snapshot=null): array {
    $tid=cachy_positive_id($input['tid']??null);
    if (!$tid) cm_meta_error(400,'Invalid track ID');
    $snapshot=$snapshot??Storage::read();
    $row=$snapshot['tracks'][(string)$tid]??null;
    $path=cm_media_record_path($row);
    cm_meta_authorize($path,$snapshot);
    clearstatcache(true,$path);$real=realpath($path);$stat=$real!==false?@stat($real):false;
    if (!$stat) cm_meta_error(409,'Recording unavailable');
    return ['path'=>$path,'real'=>$real,'authority'=>cm_media_authority($snapshot),'record'=>hash('sha256',json_encode($row,JSON_THROW_ON_ERROR)),'version'=>array_map(fn($key)=>$stat[$key],['dev','ino','size','mtime','ctime'])];
}
function cm_meta_edit(array $input,?array $expected=null): array {
    // Prevent root revocation between the authorization snapshot, library
    // commit and original-file publication. Metadata-only edits already use
    // an expected-authority precondition under the library write lock.
    $authorityGuard=null;
    if (($input['write_file']??false)===true && !Storage::hasMySQL()) {
        $authorityGuard=cm_recording_authority_lock(false);
        if (!$authorityGuard) cm_meta_error(409,'Library directories are changing; retry the edit.');
    }
    try {return cm_meta_edit_guarded($input,$expected);}
    finally {if (is_resource($authorityGuard)) fclose($authorityGuard);}
}
function cm_meta_edit_guarded(array $input,?array $expected=null): array {
    if (array_key_exists('write_file',$input)&&!is_bool($input['write_file'])) cm_meta_error(400,'Invalid write_file flag');
    $tid = cachy_positive_id($input['tid'] ?? null);
    if (!$tid) cm_meta_error(400,'Missing or invalid track ID (tid).');

    $fields = [];
    $allowed = ['title', 'artist', 'album', 'genre', 'year', 'track_num', 'lyrics', 'comment'];
    foreach ($allowed as $f) {
        if (array_key_exists($f,$input)) {
            $v=$input[$f]; if($v!==null && !is_string($v) && !is_int($v)) cm_meta_error(400,'Invalid field');
            if(strlen((string)$v)>($f==='lyrics'?262144:($f==='track_num'?50:4096))) cm_meta_error(400,'Field too long');
            $fields[$f] = $v;
        }
    }

    // The SQL beta route supports SQL-native text fields only. Do not stage
    // local objects or rewrite an original when a multi-store commit is unavailable.
    if (Storage::hasMySQL()) {
        if (($input['write_file']??false)===true||isset($input['cover_data'])||trim((string)($fields['comment']??''))!=='') cm_meta_error(409,'SQL beta supports library text edits only; artwork, comments and original-file edits require the local JSON profile.');
        unset($fields['comment']);
    }
    // Require an indexed track and validate artwork before writing anything.
    $snapshot=Storage::read();
    if ($expected !== null && cm_meta_context($input, $snapshot) !== $expected) cm_meta_error(409,'Recording or library authority changed before editing. Refresh and retry.');
    $filePath=Storage::hasMySQL()?Storage::getTrackPath($tid):cm_media_record_path($snapshot['tracks'][(string)$tid]??null);
    cm_meta_authorize($filePath,$snapshot);
    // Keep the path reservation through library commit and the original rewrite.
    // A conflicting active stream rejects the whole edit before publication.
    $guard=null;
    if (($input['write_file']??false)===true) {
        $canonical=realpath($filePath);
        $sourceStat=$canonical?@lstat($canonical):false;
        if (!$sourceStat||!cm_regular_stat($sourceStat)) cm_meta_error(409,'Original-file editing requires a regular single-link recording.');
        if (!$canonical||!($guard=cm_recording_lock($canonical,true))) cm_meta_error(409,'Recording is currently in use; retry after playback stops.');
    }
    try {
    if (is_resource($guard)) {
        try {$reserved=cm_recording_has_lease($canonical);} catch (Throwable $e) {cm_meta_error(503,'Recording reservation state unavailable; retry after checking storage.');}
        if ($reserved) cm_meta_error(409,'Recording is reserved by a listening client; pause playback and retry.');
    }
    $coverData=$input['cover_data']??null; $coverSaved=false; $rawBinary=null; $info=null;
    if ($coverData !== null) {
        if(!is_string($coverData)||!preg_match('#^data:(image/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$#D',$coverData,$m)) cm_meta_error(400,'Unsupported artwork');
        $rawBinary=base64_decode($m[2],true);
        if($rawBinary===false||strlen($rawBinary)>10*1024*1024) cm_meta_error(400,'Invalid artwork size');
        $info=@getimagesizefromstring($rawBinary);
        if(!$info||$info['mime']!==$m[1]||$info[0]<1||$info[1]<1||$info[0]>8192||$info[1]>8192||$info[0]*$info[1]>16000000) cm_meta_error(400,'Invalid artwork dimensions');
        $hash = cm_artwork_stage($tid, $rawBinary);
        if ($hash === null) cm_meta_error(500,'Cannot stage artwork');
        $fields['artwork_hash'] = $hash;
        $fields['has_cover'] = 1;
        $coverSaved = true;
    }

    $updatedTrack = Storage::updateTrackMetadata($tid, $fields, $filePath, Storage::hasMySQL()?null:cm_media_authority($snapshot),$expected['record']??null);
    if (!$updatedTrack) {
        cm_meta_error(409,'Track changed or library commit failed; retry after checking storage.');
    }

    if ($coverSaved) {
        $updatedTrack['has_cover'] = 1;
        $updatedTrack['cover'] = 'php/api/cover.php?tid=' . $tid . '&v=' . $fields['artwork_hash'];
    }

    // Only write to the original file following an explicit user request.
    $tagWriteAttempted=false; $tagWriteSuccess=false;
    $realPath=realpath($filePath);$dir=Storage::getDefaultDirectory();$root=$dir?realpath($dir):false;
    if(($input['write_file']??false)===true && $realPath && $root && is_dir($root) && !is_link($filePath) && is_file($realPath) && is_writable($realPath)
        && cachy_is_allowed_scan_path(dirname($realPath)) && str_starts_with(cachy_normalize_path($realPath),rtrim(cachy_normalize_path($root),'/').'/')
        && in_array(strtolower(pathinfo($realPath,PATHINFO_EXTENSION)),['flac','mp3','wav','wave','aif','aiff','ogg','opus','oga','m4a','alac'],true)) {
        $tagWriteAttempted=true;$writer=match(strtolower(pathinfo($realPath,PATHINFO_EXTENSION))){'flac'=>'cm_flac_rewrite','mp3'=>'cm_mp3_rewrite','ogg','opus','oga','m4a','alac'=>'cm_packet_rewrite',default=>'cm_pcm_tag_rewrite'};
        clearstatcache(true,$filePath);$stat=@stat($filePath);
        $unchanged=$expected===null||($stat&&realpath($filePath)===$expected['real']&&array_map(fn($key)=>$stat[$key],['dev','ino','size','mtime','ctime'])===$expected['version']);
        if ($unchanged && ($expected===null||cm_media_authority(Storage::read())===$expected['authority'])) $tagWriteSuccess=$writer($realPath,$fields,$rawBinary,$info);
    }

    return [
        'success'           => true,
        'message'           => 'Metadata saved successfully.',
        'track'             => $updatedTrack,
        'tagWriteAttempted' => $tagWriteAttempted,
        'tagWriteSuccess'   => $tagWriteSuccess
    ];
    } finally {if (is_resource($guard)) fclose($guard);}

}
