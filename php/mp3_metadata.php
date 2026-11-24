<?php
// SPDX-License-Identifier: GPL-3.0-or-later
// Conservative ID3v2.3/v2.4 writer; unchanged frames and audio tail retained verbatim.
require_once __DIR__.'/flac_metadata.php';
function cm_id3_sync_read(string $s): int {
    if(strlen($s)!==4)throw new RuntimeException('Invalid tag size');$n=0;for($i=0;$i<4;$i++){ $x=ord($s[$i]);if($x&128)throw new RuntimeException('Invalid tag size');$n=($n<<7)|$x; }return $n;
}
function cm_id3_sync_write(int $n): string {if($n<0||$n>0xfffffff)throw new RuntimeException('Invalid tag size');return chr(($n>>21)&127).chr(($n>>14)&127).chr(($n>>7)&127).chr($n&127);}
function cm_id3_parse_frames(string $tag,int $version): array {
            $size=strlen($tag);$p=0;$frames=[];
            while($p<$size&&ord($tag[$p])!==0){
                if(count($frames)>=100000||$p+10>$size)throw new RuntimeException('Invalid frames');$id=substr($tag,$p,4);
                if(!preg_match('/^[A-Z0-9]{4}$/D',$id))throw new RuntimeException('Invalid frame ID');
                $n=$version===4?cm_id3_sync_read(substr($tag,$p+4,4)):unpack('N',substr($tag,$p+4,4))[1];
                if(!$n||$n>$size-$p-10||substr($tag,$p+8,2)!=="\0\0")throw new RuntimeException('Unsupported frame');
                $frames[]=[$id,substr($tag,$p+10,$n),substr($tag,$p,$n+10)];$p+=10+$n;
            }
            if(strspn($tag,"\0",$p)!==$size-$p)throw new RuntimeException('Invalid padding');
    return $frames;
}
function cm_id3_build(int $version,array $frames,array $fields,?string $picture=null,?array $info=null): string {
        $encode=function(string $s)use($version):string{if(!preg_match('//u',$s))throw new RuntimeException('Invalid UTF-8');if($version===4)return $s;if(function_exists('iconv')){$v=iconv('UTF-8','UTF-16LE',$s);}elseif(function_exists('mb_convert_encoding')){$v=mb_convert_encoding($s,'UTF-16LE','UTF-8');}else{throw new RuntimeException('UTF-16LE encoder unavailable');}if($v===false)throw new RuntimeException('Invalid UTF-8');return "\xff\xfe".$v;};
        $enc=chr($version===4?3:1);
        $frame=function(string $id,string $body)use($version):string{return $id.($version===4?cm_id3_sync_write(strlen($body)):pack('N',strlen($body)))."\0\0".$body;};
        $map=['title'=>'TIT2','artist'=>'TPE1','album'=>'TALB','genre'=>'TCON','track_num'=>'TRCK'];$changed=[];
        foreach($map as $k=>$id)if(array_key_exists($k,$fields))$changed[$id]=true;
        if(array_key_exists('year',$fields)){$changed['TYER']=true;$changed['TDRC']=true;}
        if(array_key_exists('lyrics',$fields))$changed['USLT']=true;if(array_key_exists('comment',$fields))$changed['COMM']=true;
        $retained=[];
        foreach($frames as [$id,$body,$raw]){
            $mimeEnd=$id==='APIC'?strpos($body,"\0",1):false;
            $front=$mimeEnd!==false&&$mimeEnd+1<strlen($body)&&ord($body[$mimeEnd+1])===3;
            if(!isset($changed[$id])&&!($picture!==null&&$front))$retained[]=$raw;
        }
        foreach($map as $k=>$id)if(isset($fields[$k])&&(string)$fields[$k]!=='')$retained[]=$frame($id,$enc.$encode((string)$fields[$k]));
        if(isset($fields['year'])&&(string)$fields['year']!=='')$retained[]=$frame($version===3?'TYER':'TDRC',$enc.$encode((string)$fields['year']));
        foreach(['lyrics'=>'USLT','comment'=>'COMM'] as $k=>$id)if(isset($fields[$k])&&(string)$fields[$k]!=='')$retained[]=$frame($id,$enc.'eng'.($version===3?"\xff\xfe\0\0":"\0").$encode((string)$fields[$k]));
        if($picture!==null){if(!$info||!in_array($info['mime'],['image/png','image/jpeg'],true)||strlen($picture)>10485760)throw new RuntimeException('Invalid picture');$retained[]=$frame('APIC',"\0".$info['mime']."\0\x03\0".$picture);}
        $tag=implode('',$retained);if(strlen($tag)>33554432)throw new RuntimeException('Metadata too large');
    return 'ID3'.chr($version)."\0\0".cm_id3_sync_write(strlen($tag)).$tag;
}
function cm_mp3_rewrite(string $path,array $fields,?string $picture=null,?array $info=null): bool {
    $in=$out=$temp=null;
    try {
        $in=fopen($path,'rb');if(!$in||!flock($in,LOCK_EX|LOCK_NB))throw new RuntimeException('File unavailable');
        $before=fstat($in);$h=cm_flac_read($in,10);$version=4;$offset=0;$frames=[];
        if(substr($h,0,3)==='ID3'){
            $version=ord($h[3]);if(!in_array($version,[3,4],true)||ord($h[4])!==0||ord($h[5])!==0)throw new RuntimeException('Unsupported ID3 flags');
            $size=cm_id3_sync_read(substr($h,6,4));$offset=10+$size;if($size>33554432||$offset>=$before['size'])throw new RuntimeException('Invalid ID3 size');
            $frames=cm_id3_parse_frames(cm_flac_read($in,$size),$version);
        }
        fseek($in,$offset);$audio=cm_flac_read($in,4);if(ord($audio[0])!==255||(ord($audio[1])&224)!==224||((ord($audio[1])>>1)&3)!==1)throw new RuntimeException('Not MPEG Layer III');fseek($in,$offset);
        $tag=cm_id3_build($version,$frames,$fields,$picture,$info);
        $temp=tempnam(dirname($path),'.cm-tag-');if(!$temp||dirname($temp)!==dirname($path))throw new RuntimeException('Invalid temporary path');$out=fopen($temp,'wb');if(!$out)throw new RuntimeException('Cannot open temporary file');
        cm_flac_write($out,$tag);$payload=ftell($out);$hash=hash_init('sha256');
        while(!feof($in)){$chunk=fread($in,1048576);if($chunk===false)throw new RuntimeException('Read failed');if($chunk==='')break;hash_update($hash,$chunk);cm_flac_write($out,$chunk);}
        if(!fflush($out)||(function_exists('fsync')&&!fsync($out)))throw new RuntimeException('Sync failed');fclose($out);$out=null;
        $check=fopen($temp,'rb');if(!$check)throw new RuntimeException('Verification failed');fseek($check,$payload);$verify=hash_init('sha256');hash_update_stream($verify,$check);fclose($check);if(!hash_equals(hash_final($hash),hash_final($verify)))throw new RuntimeException('Audio changed');
        clearstatcache(true,$path);$after=stat($path);if(!$after||is_link($path))throw new RuntimeException('Original changed');foreach(['dev','ino','size','mtime','ctime'] as $k)if($before[$k]!==$after[$k])throw new RuntimeException('Original changed');
        if(!chmod($temp,$before['mode']&0777)||!rename($temp,$path))throw new RuntimeException('Replacement failed');$temp=null;return true;
    }catch(Throwable $e){return false;}finally{if(is_resource($out))fclose($out);if(is_resource($in))fclose($in);if(is_string($temp)&&is_file($temp))@unlink($temp);}
}
