<?php
// SPDX-License-Identifier: GPL-3.0-or-later
// Standard RIFF/WAVE and FORM/AIFF ID3 writer; no codec invocation or rewriting of audio chunks.
require_once __DIR__.'/mp3_metadata.php';
function cm_pcm_tag_layout($in,int $size,array $fields): array {
    if($size<20||fseek($in,0)!==0)throw new RuntimeException('Invalid container');
    $h=cm_flac_read($in,12);$wav=substr($h,0,4)==='RIFF'&&substr($h,8,4)==='WAVE';$aiff=substr($h,0,4)==='FORM'&&substr($h,8,4)==='AIFF';
    if(!$wav&&!$aiff)throw new RuntimeException('Unsupported container');$num=fn($s)=>unpack($wav?'V':'N',$s)[1];
    if($num(substr($h,4,4))+8!==$size)throw new RuntimeException('Invalid container size');
    $chunks=[];$tag=null;$format=false;$audio=false;$pos=12;$count=0;
    while($pos<$size){
        if(++$count>4096||$pos+8>$size||fseek($in,$pos)!==0)throw new RuntimeException('Invalid chunk table');
        $ch=cm_flac_read($in,8);$id=substr($ch,0,4);$n=$num(substr($ch,4,4));$end=$pos+8+$n+($n&1);if($end>$size)throw new RuntimeException('Truncated chunk');
        if(strtolower($id)==='id3 '){
            if($tag!==null||$n<10||$n>33554442)throw new RuntimeException('Invalid ID3 chunk');$head=cm_flac_read($in,10);$version=ord($head[3]);
            if(substr($head,0,3)!=='ID3'||!in_array($version,[3,4],true)||substr($head,4,2)!=="\0\0"||cm_id3_sync_read(substr($head,6))!==$n-10)throw new RuntimeException('Invalid embedded ID3');
            $tag=[$version,cm_id3_parse_frames(cm_flac_read($in,$n-10),$version)];
        }else{
            if($id===($wav?'fmt ':'COMM')){if($format)throw new RuntimeException('Duplicate format');$format=true;}
            if($id===($wav?'data':'SSND')){if($audio)throw new RuntimeException('Duplicate audio');$audio=true;}
            if($aiff&&(($id==='NAME'&&array_key_exists('title',$fields))||($id==='AUTH'&&array_key_exists('artist',$fields))||($id==='ANNO'&&array_key_exists('comment',$fields))))throw new RuntimeException('Conflicting AIFF text');
            if($wav&&$id==='LIST'&&$n>=4&&cm_flac_read($in,4)==='INFO'){
                $map=['INAM'=>'title','IART'=>'artist','IPRD'=>'album','IGNR'=>'genre','ICRD'=>'year','ITRK'=>'track_num','ICMT'=>'comment'];$i=$pos+12;$limit=$pos+8+$n;$k=0;
                while($i<$limit){if(++$k>4096||$i+8>$limit||fseek($in,$i)!==0)throw new RuntimeException('Invalid INFO list');$data=cm_flac_read($in,8);$key=substr($data,0,4);$len=$num(substr($data,4));$i+=8+$len+($len&1);if($i>$limit)throw new RuntimeException('Invalid INFO list');if(isset($map[$key])&&array_key_exists($map[$key],$fields))throw new RuntimeException('Conflicting WAV text');}
            }
            $chunks[]=[$pos,$end-$pos];
        }
        $pos=$end;
    }
    if(!$format||!$audio)throw new RuntimeException('Missing audio chunks');return [$h,$wav,$chunks,$tag??[3,[]]];
}
function cm_pcm_tag_rewrite(string $path,array $fields,?string $picture=null,?array $info=null): bool {
    $in=$out=$verify=$temp=null;
    try{
        $in=fopen($path,'rb');if(!$in||!flock($in,LOCK_EX|LOCK_NB))throw new RuntimeException('File unavailable');$before=fstat($in);
        [$header,$wav,$chunks,[$version,$frames]]=cm_pcm_tag_layout($in,$before['size'],$fields);
        $tag=cm_id3_build($version,$frames,$fields,$picture,$info);$n=strlen($tag);$body=array_sum(array_column($chunks,1));$newSize=12+$body+8+$n+($n&1);
        if($newSize-8>0xffffffff)throw new RuntimeException('Container overflow');$pack=fn($x)=>pack($wav?'V':'N',$x);
        $temp=tempnam(dirname($path),'.cm-tag-');if(!$temp||dirname($temp)!==dirname($path))throw new RuntimeException('Invalid temp path');$out=fopen($temp,'wb');if(!$out)throw new RuntimeException('Temp unavailable');
        cm_flac_write($out,substr($header,0,4).$pack($newSize-8).substr($header,8,4));$hash=hash_init('sha256');
        foreach($chunks as [$p,$len]){if(fseek($in,$p)!==0)throw new RuntimeException('Seek failed');while($len){$data=cm_flac_read($in,min($len,1048576));$len-=strlen($data);hash_update($hash,$data);cm_flac_write($out,$data);}}
        cm_flac_write($out,($wav?'id3 ':'ID3 ').$pack($n).$tag.($n&1?"\0":''));
        if(!fflush($out)||(function_exists('fsync')&&!fsync($out)))throw new RuntimeException('Sync failed');fclose($out);$out=null;
        $verify=fopen($temp,'rb');if(!$verify)throw new RuntimeException('Verification failed');$vstat=fstat($verify);[,,$newChunks]=cm_pcm_tag_layout($verify,$vstat['size'],[]);$actual=hash_init('sha256');
        foreach($newChunks as [$p,$len]){if(fseek($verify,$p)!==0)throw new RuntimeException('Seek failed');while($len){$data=cm_flac_read($verify,min($len,1048576));$len-=strlen($data);hash_update($actual,$data);}}
        if(!hash_equals(hash_final($hash),hash_final($actual)))throw new RuntimeException('Original chunk data changed');fclose($verify);$verify=null;
        clearstatcache(true,$path);$after=stat($path);if(!$after||is_link($path))throw new RuntimeException('Original changed');foreach(['dev','ino','size','mtime','ctime'] as $k)if($before[$k]!==$after[$k])throw new RuntimeException('Original changed');
        if(!chmod($temp,$before['mode']&0777)||!rename($temp,$path))throw new RuntimeException('Replacement failed');$temp=null;return true;
    }catch(Throwable $e){return false;}finally{foreach([$in,$out,$verify] as $f)if(is_resource($f))fclose($f);if(is_string($temp)&&is_file($temp))@unlink($temp);}
}
