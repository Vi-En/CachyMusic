<?php
// Native FLAC tag editing. No external commands or audio re-encoding.
function cm_flac_read($f, int $n): string {
    $s=''; while(strlen($s)<$n && !feof($f)){ $chunk=fread($f,$n-strlen($s)); if($chunk===false||$chunk==='')break; $s.=$chunk; }
    if(strlen($s)!==$n) throw new RuntimeException('Truncated FLAC'); return $s;
}
function cm_flac_write($f,string $s): void { $p=0; while($p<strlen($s)){ $n=fwrite($f,substr($s,$p)); if(!$n)throw new RuntimeException('Write failed'); $p+=$n; } }
function cm_flac_comments(string $data,array $fields): string {
    $p=0; $num=function()use(&$p,$data){if($p+4>strlen($data))throw new RuntimeException('Invalid comments');$n=unpack('V',substr($data,$p,4))[1];$p+=4;return $n;};
    $text=function()use(&$p,$data,$num){$n=$num();if($n>strlen($data)-$p)throw new RuntimeException('Invalid comments');$s=substr($data,$p,$n);$p+=$n;return $s;};
    $vendor=$text();$count=$num();if($count>100000)throw new RuntimeException('Excessive comments');
    $map=['title'=>'TITLE','artist'=>'ARTIST','album'=>'ALBUM','genre'=>'GENRE','year'=>'DATE','track_num'=>'TRACKNUMBER','comment'=>'COMMENT','lyrics'=>'LYRICS'];
    $keys=[];foreach($map as $k=>$tag)if(array_key_exists($k,$fields))$keys[$tag]=true;
    $entries=[];for($i=0;$i<$count;$i++){ $s=$text();$k=strtoupper(explode('=',$s,2)[0]);if(!isset($keys[$k]))$entries[]=$s; }
    foreach($map as $k=>$tag)if(isset($fields[$k])&&(string)$fields[$k]!=='')$entries[]=$tag.'='.$fields[$k];
    $out=pack('V',strlen($vendor)).$vendor.pack('V',count($entries));foreach($entries as $s)$out.=pack('V',strlen($s)).$s;return $out;
}
function cm_flac_rewrite(string $path,array $fields,?string $picture=null,?array $info=null): bool {
    $in=null;$out=null;$temp=null;
    try {
        $in=fopen($path,'rb');if(!$in||!flock($in,LOCK_EX|LOCK_NB))throw new RuntimeException('File unavailable');
        $before=fstat($in);if(!$before||cm_flac_read($in,4)!=='fLaC')throw new RuntimeException('Not native FLAC');
        $blocks=[];$last=false;$total=0;$seen=false;
        while(!$last){$h=cm_flac_read($in,4);$last=(ord($h[0])&128)!==0;$type=ord($h[0])&127;$n=(ord($h[1])<<16)|(ord($h[2])<<8)|ord($h[3]);$total+=$n;
            if(count($blocks)>1024||$total>33554432||$type===127||(!$blocks&&($type!==0||$n!==34))||($blocks&&$type===0))throw new RuntimeException('Invalid metadata');
            $data=cm_flac_read($in,$n);if($type===4){if($seen)throw new RuntimeException('Multiple comment blocks');$seen=true;$data=cm_flac_comments($data,$fields);}
            if($type===6&&$picture!==null&&strlen($data)>=4&&unpack('N',substr($data,0,4))[1]===3)continue;
            $blocks[]=[$type,$data];
        }
        $offset=ftell($in);if($offset>=$before['size'])throw new RuntimeException('No audio frames');
        if(!$seen)$blocks[]=[4,cm_flac_comments(pack('V',10).'CachyMusic'.pack('V',0),$fields)];
        if($picture!==null&&$info){$mime=$info['mime'];$blocks[]=[6,pack('N',3).pack('N',strlen($mime)).$mime.pack('N',0).pack('NNNNN',$info[0],$info[1],$mime==='image/png'?32:24,0,strlen($picture)).$picture];}
        $temp=tempnam(dirname($path),'.cm-tag-');if($temp===false||dirname($temp)!==dirname($path))throw new RuntimeException('Cannot create same-directory temporary file');
        $out=fopen($temp,'wb');if(!$out)throw new RuntimeException('Cannot open temporary file');cm_flac_write($out,'fLaC');
        foreach($blocks as $i=>[$type,$d]){$n=strlen($d);if($n>0xffffff)throw new RuntimeException('Metadata block too large');cm_flac_write($out,chr($type|($i===count($blocks)-1?128:0)).substr(pack('N',$n),1).$d);}
        $audioOffset=ftell($out);$hash=hash_init('sha256');
        while(!feof($in)){$chunk=fread($in,1048576);if($chunk===false)throw new RuntimeException('Read failed');if($chunk==='')break;hash_update($hash,$chunk);cm_flac_write($out,$chunk);}
        if(!fflush($out))throw new RuntimeException('Flush failed');if(function_exists('fsync')&&!fsync($out))throw new RuntimeException('Sync failed');fclose($out);$out=null;
        $check=fopen($temp,'rb');if(!$check)throw new RuntimeException('Verification failed');fseek($check,$audioOffset);$verify=hash_init('sha256');hash_update_stream($verify,$check);fclose($check);if(!hash_equals(hash_final($hash),hash_final($verify)))throw new RuntimeException('Audio verification failed');
        clearstatcache(true,$path);$after=stat($path);if(!$after||is_link($path)||$before['ino']!==$after['ino']||$before['size']!==$after['size']||$before['mtime']!==$after['mtime'])throw new RuntimeException('Original changed');
        if(!chmod($temp,$before['mode']&0777))throw new RuntimeException('Permission preservation failed');
        // Windows may reject replacement while the input is open; fail safely rather than removing the original.
        if(!rename($temp,$path))throw new RuntimeException('Atomic replacement failed');$temp=null;return true;
    }catch(Throwable $e){return false;}finally{if(is_resource($out))fclose($out);if(is_resource($in))fclose($in);if(is_string($temp)&&is_file($temp))@unlink($temp);}
}
