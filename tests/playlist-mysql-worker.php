<?php
// Separate process and connection per operation; only disposable CI fixture.
if(getenv('CACHYMUSIC_SQL_FIXTURE')!=='1'||getenv('DB_NAME')!=='MusicPlayer_fixture'||!getenv('CACHYMUSIC_DATA_DIR'))throw new RuntimeException('Disposable fixture database and storage required');
require_once __DIR__.'/../php/database.php';
if(!Storage::hasMySQL()||!PlaylistSql::enabled())throw new RuntimeException('SQL fixture unavailable');
echo "READY\n";flush();
$request=json_decode(fgets(STDIN),true,512,JSON_THROW_ON_ERROR);
$user=$request['user'];if(!preg_match('/^race_[a-f0-9]{12}$/D',$user))throw new RuntimeException('Invalid fixture owner');
$result=match($request['action']){
 'create'=>Storage::createPlaylist($request['name'],$user,$request['tracks']??[]),
 'read'=>Storage::getPlaylists($user),
 'detail'=>Storage::getPlaylist($request['id']),
 'edit'=>Storage::editPlaylist($request['id'],$request['name'],$request['tracks'],$user,$request['revision']),
 'add'=>Storage::addTracksToPlaylist($request['id'],$request['tracks'],$user,$request['revision']),
 'delete'=>Storage::deletePlaylist($request['id'],$user,$request['revision']),
 default=>throw new RuntimeException('Unknown fixture action')
};
echo json_encode($result,JSON_THROW_ON_ERROR)."\n";
