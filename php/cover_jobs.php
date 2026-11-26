<?php
require_once __DIR__.'/scan_jobs.php';
require_once __DIR__.'/cover_extract.php';
require_once __DIR__.'/media_access.php';
require_once __DIR__.'/artwork_store.php';
// Disposable read-only jobs; bounded and scoped to the managed launch. A lost
// job may be retried safely. Never use the foreground mutation mailbox.
const CM_COVER_JOB_LIMIT=64;
const CM_COVER_JOB_BYTES=524288;
function cm_cover_job_path(): string {return cachy_data_dir().DIRECTORY_SEPARATOR.'cover-jobs.json';}
function cm_cover_job_valid($job): bool {
    return is_array($job)&&is_string($job['key']??null)&&preg_match('/^[a-f0-9]{64}$/D',$job['key'])===1
        &&CachyScanJob::validDirectory($job['path']??null)&&$job['path']!==''
        &&array_key_exists('tid',$job)&&($job['tid']===null||is_int($job['tid'])&&$job['tid']>0)
        &&is_bool($job['thumb']??null)&&in_array($job['kind']??null,['source','committed'],true)
        &&($job['kind']!=='committed'||($job['tid']!==null&&$job['thumb']));
}
function cm_cover_job_id(array $job): string {return hash('sha256',json_encode($job,JSON_THROW_ON_ERROR));}
function cm_cover_job_transaction(callable $operation) {
    $session=CachyScanJob::session();if ($session===null) return null;
    $path=cm_cover_job_path();$lock=cm_open_sidecar_lock($path.'.lock');if (!$lock) return null;
    try {
        if (!flock($lock,LOCK_EX|LOCK_NB)||!cm_regular_descriptor($lock,$path.'.lock')) return null;
        clearstatcache(true,$path);$stat=@lstat($path);$jobs=[];
        if ($stat!==false) {
            if (!cm_regular_stat($stat)||$stat['size']>CM_COVER_JOB_BYTES) return null;
            $raw=cm_read_regular_file($path,CM_COVER_JOB_BYTES);
            $saved=is_string($raw)&&strlen($raw)<=CM_COVER_JOB_BYTES?json_decode($raw,true):null;
            if (!is_array($saved)||!is_string($saved['session']??null)||!is_array($saved['jobs']??null)||count($saved['jobs'])>CM_COVER_JOB_LIMIT) return null;
            if ($saved['session']===$session) foreach($saved['jobs'] as $id=>$entry) {
                if (!is_array($entry)||!is_int($entry['expires']??null)||!cm_cover_job_valid($entry['job']??null)||$id!==cm_cover_job_id($entry['job'])) return null;
                if ($entry['expires']>time()) $jobs[$id]=$entry;
            }
        }
        $before=$jobs;$result=$operation($jobs);
        if ($jobs!==$before) {
            $bytes=json_encode(['session'=>$session,'jobs'=>$jobs],JSON_THROW_ON_ERROR);
            if (strlen($bytes)>CM_COVER_JOB_BYTES||!cm_replace_file($path,$bytes)) return null;
        }
        return $result;
    } catch(Throwable $e) {return null;} finally {fclose($lock);}
}
function cm_cover_job_enqueue(array $job): bool {
    if (!cm_cover_job_valid($job)||!CachyScanJob::ready()) return false;
    return cm_cover_job_transaction(function(&$jobs) use($job){
        $id=cm_cover_job_id($job);if(isset($jobs[$id])) return true;
        if(count($jobs)>=CM_COVER_JOB_LIMIT) return false;
        $jobs[$id]=['job'=>$job,'expires'=>time()+60];return true;
    })===true;
}
function cm_cover_job_next(): ?array {
    return cm_cover_job_transaction(fn(&$jobs)=>$jobs?reset($jobs)['job']:null);
}
function cm_cover_job_finish(array $job): void {
    cm_cover_job_transaction(function(&$jobs) use($job){unset($jobs[cm_cover_job_id($job)]);return true;});
}
function cm_cover_job_authorized(array $job): bool {
    $snapshot=Storage::read();if (!isset($snapshot['tracks'])) return false;
    $path=$job['path'];if (realpath($path)!==$path||!is_file($path)||!is_readable($path)) return false;
    if (!in_array(strtolower(pathinfo($path,PATHINFO_EXTENSION)),['mp3','wav','wave','ogg','oga','flac','m4a','aac','opus','wma','aiff','aif','alac','mp4'],true)) return false;
    if (!cm_media_path_allowed($path,cm_media_roots($snapshot))) return false;
    if ($job['tid']!==null) {
        $row=$snapshot['tracks'][(string)$job['tid']]??null;$stored=cm_media_record_path($row);
        if ($stored===null||realpath($stored)!==$path) return false;
        if ($job['kind']==='committed') return ($row['artwork_hash']??null)===$job['key'];
        if (array_key_exists('artwork_hash',$row)) return false;
    }
    return $job['kind']==='source';
}
function cm_cover_job_prepare(array $job,Closure $checkpoint): void {
    $checkpoint();if (!cm_cover_job_authorized($job)) return;
    $dir=cachy_cache_dir().DIRECTORY_SEPARATOR.'covers';
    if (!cachy_ensure_dir($dir)||is_link($dir)) return;
    $key=$job['key'];$path=$job['path'];
    if ($job['kind']==='committed') {
        if (cm_artwork_read($job['tid'],$key)!==null) {
            $checkpoint();cachy_cover_thumb(cm_artwork_dir($job['tid']).'/'.$key.'.img',$dir.'/edit-'.$key.'-128.jpg',$checkpoint);
        }
        return;
    }
    $source=cm_cover_source($path);if (!$source||$source['hash']!==$key) return;
    $full=$dir.'/'.$key.'.img';$none=$dir.'/'.$key.'.none';$thumb=$dir.'/'.$key.'_thumb.jpg';
    $image=cachy_cover_read($full);
    if (!$image) {
        if (cm_cover_cache_stat($none)!==null&&filesize($none)===0) return;
        $image=cm_cover_extract($path,$source,$checkpoint);
        $checkpoint();if (!cm_cover_job_authorized($job)||cm_cover_source($path)!==$source) return;
        if (!$image) {cm_cover_cache_publish($none,'');return;}
        if (!cm_cover_cache_publish($full,$image['bytes'])) return;
    }
    $checkpoint();if ($job['thumb']) cachy_cover_thumb($full,$thumb,$checkpoint);
}
