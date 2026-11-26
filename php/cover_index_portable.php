<?php
// Content-addressed, encrypted lookup projections for managed Windows PHP.
// Do not trust inode/mtime generation on Windows or persist cleartext paths.
// This optimization always reads the bounded authoritative JSON bytes; it
// avoids decoding them on a cache hit, not reading or hashing them.
function cm_portable_lookup_key(): ?string {
    $key=getenv('CACHYMUSIC_LOOKUP_KEY');
    if (getenv('CACHYMUSIC_MANAGED_SERVICES')!=='1'||!is_string($key)||!preg_match('/^[a-f0-9]{64}$/D',$key)
        ||!function_exists('sodium_crypto_aead_xchacha20poly1305_ietf_encrypt')||!function_exists('sodium_crypto_aead_xchacha20poly1305_ietf_decrypt')) return null;
    return hex2bin($key);
}
function cm_portable_lookup_dir(): ?string {
    $root=cachy_cache_dir();$dir=$root.DIRECTORY_SEPARATOR.'lookup-encrypted-v1';
    clearstatcache(true,$dir);
    if (is_link($dir)||(!is_dir($dir)&&!@mkdir($dir,0700)&&!is_dir($dir))) return null;
    clearstatcache(true,$dir);$stat=@lstat($dir);$real=realpath($dir);
    if (!$stat||($stat['mode']&0170000)!==0040000||$real===false) return null;
    $canonical=static function(string $p): string { $p=str_replace('\\','/',$p);return cachy_is_windows()?strtolower($p):$p; };
    if ($canonical($real)!==$canonical($dir)||is_link($dir)) return null;
    if (!cachy_is_windows()&&(($stat['mode']&0077)!==0||(function_exists('posix_geteuid')&&$stat['uid']!==posix_geteuid()))) return null;
    return $dir;
}
function cm_portable_lookup_read(string $file,string $key,string $aad): ?array {
    $raw=cm_read_regular_file($file,CM_COVER_INDEX_LIMIT);
    if (!is_string($raw)||strlen($raw)<44||substr($raw,0,4)!=='CMI1') return null;
    try {$plain=sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(substr($raw,28),$aad,substr($raw,4,24),$key);}
    catch (Throwable $e) {return null;}
    if (!is_string($plain)) return null;
    $data=json_decode($plain,true);
    return is_array($data)&&isset($data['tracks'],$data['soulseek'])&&is_array($data['tracks'])&&is_array($data['soulseek'])&&is_string($data['default_directory']??null)?$data:null;
}
function cm_portable_lookup_snapshot(?int $tid): array {
    $key=cm_portable_lookup_key();
    if ($key===null||Storage::hasMySQL()) return Storage::read();
    // The existing storage reader initializes only missing profiles. When
    // called directly without a profile, preserve that behavior.
    $library=cachy_data_dir().DIRECTORY_SEPARATOR.'library.json';
    if (!file_exists($library)&&!is_link($library)) return Storage::read();
    $raw=cm_read_regular_file($library,Storage::libraryByteLimit());
    if ($raw===false) return Storage::read();
    $bucket=($tid??0)%CM_COVER_INDEX_BUCKETS;
    // AEAD binds the projection to the exact authoritative bytes, the bucket
    // and the format. Same-size/mtime replacements invalidate the old entry.
    $aad='CachyMusic lookup v1:'.pack('N',$bucket).hash('sha256',$raw,true);
    try {$dir=cm_portable_lookup_dir();} catch(Throwable $e) {$dir=null;}
    $file=$dir===null?null:$dir.DIRECTORY_SEPARATOR.$bucket.'.idx';
    if ($file!==null) {
        $hit=cm_portable_lookup_read($file,$key,$aad);
        if ($hit!==null) return $hit;
    }
    $data=Storage::decodeLibrarySnapshot($raw);unset($raw);
    if ($data===null) return [];
    $projection=cm_cover_index_build($data,$bucket);
    if ($projection===null||$file===null) return $data;
    $payload=json_encode($projection,JSON_UNESCAPED_SLASHES);
    if (is_string($payload)&&strlen($payload)+44<=CM_COVER_INDEX_LIMIT) {
        try {
            $nonce=random_bytes(24);$encrypted=sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($payload,$aad,$nonce,$key);
            // Recheck the cache directory and never publish over aliases.
            clearstatcache(true,$file);$stat=@lstat($file);
            if (cm_portable_lookup_dir()===$dir&&($stat===false&&!is_link($file)||cm_regular_stat($stat))) cm_replace_file($file,'CMI1'.$nonce.$encrypted);
        } catch (Throwable $e) { /* optional cache failure cannot hide authoritative data */ }
    }
    return $projection;
}
