<?php
// Isolated statement-contract fixture, not a live database test. Run with php -n.
if (extension_loaded('mysqli')) throw new RuntimeException('Run with php -n for the disposable fake connection');
function mysqli_connect_errno(){return 0;}
require_once __DIR__.'/../php/storage.php';
function checkRead($ok,$message){if(!$ok)throw new RuntimeException($message);}
class FixtureResult {
    private $i=0;
    public function __construct(private array $rows){}
    public function fetch_assoc(){return $this->rows[$this->i++]??null;}
}
class FixtureStatement {
    public $closed=false;
    public function __construct(private array $rows,private string $failure){}
    public function bind_param($types,&$id){return $this->failure!=='bind'&&$types==='i'&&$id===12;}
    public function execute(){return $this->failure!=='execute';}
    public function get_result(){return $this->failure==='result'?false:new FixtureResult($this->rows);}
    public function close(){$this->closed=true;}
}
class FixtureConnection {
    public $queries=[],$statement;
    public function __construct(private array $rows,private string $failure=''){}
    public function prepare($sql){$this->queries[]=$sql;return $this->failure==='prepare'?false:($this->statement=new FixtureStatement($this->rows,$this->failure));}
}
putenv('CACHYMUSIC_PLAYLIST_SQL=1');
$base=['plid'=>12,'name'=>'Fixture','username'=>'fixture','revision'=>8,'ptid'=>1,'tid'=>101,'position'=>1,'file_path'=>'fixture-a','hasCover'=>1];
$GLOBALS['connection']=$c=new FixtureConnection([$base,array_replace($base,['ptid'=>2,'tid'=>102,'position'=>2,'file_path'=>'fixture-b','hasCover'=>0])]);
$p=Storage::getPlaylist(12);
checkRead(count($c->queries)===1&&str_contains($c->queries[0],'LEFT JOIN PlaylistTracks')&&str_contains($c->queries[0],'p.revision'),'single consistent query required');
checkRead($p['revision']===8&&array_column($p['tracks'],'tid')===[101,102]&&$p['tracks'][0]['cover']==='php/api/cover.php?tid=101'&&$p['tracks'][1]['cover']===null&&$c->statement->closed,'ordered result or cleanup');
$GLOBALS['connection']=$c=new FixtureConnection([array_replace($base,['ptid'=>null,'tid'=>null,'file_path'=>null])]);
checkRead(Storage::getPlaylist(12)['tracks']===[]&&$c->statement->closed,'empty playlist');
$GLOBALS['connection']=$c=new FixtureConnection([]);checkRead(Storage::getPlaylist(12)===null&&$c->statement->closed,'missing playlist');
foreach(['prepare','bind','execute','result'] as $failure){$GLOBALS['connection']=$c=new FixtureConnection([$base],$failure);$rejected=false;try{Storage::getPlaylist(12);}catch(RuntimeException $e){$rejected=true;}checkRead($rejected&&($failure==='prepare'||$c->statement->closed),'false empty result or leaked statement: '.$failure);}
putenv('CACHYMUSIC_PLAYLIST_SQL=0');$GLOBALS['connection']=$c=new FixtureConnection([array_diff_key($base,['revision'=>true])]);checkRead(Storage::getPlaylist(12)['revision']===0&&!str_contains($c->queries[0],'p.revision'),'unmigrated read path');
echo "PASS SQL detail read contract: one statement, ordered/empty/missing, failure propagation, cleanup, legacy schema\n";
