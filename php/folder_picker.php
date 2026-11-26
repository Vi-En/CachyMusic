<?php
require_once __DIR__.'/platform.php';
// Selection is read-only. Only a successful scan may publish a library root.
function cm_browse_allowed(string $selected): bool {
    $real=realpath($selected);
    return $real!==false && is_dir($real) && is_readable($real) && cachy_is_allowed_scan_path($real);
}
function cm_choose_folder(string $initialDir,?CachyScanJob $job=null): array {
    require_once __DIR__.'/database.php';
    if ($initialDir==='') $initialDir=Storage::getDefaultDirectory();
    $homeDir=cachy_home_dir();
    if (str_starts_with($initialDir,'~/') || $initialDir==='~') $initialDir=rtrim($homeDir,"/\\").substr($initialDir,1);
$checkpoint = $job ? fn()=> $job->checkpoint() : null;
$osFamily = PHP_OS_FAMILY;

// 1. macOS (Darwin) Native Folder Picker via osascript
if ($osFamily === 'Darwin' || PHP_OS === 'Darwin') {
     $output = trim(cachy_run_args(array_merge([cachy_find_binary('osascript') ?? '/usr/bin/osascript'], ['-e','POSIX path of (choose folder with prompt "Select Music Folder")']), 16384, 300, $checkpoint) ?? '');
    if ($checkpoint) $checkpoint();
    if (!empty($output) && is_dir($output)) {
        if (!cm_browse_allowed($output)) return ['success'=>false,'message'=>'Selected directory is not allowed.'];
        return [
            'success' => true,
            'directory' => $output
        ];
    }
}

// 2. Windows Native Folder Picker via PowerShell FolderBrowserDialog
if ($osFamily === 'Windows' || strncasecmp(PHP_OS, 'WIN', 3) === 0) {
    $ps = cachy_find_binary('powershell') ?: (getenv('SystemRoot') . '/System32/WindowsPowerShell/v1.0/powershell.exe');
    $psScript = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; ' .
                '$f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = "Select Music Folder"; ';
    if ($initialDir !== '' && is_dir($initialDir)) {
        $psScript .= '$f.SelectedPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(' . chr(39) . base64_encode($initialDir) . chr(39) . ')); ';
    }
    $psScript .= 'if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($f.SelectedPath) }';
    $result = is_file($ps) ? cachy_run_args([$ps, '-NoProfile', '-STA', '-Command', $psScript], 16384, 300, $checkpoint) : null;
    if ($checkpoint) $checkpoint();
    $output = trim($result ?? '');
    if ($output !== '' && is_dir($output)) {
        if (!cm_browse_allowed($output)) return ['success'=>false,'message'=>'Selected directory is not allowed.'];
        return ['success'=>true,'directory'=>$output];
    } else {
        return ['success'=>false, 'cancelled'=>$result !== null, 'fallback'=>$result === null];
    }
}


// 3. Linux / BSD: Try zenity first (standard GTK dialog across GNOME, XFCE, Hyprland, etc.)
$zenity = cachy_find_binary('zenity') ?? '';
if (!empty($zenity) && file_exists($zenity)) {
    $args = [$zenity, '--file-selection', '--directory', '--title=Select Music Folder'];
    if ($initialDir !== '' && is_dir($initialDir)) $args[] = '--filename=' . rtrim($initialDir, '/') . '/';
    $result = cachy_run_process($args, 16384, 300, null, $checkpoint);
    if ($checkpoint) $checkpoint();
    if ($result !== null) {
        $stdout = $result['stdout']; $stderr = $result['stderr']; $exitCode = $result['exitcode'];
        if ($exitCode === 0 && !empty(trim($stdout))) {
            $chosenDir = trim($stdout);
            if (!cm_browse_allowed($chosenDir)) return ['success'=>false,'message'=>'Selected directory is not allowed.'];
            return [
                'success' => true,
                'directory' => $chosenDir
            ];
        } elseif ($exitCode === 1 && empty(trim($stderr))) {
            return [
                'success' => false,
                'cancelled' => true
            ];
        }
    }
}

// 4. Linux / BSD: Try kdialog fallback (KDE)
if ($checkpoint) $checkpoint();
$kdialog = cachy_find_binary('kdialog') ?? '';
if (!empty($kdialog) && file_exists($kdialog)) {
    $startPath = (!empty($initialDir) && is_dir($initialDir)) ? $initialDir : (cachy_home_dir() ?: '/');
    $result = cachy_run_process([$kdialog, '--getexistingdirectory', $startPath, '--title', 'Select Music Folder'], 16384, 300, null, $checkpoint);
    if ($checkpoint) $checkpoint();
    if ($result !== null) {
        $stdout = $result['stdout']; $stderr = $result['stderr']; $exitCode = $result['exitcode'];
        if ($exitCode === 0 && !empty(trim($stdout))) {
            $chosenDir = trim($stdout);
            if (!cm_browse_allowed($chosenDir)) return ['success'=>false,'message'=>'Selected directory is not allowed.'];
            return [
                'success' => true,
                'directory' => $chosenDir
            ];
        } elseif ($exitCode === 1 && empty(trim($stderr))) {
            return [
                'success' => false,
                'cancelled' => true
            ];
        }
    }
}

if ($checkpoint) $checkpoint();
// 5. Fallback signal for browser folder input
return [
    'success' => false,
    'fallback' => true,
    'message' => 'Native folder dialog unavailable. Please use browser folder picker.'
];
}
