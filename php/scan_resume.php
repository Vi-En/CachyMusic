<?php
// Disposable, bounded metadata journal. Never contains provisional IDs or
// authorizes a path. The scanner re-traverses and revalidates every file.
final class CachyScanResume {
    private const LIMIT=16777216, ROW_LIMIT=524288;
    private string $path;
    private array $entries=[];
    private $handle=null;
    private int $bytes=0;
    public function __construct(string $root) {
        $this->path=cachy_data_dir().DIRECTORY_SEPARATOR.'scan-resume-v1.jsonl';
        $probe=cachy_find_binary('ffprobe');$ps=$probe?@stat($probe):null;
        $header=json_encode(['root'=>$root,'parser'=>'6.65-v2','php'=>PHP_VERSION_ID,'probe'=>$probe,'probeIdentity'=>$ps?[$ps['dev'],$ps['ino'],$ps['size'],$ps['mtime'],$ps['ctime']]:null],JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR)."\n";
        clearstatcache(true,$this->path);
        $stat=@lstat($this->path);
        if ($stat && (($stat['mode'] & 0170000)!==0100000 || $stat['nlink']!==1 || (!cachy_is_windows() && ($stat['mode'] & 0077)!==0))) return;
        if ($stat && $stat['size']<=self::LIMIT) {
            $f=@fopen($this->path,'rb');
            if ($f) {
                $readBytes=strlen($header);
                if (cm_regular_descriptor($f,$this->path)&&fgets($f,8192)===$header) {
                    while (($line=fgets($f,self::ROW_LIMIT+2))!==false) {
                        if (!str_ends_with($line,"\n") || strlen($line)>self::ROW_LIMIT || ($readBytes+=strlen($line))>self::LIMIT) break;
                        if (strlen($line)<67||$line[64]!==' ') break;
                        $payload=substr($line,65,-1);
                        if (!hash_equals(substr($line,0,64),hash('sha256',$payload))) break;
                        $r=json_decode($payload,true);
                        if (!is_array($r)||!is_string($r['path']??null)||!is_string($r['fingerprint']??null)||!is_array($r['meta']??null)||!self::valid($r['meta'])) break;
                        $this->entries[$r['path']]=$r;
                        if (count($this->entries)>25000) { $this->entries=[]; break; }
                    }
                    // An interrupted final append is never reused or extended.
                }
                if (!cm_regular_descriptor($f,$this->path)) $this->entries=[];
                fclose($f);
            }
        }
        // Compact once per scan; cap both entries and total bytes. If the
        // cache cannot be published, indexing still works without checkpoints.
        $raw=$header;
        foreach ($this->entries as $r) {
            $payload=json_encode($r,JSON_INVALID_UTF8_SUBSTITUTE|JSON_UNESCAPED_SLASHES);
            if (!is_string($payload)) continue;
            $line=hash('sha256',$payload).' '.$payload."\n";
            if (strlen($raw)+strlen($line)>self::LIMIT) break;
            $raw.=$line;
        }
        $published=null;
        if (cm_replace_file($this->path,$raw,0600,$published)&&is_array($published)&&$published['ino']>0) {
            // Open only an existing file; never create a replacement journal.
            $this->handle=@fopen($this->path,'r+b'); $this->bytes=strlen($raw);
            if (is_resource($this->handle)) {
                $opened=@fstat($this->handle);
                if (!cm_regular_descriptor($this->handle,$this->path)||!$opened||$opened['dev']!==$published['dev']||$opened['ino']!==$published['ino']||$opened['size']!==$this->bytes||fseek($this->handle,0,SEEK_END)!==0) $this->close();
            }
        }
    }
    private static function valid(array $m): bool {
        foreach (['title','artist','album','genre','year','track','duration','bitrate','sampleRate','channels','codec','hasCover','lyrics'] as $k) {
            if (!array_key_exists($k,$m) || (!is_scalar($m[$k]) && $m[$k]!==null)) return false;
        }
        foreach (['bitDepth','replayGain','replayPeak'] as $k) if (isset($m[$k])&&!is_scalar($m[$k])) return false;
        return is_string($m['codec']) && is_bool($m['hasCover']) && is_numeric($m['duration']) && (float)$m['duration']>0;
    }
    public function fingerprint(string $path): ?string {
        if (preg_match('//u',$path)!==1) return null;
        // Sidecar availability is part of raw metadata identity. No content
        // hash of entire audio file: stat-preserving changes remain possible.
        $dir=dirname($path);$base=pathinfo($path,PATHINFO_FILENAME);
        $files=[$path,$dir.'/'.$base.'.lrc',$dir.'/'.$base.'.lyrics'];
        foreach (['cover.jpg','cover.png','folder.jpg','folder.png','front.jpg','front.png','album.jpg'] as $name) $files[]=$dir.'/'.$name;
        $parts=[];
        foreach ($files as $i=>$file) {
            clearstatcache(true,$file);$s=@lstat($file);
            if ($i===0 && (!$s || ($s['mode']&0170000)!==0100000 || $s['ino']<=0)) return null;
            $parts[]=$s ? [$s['dev'],$s['ino'],$s['mode'],$s['nlink'],$s['size'],$s['mtime'],$s['ctime']] : null;
        }
        return hash('sha256',serialize($parts));
    }
    public function lookup(string $path,?string $fingerprint): ?array {
        $entry=$this->entries[$path]??null;
        return $fingerprint!==null && $entry && $entry['fingerprint']===$fingerprint ? $entry['meta'] : null;
    }
    public function record(string $path,string $fingerprint,array $meta): void {
        if (!is_resource($this->handle)||!self::valid($meta)) return;
        $opened=@fstat($this->handle);
        if (!cm_regular_descriptor($this->handle,$this->path)||!$opened||$opened['size']!==$this->bytes) {$this->close();return;}
        $line=json_encode(['path'=>$path,'fingerprint'=>$fingerprint,'meta'=>$meta],JSON_INVALID_UTF8_SUBSTITUTE|JSON_UNESCAPED_SLASHES);
        if (!is_string($line)||strlen($line)+66>self::ROW_LIMIT||$this->bytes+strlen($line)+66>self::LIMIT) return;
        $line=hash('sha256',$line).' '.$line."\n";
        if (@fwrite($this->handle,$line)!==strlen($line)||!@fflush($this->handle)) { $this->close(); return; }
        $this->bytes+=strlen($line);
    }
    public function close(): void { if (is_resource($this->handle)) fclose($this->handle);$this->handle=null; }
    public function complete(): void {
        $owned=is_resource($this->handle)&&cm_regular_descriptor($this->handle,$this->path)?@fstat($this->handle):false;
        $this->close();clearstatcache(true,$this->path);$named=@lstat($this->path);
        if (cm_regular_stat($owned)&&cm_regular_stat($named)&&$owned['ino']>0&&$owned['size']===$this->bytes&&$owned['dev']===$named['dev']&&$owned['ino']===$named['ino']&&$owned['size']===$named['size']&&$owned['mtime']===$named['mtime']&&$owned['ctime']===$named['ctime']) @unlink($this->path);
    }
}
