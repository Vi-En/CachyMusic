<?php
// Only launched as an owned desktop child, never a public HTTP endpoint.
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
require_once __DIR__.'/scan_jobs.php';
if (!CachyScanJob::session()) exit(2);
// Bound PHP-managed heap; this is not a process-tree RSS or OS disk quota.
if (trim((string)ini_get('memory_limit'))==='-1') ini_set('memory_limit','512M');
require_once __DIR__.'/api/scan.php';
require_once __DIR__.'/cover_index.php';
require_once __DIR__.'/folder_picker.php';
require_once __DIR__.'/cover_cache_budget.php';
require_once __DIR__.'/cover_jobs.php';
$worker=CachyScanJob::ownWorker();
if (function_exists('proc_nice')) @proc_nice(10);
$GLOBALS['cmScanWorkerStopping']=false;
if (function_exists('pcntl_async_signals')&&function_exists('pcntl_signal')) {
    pcntl_async_signals(true);pcntl_signal(SIGTERM, function(){ $GLOBALS['cmScanWorkerStopping']=true; });
    pcntl_signal(SIGINT, function(){ $GLOBALS['cmScanWorkerStopping']=true; });
}
$warmVersion=null;$observedVersion=null;$warmAfter=0;$nextCheck=0;$nextTrim=hrtime(true)/1e9+2;
while (!$GLOBALS['cmScanWorkerStopping']) {
    $state=CachyScanJob::claim();
    if (!$state) {
        // Debounce changes and avoid repeated failed warming on a corrupt or
        // oversized generation. New queued scans preempt warming checkpoints.
        $now=hrtime(true)/1e9;
        if ($now>=$nextTrim) {
            // Low-priority, bounded idle work. No unrecognized or authoritative file is removed.
            $nextTrim=$now+60;
            try { if (CachyScanJob::idle()) cm_cover_cache_trim(cachy_cache_dir().DIRECTORY_SEPARATOR.'covers'); } catch (Throwable $e) {} 
        }
        if (!cachy_is_windows()&&$now>=$nextCheck) {
            $nextCheck=$now+2;
            $v=cm_cover_library_version(cachy_data_dir().DIRECTORY_SEPARATOR.'library.json');
            if ($v!==$observedVersion) {$observedVersion=$v;$warmAfter=$now+2;}
            if ($v!==null&&$v!==$warmVersion&&$now>=$warmAfter) {
                $warmVersion=$v;
                try {cm_cover_warm_generation(fn()=>CachyScanJob::idle());} catch (Throwable $e) {} finally {Storage::abortBatch();}
            }
        }
        // Artwork is disposable idle work; mutation jobs preempt at checkpoints.
        if (CachyScanJob::idle()&&($coverJob=cm_cover_job_next())) {
            $preempted=false;
            try {cm_cover_job_prepare($coverJob,function() use (&$preempted){
                if (!CachyScanJob::idle()) {$preempted=true;throw new RuntimeException('Artwork work preempted');}
            });} catch(Throwable $e) {} finally {Storage::abortBatch();}
            if (!$preempted) cm_cover_job_finish($coverJob);
            unset($coverJob);gc_collect_cycles();if (function_exists('gc_mem_caches')) gc_mem_caches();
            continue;
        }
        usleep(250000);continue;
    }
    $job=new CachyScanJob($state['id']);$metadataCommit=false;$uncertain=false;
    try { $job->checkpoint();
        if (($state['request']['kind']??'scan')==='browse') $result=json_encode(cm_choose_folder($state['request']['directory'],$job),JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);
        elseif (($state['request']['kind']??'scan')==='metadata') {
            require_once __DIR__.'/metadata_edit.php';
            $edit=$job->metadataPayload($state);
            if (cm_meta_context($edit['input'])!==$edit['context']) cm_meta_error(409,'Recording or library authority changed before editing.');
            $job->beginCommit();$metadataCommit=true;
            $result=json_encode(cm_meta_edit($edit['input'],$edit['context']),JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR);
        }
        else [, $result]=cachy_execute_scan($state['request'],$state['request']['directory'],$job);
    }
    catch (CachyMetadataError $e) {$result=json_encode(['success'=>false,'message'=>$e->getMessage()]);}
    catch (Throwable $e) {if ($metadataCommit) $uncertain=true;else $result=json_encode(['success'=>false,'message'=>'Background operation failed before publication.']);}
    finally {Storage::abortBatch();}
    if ($uncertain) $job->uncertain();else $job->finish($result);
    unset($state,$job,$result,$edit);
    gc_collect_cycles();
    if (function_exists('gc_mem_caches')) gc_mem_caches();
}
