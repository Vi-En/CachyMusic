<?php
// Run with php -n and a disposable CACHYMUSIC_DATA_DIR. Mock mysqli so
// the fixture proves no connection attempt occurs with default settings.
if (extension_loaded('mysqli')) { fwrite(STDERR,"Run with php -n without mysqli\n"); exit(1); }
function mysqli_connect(...$args) { $GLOBALS['attempted'][]=$args; return false; }
function mysqli_connect_errno() { return 1; }
function mysqli_set_charset(...$args) { return false; }
$mode=$argv[1]??'';
foreach(['DB_HOST','DB_USER','DB_PASS','DB_NAME','CACHYMUSIC_DB_ENABLED','CACHYMUSIC_PLAYLIST_SQL'] as $k) putenv($k);
$GLOBALS['attempted']=[];
if($mode==='default') {
    // Even stale ambient credentials do not enable a network connection.
    putenv('DB_HOST=not-a-real-host');putenv('DB_USER=fixture');putenv('DB_PASS=fixture-only');putenv('DB_NAME=fixture');
    require __DIR__.'/../php/database.php';
    if($GLOBALS['attempted']!==[] || Storage::hasMySQL()) exit(2);
} elseif($mode==='missing' || $mode==='failed') {
    putenv('CACHYMUSIC_PLAYLIST_SQL=1');
    if($mode==='failed') {putenv('DB_HOST=fixture');putenv('DB_USER=fixture');putenv('DB_PASS=fixture-only');putenv('DB_NAME=fixture');}
    try {require __DIR__.'/../php/database.php';exit(3);} catch(RuntimeException $e) {
        if(!str_contains($e->getMessage(),'local storage was not substituted')) exit(4);
    }
    if(count($GLOBALS['attempted'])!==($mode==='failed'?1:0) || file_exists(getenv('CACHYMUSIC_DATA_DIR').'/library.json')) exit(5);
} else exit(6);
echo "PASS explicit database configuration ($mode)\n";
