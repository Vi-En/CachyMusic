<?php
require_once __DIR__.'/recording_lock.php';
// Cooperative, bounded reservations for buffered desktop playback. This is
// not a transport lock: a suspended or disconnected client can lose its lease.
const CM_RECORDING_LEASE_TTL=90;
const CM_RECORDING_LEASE_MAX=128;
const CM_RECORDING_LEASE_BYTES=32768;
function cm_recording_lease_id($value): bool {return is_string($value)&&preg_match('/^[a-f0-9]{32}$/D',$value)===1;}
function cm_recording_lease_state(callable $operation) {
    $file=cachy_data_dir().DIRECTORY_SEPARATOR.'recording-leases.json';
    $lock=cm_open_sidecar_lock($file.'.lock');
    if (!$lock) throw new RuntimeException('Unsafe reservation lock');
    try {
        if (!flock($lock,LOCK_EX|LOCK_NB)||!cm_regular_descriptor($lock,$file.'.lock')) throw new RuntimeException('Reservations busy');
        clearstatcache(true,$file);$stat=@lstat($file);$rows=[];$now=time();
        if ($stat!==false) {
            if (!cm_regular_stat($stat)||$stat['size']>CM_RECORDING_LEASE_BYTES) throw new RuntimeException('Unsafe reservation journal');
            $h=@fopen($file,'rb');if (!$h) throw new RuntimeException('Unavailable reservation journal');
            try {if (!cm_regular_descriptor($h,$file)) throw new RuntimeException('Reservation journal changed');$raw=stream_get_contents($h,CM_RECORDING_LEASE_BYTES+1);} finally {fclose($h);}
            $decoded=is_string($raw)&&strlen($raw)<=CM_RECORDING_LEASE_BYTES?json_decode($raw,true):null;
            if (!is_array($decoded)||($decoded['version']??null)!==1||!is_array($decoded['leases']??null)||count($decoded['leases'])>CM_RECORDING_LEASE_MAX) throw new RuntimeException('Invalid reservation journal');
            foreach ($decoded['leases'] as $id=>$row) {
                if (!cm_recording_lease_id($id)||!is_array($row)||!is_string($row['key']??null)||!preg_match('/^[a-f0-9]{64}$/D',$row['key'])||!is_int($row['expires']??null)||$row['expires']<0||$row['expires']>$now+CM_RECORDING_LEASE_TTL) throw new RuntimeException('Invalid reservation entry or server clock changed');
                if ($row['expires']>$now) $rows[$id]=$row;
            }
        }
        [$result,$write]=$operation($rows,$now);
        if ($write) {
            $bytes=json_encode(['version'=>1,'leases'=>(object)$rows],JSON_THROW_ON_ERROR);
            if (strlen($bytes)>CM_RECORDING_LEASE_BYTES||!cm_replace_file($file,$bytes)) throw new RuntimeException('Reservation publication failed');
        }
        return $result;
    } finally {fclose($lock);}
}
function cm_recording_lease_renew(string $owner,string $real): bool {
    if (!cm_recording_lease_id($owner)) return false;
    // Same lock order as original-file edit: path guard, then journal lock.
    $guard=cm_recording_lock($real,false);if (!$guard) return false;
    try {
        return cm_recording_lease_state(function (&$rows,$now) use ($owner,$real) {
            if (!isset($rows[$owner])&&count($rows)>=CM_RECORDING_LEASE_MAX) return [false,false];
            $rows[$owner]=['key'=>cm_recording_key($real),'expires'=>$now+CM_RECORDING_LEASE_TTL];return [true,true];
        });
    } finally {fclose($guard);}
}
function cm_recording_lease_release(string $owner): void {
    if (!cm_recording_lease_id($owner)) throw new InvalidArgumentException('Invalid reservation ID');
    cm_recording_lease_state(function (&$rows) use ($owner) {$had=isset($rows[$owner]);unset($rows[$owner]);return [null,$had];});
}
// Caller must already own the exclusive recording guard. Fail closed on
// journal errors; normal read-only playback never depends on this journal.
function cm_recording_has_lease(string $real): bool {
    return cm_recording_lease_state(function (&$rows) use ($real) {
        $key=cm_recording_key($real);foreach($rows as $row) if (hash_equals($row['key'],$key)) return [true,false];return [false,false];
    });
}

// Profile-wide authority gate. Keep authorization stable from lookup through
// lease publication, and through an original-file edit. Authority changes take
// an exclusive guard before checking the journal and publishing the new roots.
// All acquisitions are nonblocking: storage may already own its write lock.
function cm_recording_authority_lock(bool $exclusive) {
    $path=cachy_data_dir().DIRECTORY_SEPARATOR.'recording-authority.lock';
    $h=cm_open_sidecar_lock($path);
    if (!$h) return false;
    if (!flock($h,($exclusive?LOCK_EX:LOCK_SH)|LOCK_NB)||!cm_regular_descriptor($h,$path)) {fclose($h);return false;}
    return $h;
}
function cm_recording_authority_change_guard() {
    $h=cm_recording_authority_lock(true);
    if (!$h) return false;
    try {
        // Journal stores hashes, not raw paths. Conservatively refuse any root
        // change while a reservation is live, even if it would retain access.
        if (cm_recording_lease_state(fn($rows)=>[count($rows)===0,false])) return $h;
    } catch (Throwable $e) { /* Unsafe journal: refuse authority mutation. */ }
    fclose($h);return false;
}
