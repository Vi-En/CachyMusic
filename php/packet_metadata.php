<?php
// SPDX-License-Identifier: GPL-3.0-or-later
// Reuse the same Ogg and MP4 writers in the bundled Node runtime. No shell or remote process.
function cm_packet_rewrite(string $path,array $fields,?string $picture=null,?array $info=null): bool {
    $in=$input=$temp=null;
    try{
        $node=cachy_find_binary('node');if(!$node||!function_exists('proc_open'))throw new RuntimeException('Bundled Node unavailable');
        $in=fopen($path,'rb');if(!$in||!flock($in,LOCK_EX|LOCK_NB))throw new RuntimeException('File unavailable');$before=fstat($in);
        $dir=dirname($path);$temp=tempnam($dir,'.cm-tag-');if(!$temp||dirname($temp)!==$dir)throw new RuntimeException('Invalid temp path');
        $payload=json_encode(['fields'=>(object)$fields,'picture'=>$picture!==null&&$info?['bytes'=>base64_encode($picture),'mime'=>$info['mime'],'width'=>$info[0],'height'=>$info[1]]:null],JSON_THROW_ON_ERROR);
        if(strlen($payload)>15*1024*1024)throw new RuntimeException('Oversized tag request');
        $input=tmpfile();if(!$input)throw new RuntimeException('Temporary stream unavailable');cm_flac_write($input,$payload);rewind($input);
        $result=cachy_run_process([$node,__DIR__.'/../server/tag-rewrite.mjs',$path,$temp], 1048576, 120, $input);
        if($result===null || $result['exitcode']!==0)throw new RuntimeException('Container validation failed');
        clearstatcache(true,$path);$after=stat($path);if(!$after||is_link($path))throw new RuntimeException('Original changed');foreach(['dev','ino','size','mtime','ctime'] as $k)if($before[$k]!==$after[$k])throw new RuntimeException('Original changed');
        if(!is_file($temp)||is_link($temp)||!chmod($temp,$before['mode']&0777)||!rename($temp,$path))throw new RuntimeException('Replacement failed');$temp=null;return true;
    }catch(Throwable $e){return false;}finally{foreach([$in,$input] as $f)if(is_resource($f))fclose($f);if(is_string($temp)&&is_file($temp))@unlink($temp);}
}
