<?php
require_once __DIR__.'/../php/storage.php';
function check($condition,$label){if(!$condition){fwrite(STDERR,"FAIL $label\n");exit(1);}}
$d=Storage::read();$d['tracks']=[10=>['tid'=>10],20=>['tid'=>20]];check(Storage::write($d),'seed tracks');
$pl=Storage::createPlaylist('Evening','tester');check($pl>0,'create');
check(Storage::addTrackToPlaylist($pl,10,'tester')===true,'add 10');check(Storage::addTrackToPlaylist($pl,20,'tester')===true,'add 20');
check(Storage::addTrackToPlaylist($pl,10,'tester')==='already_in_playlist','duplicate');check(!Storage::addTrackToPlaylist($pl,99,'tester'),'unknown track');check(!Storage::addTrackToPlaylist($pl,10,'other'),'owner');
check(Storage::editPlaylist($pl,'Renamed',[20,10],'tester',2),'rename/reorder');check(!Storage::editPlaylist($pl,'Stale',[10,20],'tester',2),'stale revision');
$rows=Storage::getPlaylists('tester');$row=array_values(array_filter($rows,fn($p)=>$p['plid']===$pl))[0];check($row['name']==='Renamed'&&$row['tracks']===[20,10]&&$row['revision']===3,'persisted order');
check(!Storage::editPlaylist($pl,'Not allowed',[10,20],'other',3),'ownership');check(!Storage::editPlaylist($pl,'Invalid',[20,30],'tester',3),'membership');
check(Storage::removeTrackFromPlaylist($pl,20,'tester'),'remove');check(!Storage::removeTrackFromPlaylist($pl,20,'tester'),'no-op');check(!Storage::deletePlaylist($pl,'tester',3),'stale delete');check(Storage::deletePlaylist($pl,'tester',4),'delete');
$new=Storage::createPlaylist('New','tester');check($new>$pl,'stable allocator');check(!Storage::deletePlaylist($pl,'tester',0),'stale ID');
echo "PASS actual JSON storage revision conflicts, membership, ownership, duplicate, order, stable ID, no-op removal and delete\n";
