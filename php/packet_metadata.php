<?php
// SPDX-License-Identifier: GPL-3.0-or-later
// Reuse the same Ogg and MP4 writers in the bundled Node runtime. No shell or remote process.
function cm_packet_rewrite(string $path,array $fields,?string $picture=null,?array $info=null): bool {
    $in=$input=$log=$temp=null;$proc=null;
    try{
        $node=cachy_find_binary('node');if(!$node||!function_exists('proc_open'))throw new RuntimeException('Bundled Node unavailable');
        $in=fopen($path,'rb');if(!$in||!flock($in,LOCK_EX|LOCK_NB))throw new RuntimeException('File unavailable');$before=fstat($in);
        $dir=dirname($path);$temp=tempnam($dir,'.cm-tag-');if(!$temp||dirname($temp)!==$dir)throw new RuntimeException('Invalid temp path');
        $payload=json_encode(['fields'=>(object)$fields,'picture'=>$picture!==null&&$info?['bytes'=>base64_encode($picture),'mime'=>$info['mime'],'width'=>$info[0],'height'=>$info[1]]:null],JSON_THROW_ON_ERROR);
        if(strlen($payload)>15*1024*1024)throw new RuntimeException('Oversized tag request');
        $input=tmpfile();$log=tmpfile();if(!$input||!$log)throw new RuntimeException('Temporary stream unavailable');cm_flac_write($input,$payload);rewind($input);
        $proc=proc_open([$node,__DIR__.'/../server/tag-rewrite.mjs',$path,$temp],[0=>$input,1=>$log,2=>$log],$pipes,null,null,['bypass_shell'=>true]);
        if(!is_resource($proc))throw new RuntimeException('Cannot launch local writer');
        $deadline=microtime(true)+120;$code=-1;
        while(true){$status=proc_get_status($proc);if(!$status['running']){$code=$status['exitcode'];break;}if(microtime(true)>$deadline){proc_terminate($proc,9);throw new RuntimeException('Tag write timeout');}usleep(50000);}
        $closed=proc_close($proc);$proc=null;if(($code===-1?$closed:$code)!==0)throw new RuntimeException('Container validation failed');
        clearstatcache(true,$path);$after=stat($path);if(!$after||is_link($path))throw new RuntimeException('Original changed');foreach(['dev','ino','size','mtime','ctime'] as $k)if($before[$k]!==$after[$k])throw new RuntimeException('Original changed');
        if(!is_file($temp)||is_link($temp)||!chmod($temp,$before['mode']&0777)||!rename($temp,$path))throw new RuntimeException('Replacement failed');$temp=null;return true;
    }catch(Throwable $e){return false;}finally{if(is_resource($proc)){proc_terminate($proc,9);proc_close($proc);}foreach([$in,$input,$log] as $f)if(is_resource($f))fclose($f);if(is_string($temp)&&is_file($temp))@unlink($temp);}
}
