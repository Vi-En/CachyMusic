<?php
// Fake mysqli contract; no live SQL or server semantics are certified.
if (extension_loaded('mysqli')) throw new RuntimeException('Run with php -n');
function mysqli_connect_errno(){return 0;}
function mysqli_query($conn,$sql){return $conn->direct($sql);}
function mysqli_fetch_assoc($result){return $result->fetch_assoc();}
require_once __DIR__.'/../php/storage.php';
function verify($ok,string $label){if(!$ok)throw new RuntimeException($label);echo "PASS $label\n";}
class TrackResult {private int $i=0;function __construct(private array $rows){}function fetch_assoc(){return $this->rows[$this->i++]??null;}}
class TrackStmt {
    public int $insert_id=0;public bool $closed=false;public array $bound=[];public string $types='';
    function __construct(private TrackConn $conn,public string $sql){}
    function bind_param($types,&...$values){$this->types=$types;$this->bound=$values;return strlen($types)===count($values)&&$this->conn->failure!=='bind';}
    function execute(){return $this->conn->failure!=='execute' && !($this->conn->failure==='update'&&str_starts_with($this->sql,'UPDATE'));}
    function get_result(){return $this->conn->failure==='result'?false:new TrackResult($this->conn->rows);}
    function close(){$this->closed=true;}
}
class TrackConn {
    public int $insert_id=7;public array $statements=[];public string $failure='';public int $begins=0,$commits=0,$rollbacks=0;
    function begin_transaction(){++$this->begins;return $this->failure!=='begin';}
    function commit(){++$this->commits;return $this->failure!=='commit';}
    function rollback(){++$this->rollbacks;return true;}
    function __construct(public array $rows=[],public array $directory=[],public array $peer=[]){}
    function prepare($sql){if($this->failure==='prepare')return false;return $this->statements[]=new TrackStmt($this,$sql);}
    public array $queries=[];public string $engine='InnoDB';
    function direct($sql){$this->queries[]=$sql;if($this->failure==='query')return false;
        if(str_contains($sql,'information_schema.TABLES'))return new TrackResult([['TABLE_NAME'=>'Tracks','ENGINE'=>$this->engine],['TABLE_NAME'=>'DefaultDirectory','ENGINE'=>'InnoDB']]);
        if(str_starts_with($sql,'INSERT INTO DefaultDirectory'))return $this->failure!=='root-lock';
        return new TrackResult(str_contains($sql,'DefaultDirectory')?$this->directory:$this->peer);}
}
$base=Storage::read();$base['default_directory']='/old';$base['soulseek']['downloads_dir']='/old-peer';$base['tracks'][9]=['tid'=>9,'full_path'=>'/old/song.wav','file_path'=>'/old/song.wav'];verify(Storage::write($base),'seed independent local mirror');
$GLOBALS['connection']=$c=new TrackConn([], [['default_directory'=>'/new']], []);
verify(Storage::getDefaultDirectory()==='/new','SQL root authoritative instead of stale JSON');
verify(Storage::getSoulseekAccount()['downloads_dir']==='','empty SQL peer rows never fall back to stale JSON');
verify(Storage::getTrackPath(9)===null&&$c->statements[0]->closed,'missing SQL track never falls back to stale JSON');
verify(Storage::getCachedTracks('/old')===[],'empty SQL scan cache is authoritative');
$c->failure='execute';$failed=false;try{Storage::getTrackPath(9);}catch(RuntimeException $e){$failed=true;}verify($failed&&end($c->statements)->closed,'SQL read failure reported with statement cleanup');
$c->failure='query';$failed=false;try{Storage::getDefaultDirectory();}catch(RuntimeException $e){$failed=true;}verify($failed,'SQL root query failure does not grant stale authority');
$row=['file_path'=>'/new/song.wav','full_path'=>'/new/song.wav','title'=>'Title','artist'=>'Artist','album'=>'Album','genre'=>'Rock','year'=>2020,'track_num'=>'2/12','duration'=>1.25,'bitrate'=>10,'sample_rate'=>44100,'channels'=>2,'bit_depth'=>16,'format'=>'WAV','file_size'=>1234,'mtime'=>123,'has_cover'=>0,'lyrics'=>'words'];
$GLOBALS['connection']=$c=new TrackConn([['file_path'=>$row['file_path'],'full_path'=>$row['full_path']]]);
$independent=Storage::read();verify(Storage::upsertTrack($row)===7&&Storage::read()===$independent&&$c->commits===1,'standalone SQL track write commits without mirror');$s=$c->statements[0];
verify($s->types==='ssssssisdiiiisiiis'&&count($s->bound)===18&&$s->bound[5]==='Rock'&&$s->bound[7]==='2/12'&&$s->bound[8]===1.25&&$s->closed,'18 field SQL binding types and cleanup');
verify(str_contains($s->sql,'LAST_INSERT_ID(tid)')&&str_contains($s->sql,'BINARY file_path')&&str_contains($s->sql,'title = IF('),'exact duplicate identity predicate present');
$c->failure='execute';verify(Storage::upsertTrack(array_replace($row,['file_path'=>'/new/second.wav','full_path'=>'/new/second.wav']))===false,'SQL write failure cannot allocate local identity');
$c->failure='';$c->rows=[['file_path'=>'/new/other.wav','full_path'=>'/new/other.wav']];verify(Storage::upsertTrack($row)===false,'SQL returned mismatched recording rejected');

// The SQL row is authoritative even when the independent mirror is stale.
$c->rows=[array_replace($row,['tid'=>7,'title'=>'SQL title','track_num'=>'2/12'])];
$commitBase=$c->commits;$rollbackBase=$c->rollbacks;
$before=Storage::read();
verify(Storage::sqlTrackRecord(7)['title']==='SQL title','SQL metadata read ignores stale mirror');
$edited=Storage::updateTrackMetadata(7,['title'=>'new title','track_num'=>'3/12','lyrics'=>'new words'],$row['full_path']);
verify($edited['title']==='new title'&&$edited['track_num']==='3/12'&&$edited['lyrics']==='new words'&&Storage::read()===$before,'SQL metadata edits preserve fractional track and do not write mirror');
$s=end($c->statements);verify($s->closed&&str_contains($s->sql,'lyrics = ?')&&$s->types==='sssi'&&$c->commits===$commitBase+1,'SQL update binding, cleanup and commit');
$c->failure='update';verify(Storage::updateTrackMetadata(7,['title'=>'bad'],$row['full_path'])===false&&$c->rollbacks===$rollbackBase+1&&Storage::read()===$before,'SQL update failure rolls back, does not publish mirror');
$c->failure='commit';verify(Storage::updateTrackMetadata(7,['title'=>'bad'],$row['full_path'])===false&&$c->rollbacks===$rollbackBase+2,'SQL commit failure not reported as success');
$c->failure='';verify(Storage::updateTrackMetadata(7,['title'=>'bad'],'/wrong.wav')===false&&$c->rollbacks===$rollbackBase+3,'SQL stale path rejected under transaction');
$begins=$c->begins;verify(Storage::updateTrackMetadata(7,['artwork_hash'=>str_repeat('a',64)],$row['full_path'])===false&&$c->begins===$begins,'SQL cross-store artwork edit rejected before mutation');
$c->rows=[];verify(Storage::sqlTrackRecord(7)===null,'Missing SQL metadata cannot return stale mirror');

$c->rows=[array_replace($row,['tid'=>7])];verify(Storage::getTrackByPath($row['full_path'])['tid']===7,'SQL path lookup uses authoritative identity');
$c->rows=[];verify(Storage::getTrackByPath($row['full_path'])===null,'SQL path lookup refuses stale mirror');
$c->rows=[array_replace($row,['tid'=>7]),array_replace($row,['tid'=>8])];verify(Storage::getTrackByPath($row['full_path'])===null,'Ambiguous SQL path rejected');

// Transaction contract for the SQL scan, with a separate untouched mirror.
$c=new TrackConn([array_replace($row,['tid'=>7])],[['default_directory'=>'/old']]);$GLOBALS['connection']=$c;
$mirror=Storage::read();
verify(Storage::beginScanBatch()&&$c->begins===1&&str_contains(end($c->queries),'FOR UPDATE'),'SQL scan begins and locks authoritative root');
verify(Storage::upsertTrack($row)===7&&Storage::setDefaultDirectory('/new')&&Storage::read()===$mirror&&$c->commits===0,'SQL scan stages only SQL mutations, mirror unchanged');
verify(Storage::commitScanBatch()&&$c->commits===1&&$c->rollbacks===0&&Storage::read()===$mirror,'SQL scan publishes via one commit');
verify(Storage::beginScanBatch(),'SQL second scan begins');Storage::abortBatch();
verify($c->rollbacks===1&&Storage::read()===$mirror,'SQL abort rolls back without publishing mirror');
verify(Storage::beginScanBatch(),'SQL third scan begins');$c->failure='execute';
verify(Storage::upsertTrack($row)===false&&!Storage::commitScanBatch()&&$c->rollbacks===2&&$c->commits===1,'failed track update makes scan uncommittable');
$c->failure='';verify(Storage::beginScanBatch(),'SQL fourth scan begins');$c->failure='commit';
verify(!Storage::commitScanBatch()&&$c->rollbacks===3&&Storage::read()===$mirror,'uncertain commit not reported successful');
$c->failure='root-lock';verify(!Storage::beginScanBatch()&&$c->rollbacks===4,'failed root lock rolls back');
$c->failure='';$c->engine='MyISAM';$begins=$c->begins;verify(!Storage::beginScanBatch()&&$c->begins===$begins,'nontransactional SQL engine refused');
