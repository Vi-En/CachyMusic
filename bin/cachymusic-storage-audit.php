<?php
// Offline, local JSON profile maintenance. No deletion or automatic restoration.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../php/platform.php';
function cm_audit_fail(string $message): never { fwrite(STDERR, $message . PHP_EOL); exit(1); }
function cm_audit_regular(string $file): ?array {
    clearstatcache(true, $file);
    $s = @lstat($file);
    return $s && ($s['mode'] & 0170000) === 0100000 && $s['nlink'] === 1 ? $s : null;
}
function cm_audit_same(array $a, array $b): bool {
    foreach (['dev','ino','mode','nlink','size','mtime','ctime'] as $k) if ($a[$k] !== $b[$k]) return false;
    return true;
}
if (($argv[1] ?? '') !== '--data-dir' || !isset($argv[2]) || count($argv) > 4 || (isset($argv[3]) && $argv[3] !== '--quarantine-abandoned')) {
    fwrite(STDERR, "Usage: php bin/cachymusic-storage-audit.php --data-dir PATH [--quarantine-abandoned]\nStop all CachyMusic backends and back up the complete data directory before running. Default: inspection only.\n"); exit(2);
}
$move = isset($argv[3]);
$dir = realpath($argv[2]);
if ($dir === false || !is_dir($dir) || is_link($argv[2])) cm_audit_fail('An existing, non-aliased profile directory is required.');
$library = $dir . DIRECTORY_SEPARATOR . 'library.json';
$lockPath = $library . '.lock';
$lockStat = cm_audit_regular($lockPath);
if (!$lockStat) cm_audit_fail('Missing or unsafe existing library lock; no changes made.');
$lock = @fopen($lockPath, 'r+b');
if (!$lock) cm_audit_fail('Cannot open library lock.');
if (!@flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); cm_audit_fail('Library is locked by another writer; stop the application and retry.'); }
try {
    $opened = @fstat($lock);
    $current = cm_audit_regular($lockPath);
    if (!$opened || !$current || !cm_audit_same($opened, $current)) throw new RuntimeException('Library lock identity changed.');
    if (!cm_audit_regular($library)) throw new RuntimeException('Missing or unsafe library snapshot.');
    $libStat=cm_audit_regular($library);
    if (!$libStat||$libStat['size']>67108864) throw new RuntimeException('Library exceeds maintenance read budget; no changes made.');
    $raw = @file_get_contents($library,false,null,0,67108865);
    if (!is_string($raw)||strlen($raw)>67108864) throw new RuntimeException('Library exceeds maintenance read budget; no changes made.');
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data) || !isset($data['tracks'], $data['playlists']) || !is_array($data['tracks']) || !is_array($data['playlists'])) throw new RuntimeException('Library snapshot invalid; preserve it for recovery.');
    $refs = [];
    foreach ($data['tracks'] as $id => $track) {
        if (!is_array($track)) throw new RuntimeException('Invalid track record; no changes made.');
        if (!array_key_exists('artwork_hash', $track)) continue;
        if (cachy_positive_id($id) === null || !is_string($track['artwork_hash']) || !preg_match('/^[a-f0-9]{64}$/D', $track['artwork_hash'])) throw new RuntimeException('Invalid artwork reference; no changes made.');
        $refs['artwork-' . $id . '/' . $track['artwork_hash'] . '.img'] = true;
    }
    unset($data, $raw);
    $report = ['inspection_only'=>!$move, 'minimum_age_seconds'=>86400, 'abandoned_candidates'=>0, 'recent_stages'=>0, 'skipped_unsafe_entries'=>0, 'candidate_bytes'=>0, 'artwork_referenced'=>count($refs), 'artwork_missing_or_unsafe'=>0, 'artwork_unreferenced'=>0, 'artwork_unreferenced_bytes'=>0, 'artwork_stages'=>0, 'quarantined'=>0, 'quarantine_failed'=>0, 'quarantine_directory'=>null];
    // Bounded offline inventory. Count only single-link regular files; report
    // aliases/unsafe objects rather than traversing them. Unknown data is never
    // reclaimed, and apparent file length is not allocated filesystem space.
    $profileBytes=0;$profileFiles=0;$profileUnsafe=0;$profileVisited=0;
    $profileDeadline=hrtime(true)+5000000000;
    $all=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::SELF_FIRST);
    $all->setMaxDepth(32);
    foreach ($all as $item) {
        if (++$profileVisited>100000||hrtime(true)>$profileDeadline||$all->getDepth()>=32) throw new RuntimeException('Profile inventory exceeded maintenance budget; no changes made.');
        if ($item->isLink()) {$profileUnsafe++;continue;}
        if ($item->isDir()) continue;
        $stat=cm_audit_regular($item->getPathname());
        if (!$stat) {$profileUnsafe++;continue;}
        $profileFiles++;$profileBytes+=$stat['size'];
    }
    $report['profile_regular_bytes']=$profileBytes;$report['profile_regular_files']=$profileFiles;
    $report['profile_unsafe_entries']=$profileUnsafe;
    $report['profile_inventory_scope']='Apparent bytes in single-link regular files, excluding aliases; not a hard quota';
    $candidates = [];
    $seen = [];
    $now = time();
    $visits=0;$deadline=hrtime(true)+5000000000;
    foreach (new FilesystemIterator($dir, FilesystemIterator::SKIP_DOTS) as $entry) {
        if (++$visits>100000||hrtime(true)>$deadline) throw new RuntimeException('Maintenance inspection exceeded budget; no changes made.');
        $name = $entry->getFilename(); $file = $entry->getPathname();
        if (str_starts_with($name, '.cm-write-')) {
            // Only old, single-link regular files in the library directory.
            // Artwork stages are deliberately excluded from mutation.
            $stat = preg_match('/^\.cm-write-[A-Za-z0-9]{6,64}$/D', $name) ? cm_audit_regular($file) : null;
            if (!$stat) { $report['skipped_unsafe_entries']++; continue; }
            if ($stat['mtime'] > $now - 86400) { $report['recent_stages']++; continue; }
            $candidates[$name] = $stat; $report['abandoned_candidates']++; $report['candidate_bytes'] += $stat['size'];
        } elseif (preg_match('/^artwork-[1-9][0-9]*$/D', $name)) {
            if ($entry->isLink() || !$entry->isDir()) { $report['skipped_unsafe_entries']++; continue; }
            foreach (new FilesystemIterator($file, FilesystemIterator::SKIP_DOTS) as $object) {
                if (++$visits>100000||hrtime(true)>$deadline) throw new RuntimeException('Maintenance inspection exceeded budget; no changes made.');
                $objName = $object->getFilename();
                if (str_starts_with($objName, '.cm-write-')) { $report['artwork_stages']++; continue; }
                if (!preg_match('/^[a-f0-9]{64}\.img$/D', $objName)) continue;
                $stat = cm_audit_regular($object->getPathname());
                if (!$stat) { $report['skipped_unsafe_entries']++; continue; }
                $key = $name . '/' . $objName;
                if (isset($refs[$key])) {
                    if ($stat['size'] <= 10 * 1024 * 1024 && @hash_file('sha256', $object->getPathname()) === substr($objName, 0, 64)) $seen[$key] = true;
                }
                else { $report['artwork_unreferenced']++; $report['artwork_unreferenced_bytes'] += $stat['size']; }
            }
        }
    }
    $report['artwork_missing_or_unsafe'] = count(array_diff_key($refs, $seen));
    // Missing authoritative objects require investigation, not maintenance.
    if ($move && $report['artwork_missing_or_unsafe'] > 0) throw new RuntimeException('Missing or unsafe authoritative artwork; preserve all files for recovery.');
    if ($move && $candidates) {
        $name = 'recovery-quarantine-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(8));
        $target = $dir . DIRECTORY_SEPARATOR . $name;
        if (!@mkdir($target, 0700)) throw new RuntimeException('Cannot create recovery quarantine.');
        $report['quarantine_directory'] = $name;
        foreach ($candidates as $file => $before) {
            $src = $dir . DIRECTORY_SEPARATOR . $file;
            $dest = $target . DIRECTORY_SEPARATOR . $file;
            $after = cm_audit_regular($src);
            if (!$after || !cm_audit_same($before, $after) || file_exists($dest) || is_link($dest) || !@rename($src, $dest)) { $report['quarantine_failed']++; continue; }
            $report['quarantined']++;
        }
    }
    echo json_encode($report, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . PHP_EOL;
    $exit = $report['quarantine_failed'] ? 1 : 0;
} catch (Throwable $e) {
    fwrite(STDERR, $e instanceof RuntimeException ? $e->getMessage() . PHP_EOL : "Maintenance failed; preserve the profile and quarantine.\n");
    $exit = 1;
} finally { flock($lock, LOCK_UN); fclose($lock); }
exit($exit);
