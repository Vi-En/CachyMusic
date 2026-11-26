<?php
require_once __DIR__.'/platform.php';
require_once __DIR__.'/durable_file.php';
require_once __DIR__.'/scan_budget.php';
// One bounded durable job and one bounded result per profile. Session identity
// is set only by the owned launcher; old jobs cannot be silently replayed.
final class CachyScanJob {
    private const ACTIVE=['queued','running','cancelling','committing'];
    private const RESULT_LIMIT=67108864;
    private const EDIT_LIMIT=15728640;
    private static function validHash($value): bool {return is_string($value)&&preg_match('/^[a-f0-9]{64}$/D',$value)===1;}
    private float $nextCheck=0;
    public function __construct(private string $id) {}
    public static function session(): ?string {
        $s=getenv('CACHYMUSIC_SCAN_SESSION');
        return is_string($s)&&preg_match('/^[a-f0-9]{48}$/D',$s)&&getenv('CACHYMUSIC_DB_ENABLED')!=='1'&&getenv('CACHYMUSIC_PLAYLIST_SQL')!=='1' ? $s : null;
    }
    private static function path(string $name): string { return cachy_data_dir().DIRECTORY_SEPARATOR.'scan-job-'.$name; }
    private static function regular(string $file): bool {
        clearstatcache(true,$file); $s=@lstat($file);
        return !$s || (($s['mode']&0170000)===0100000&&$s['nlink']===1);
    }
    private static function lock(string $name) {
        $file=self::path($name); if (!self::regular($file)) throw new RuntimeException('Unsafe scan job storage');
        $h=cm_open_sidecar_lock($file); if (!$h) throw new RuntimeException('Scan job lock unavailable');
        return $h;
    }
    public static function ownWorker() {
        $h=self::lock('worker.lock');
        if (!flock($h,LOCK_EX|LOCK_NB)||!cm_regular_descriptor($h,self::path('worker.lock'))) { fclose($h); throw new RuntimeException('Scan worker already owned'); }
        try {
            $owner=self::path('worker-owner.txt');
            if (!self::regular($owner)||!cm_replace_file($owner,'')) throw new RuntimeException('Cannot clear old worker ownership');
            // Even a replacement within the same launch must never silently
            // re-run a queued or partially published operation from its predecessor.
            self::locked(function(){ $s=self::read();if ($s&&in_array($s['phase'],self::ACTIVE,true)) {$s['phase']='uncertain';self::save($s);} });
            self::clearEdit();
            if (!cm_replace_file($owner,self::session())) throw new RuntimeException('Cannot publish worker ownership');
        } catch (Throwable $e) {fclose($h);throw $e;}
        return $h;
    }
    public static function ready(): bool {
        if (!self::session()) return false;
        $h=self::lock('worker.lock');
        try { if (flock($h,LOCK_EX|LOCK_NB)) return false;
            // Ownership is a separate atomic file; Windows locks can deny reads.
            $owner=self::path('worker-owner.txt');return self::regular($owner)&&cm_read_regular_file($owner,48)===self::session();
        } finally { fclose($h); }
    }
    private static function locked(callable $fn) {
        $h=self::lock('state.lock');$deadline=hrtime(true)+500000000;
        try { while (!flock($h,LOCK_EX|LOCK_NB)) { if (hrtime(true)>=$deadline) throw new RuntimeException('Scan job storage busy');usleep(10000); }
            if (!cm_regular_descriptor($h,self::path('state.lock'))) throw new RuntimeException('Scan job lock changed');
            return $fn();
        } finally { fclose($h); }
    }
    private static function read(): ?array {
        $file=self::path('state.json');if (!self::regular($file)) throw new RuntimeException('Unsafe scan job state');
        if (!is_file($file)) return null;
        $raw=cm_read_regular_file($file,16384);$state=is_string($raw)&&strlen($raw)<=16384?json_decode($raw,true):null;
        if (!is_array($state)||!is_string($state['session']??null)) throw new RuntimeException('Invalid scan job state');
        if ($state['session']!==self::session()) return null;
        if (!self::validId($state['id']??null)||!in_array($state['phase']??null,[...self::ACTIVE,'done','cancelled','uncertain'],true)||!self::validRequest($state['request']??null)) throw new RuntimeException('Invalid scan job state');
        return $state;
    }
    private static function save(array $state): void {
        $file=self::path('state.json');if (!self::regular($file)||!cm_replace_file($file,json_encode($state,JSON_THROW_ON_ERROR))) throw new RuntimeException('Scan job state could not be saved');
    }
    public static function validId($id): bool { return is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id)===1; }
    public static function validDirectory($dir): bool {return is_string($dir)&&strlen($dir)<=4096&&!str_contains($dir,"\0")&&preg_match('//u',$dir)===1;}
    public static function validRequest($req): bool { return is_array($req)&&is_string($req['directory']??null)&&strlen($req['directory'])<=4096&&!str_contains($req['directory'],"\0")&&preg_match('//u',$req['directory'])===1&&is_bool($req['preserveDirectory']??null)&&in_array($req['kind']??'scan',['scan','browse','metadata'],true)&&(($req['kind']??'scan')!=='metadata'||self::validHash($req['payloadHash']??null))&&(!array_key_exists('expectedDirectory',$req)||self::validDirectory($req['expectedDirectory'])); }
    private static function publicState(array $s): array {return ['id'=>$s['id'],'phase'=>$s['phase']];}
    public static function start(string $id,array $req,?array $edit=null): array {
        if (!self::ready()) return [503,['success'=>false,'message'=>'Background scan worker unavailable. Restart the desktop backend.']];
        return self::locked(function() use($id,$req,$edit){
            if (!self::ready()) return [503,['message'=>'Background worker unavailable']];
            $s=self::read();
            if ($s && $s['id']===$id) return $s['request']===$req ? [200,self::publicState($s)] : [409,['message'=>'Scan request identity conflict']];
            if ($s&&in_array($s['phase'],self::ACTIVE,true)) return [409,['message'=>'Another library scan is active. Retry when it finishes.']];
            $s=['session'=>self::session(),'id'=>$id,'phase'=>'queued','request'=>$req];
            if (($req['kind']??'scan')==='metadata') {
                if ($edit===null) throw new RuntimeException('Missing edit payload');
                require_once __DIR__.'/metadata_edit.php';
                $bytes=json_encode(['input'=>$edit,'context'=>cm_meta_context($edit)],JSON_THROW_ON_ERROR);
                $file=self::path('edit.json');
                if (strlen($bytes)>self::EDIT_LIMIT+32768||!self::regular($file)||!cm_replace_file($file,$bytes)) throw new RuntimeException('Cannot stage edit payload');
                $s['edit_hash']=hash('sha256',$bytes);
            }
            self::save($s);
            return [202,self::publicState($s)];
        });
    }
    public static function status(string $id,bool $result=false): array {
        return self::locked(function() use($id,$result){
            $s=self::read();if (!$s||$s['id']!==$id) return [404,['message'=>'Scan job no longer available']];
            if (in_array($s['phase'],self::ACTIVE,true)&&!self::ready()) { $s['phase']='uncertain';self::save($s); }
            if (!$result) return [200,self::publicState($s)];
            if ($s['phase']!=='done') return [409,['message'=>'Scan result not available']];
            $file=self::path('result.json');if (!self::regular($file)) throw new RuntimeException('Unsafe scan result');
            $raw=cm_read_regular_file($file,self::RESULT_LIMIT);
            if (!is_string($raw)||strlen($raw)>self::RESULT_LIMIT||!hash_equals($s['result_hash']??'',hash('sha256',$raw))) throw new RuntimeException('Scan result invalid');
            return [200,$raw];
        });
    }
    public static function cancel(string $id): array {
        return self::locked(function() use($id){
            $s=self::read();if (!$s||$s['id']!==$id) return [404,['message'=>'Scan job no longer available']];
            if ($s['phase']==='queued') {$s['phase']='cancelled';}elseif ($s['phase']==='running') $s['phase']='cancelling';elseif ($s['phase']==='committing') return [409,['message'=>'Scan publication already started; refresh after completion.']];
            self::save($s);if ($s['phase']==='cancelled') self::clearEdit();return [200,self::publicState($s)];
        });
    }
    public static function idle(): bool {
        $s=self::read();return empty($GLOBALS['cmScanWorkerStopping']) && (!$s||!in_array($s['phase'],self::ACTIVE,true));
    }
    public static function claim(): ?array {
        return self::locked(function(){
            $s=self::read();if (!$s||$s['phase']!=='queued') return null;
            $s['phase']='running';self::save($s);return $s;
        });
    }
    public function metadataPayload(array $state): array {
        $file=self::path('edit.json');
        if (!self::regular($file)||!self::validHash($state['edit_hash']??null)) throw new RuntimeException('Invalid metadata job');
        $bytes=cm_read_regular_file($file,self::EDIT_LIMIT+32768);
        if (!is_string($bytes)||strlen($bytes)>self::EDIT_LIMIT+32768||!hash_equals($state['edit_hash'],hash('sha256',$bytes))) throw new RuntimeException('Invalid metadata payload');
        $data=json_decode($bytes,true,512,JSON_THROW_ON_ERROR);
        if (!is_array($data['input']??null)||!is_array($data['context']??null)) throw new RuntimeException('Invalid metadata payload');
        return $data;
    }
    private static function clearEdit(): void {
        $file=self::path('edit.json');if (self::regular($file)&&is_file($file)) @unlink($file);
    }
    public function checkpoint(): void {
        if (!empty($GLOBALS['cmScanWorkerStopping'])) throw new CachyScanLimit('Background worker is stopping.');
        $now=hrtime(true)/1e9;if ($now<$this->nextCheck) return;$this->nextCheck=$now+0.2;
        // Atomic state reads need no shared lock. Commit uses the lock below.
        $s=self::read();if (!$s||$s['id']!==$this->id||$s['phase']!=='running') throw new CachyScanLimit('Background scan cancelled or superseded.');
    }
    public function beginCommit(): void {
        if (!empty($GLOBALS['cmScanWorkerStopping'])) throw new CachyScanLimit('Background worker is stopping.');
        self::locked(function(){ $s=self::read();if (!$s||$s['id']!==$this->id||$s['phase']!=='running') throw new CachyScanLimit('Background scan cancelled before publication.');$s['phase']='committing';self::save($s); });
    }
    public function uncertain(): void {
        self::locked(function(){
            $s=self::read();if (!$s||$s['id']!==$this->id||!in_array($s['phase'],self::ACTIVE,true)) throw new RuntimeException('Job ownership lost');
            $s['phase']='uncertain';self::save($s);self::clearEdit();
        });
    }
    public function finish(string $result): void {
        // Do not hold the state lock while writing a potentially large result.
        // No new job may be accepted before this job reaches a terminal state.
        $file=self::path('result.json');
        if (strlen($result)>self::RESULT_LIMIT||!self::regular($file)||!cm_replace_file($file,$result)) throw new RuntimeException('Scan result could not be published');
        self::locked(function() use($result){
            $s=self::read();if (!$s||$s['id']!==$this->id||!in_array($s['phase'],['running','cancelling','committing'],true)) throw new RuntimeException('Scan job ownership lost');
            $s['phase']=$s['phase']==='cancelling'?'cancelled':'done';$s['result_hash']=hash('sha256',$result);self::save($s);if (($s['request']['kind']??'scan')==='metadata') self::clearEdit();
        });
    }
}
