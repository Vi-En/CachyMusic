<?php
// Explicitly disposable database only. This test never runs against user data.
if(getenv('CACHYMUSIC_SQL_FIXTURE')!=='1'||getenv('DB_NAME')!=='MusicPlayer_fixture')throw new RuntimeException('Disposable fixture database required');
require_once __DIR__.'/../php/database.php';
function checkSql($v,$msg){if(!$v)throw new RuntimeException($msg);}
checkSql(Storage::hasMySQL()&&PlaylistSql::enabled(),'SQL fixture unavailable');
$conn=$GLOBALS['connection'];
$conn->query("INSERT INTO Tracks(tid,file_path) VALUES (101,'fixture-a'),(102,'fixture-b')");
$id=Storage::createPlaylist('Fixture','fixture',[101]);checkSql(is_int($id),'create');
checkSql(!Storage::addTracksToPlaylist($id,[102,999],'fixture',0),'invalid batch accepted');
$row=Storage::getPlaylists('fixture')[0];checkSql($row['tracks']===[101]&&$row['revision']===0,'failed batch changed membership');
checkSql(Storage::addTracksToPlaylist($id,[102],'fixture',0),'atomic batch');
checkSql(!Storage::editPlaylist($id,'Stale',[102,101],'fixture',0),'stale revision accepted');
checkSql(!Storage::editPlaylist($id,'Unauthorized',[102,101],'other',1),'unauthorized edit');
checkSql(Storage::editPlaylist($id,'Renamed',[102,101],'fixture',1),'edit');
$row=Storage::getPlaylists('fixture')[0];checkSql($row['tracks']===[102,101]&&$row['revision']===2&&$row['name']==='Renamed','ordered record mismatch');
checkSql(!Storage::editPlaylist($id,'Repair',[999],'fixture',2,true),'invalid repair');
checkSql(Storage::editPlaylist($id,'Repair',[101],'fixture',2,true),'atomic repair/removal');
checkSql(!Storage::deletePlaylist($id,'fixture',2),'stale delete');checkSql(Storage::deletePlaylist($id,'fixture',3),'delete');
$new=Storage::createPlaylist('New fixture','fixture');checkSql($new>$id,'allocator reused ID');checkSql(Storage::deletePlaylist($new,'fixture',0),'cleanup');
echo "PASS SQL fixture: create and add, rollback, stale edit, order, ownership, removal, stable allocator\n";
