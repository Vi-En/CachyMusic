<?php
session_start();
require_once(__DIR__ . '/../platform.php');
header('Content-Type: application/json; charset=utf-8');
cachy_send_local_cors('GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$initialDir = !empty($input['initialDir']) ? trim($input['initialDir']) : '';

@require_once(__DIR__ . '/../database.php');
if (empty($initialDir)) {
    $initialDir = Storage::getDefaultDirectory();
}

$homeDir = cachy_home_dir();
if (!empty($initialDir) && (str_starts_with($initialDir, '~') || str_starts_with($initialDir, '~/'))) {
    $initialDir = preg_replace('#^~(/|$)#', rtrim($homeDir, "/\\") . '$1', $initialDir);
}

$osFamily = PHP_OS_FAMILY;

// 1. macOS (Darwin) Native Folder Picker via osascript
if ($osFamily === 'Darwin' || PHP_OS === 'Darwin') {
    $osaCmd = 'osascript -e \'POSIX path of (choose folder with prompt "Select Music Folder")\' 2>/dev/null';
    $output = trim(shell_exec($osaCmd) ?? '');
    if (!empty($output) && is_dir($output)) {
        Storage::setDefaultDirectory($output);
        echo json_encode([
            'success' => true,
            'directory' => $output
        ]);
        exit;
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
    $result = is_file($ps) ? cachy_run_args([$ps, '-NoProfile', '-STA', '-Command', $psScript]) : null;
    $output = trim($result ?? '');
    if ($output !== '' && is_dir($output)) {
        Storage::setDefaultDirectory($output);
        echo json_encode(['success'=>true,'directory'=>$output]);
    } else {
        echo json_encode(['success'=>false, 'cancelled'=>$result !== null, 'fallback'=>$result === null]);
    }
    exit;
}

// 3. Linux / BSD: Try zenity first (standard GTK dialog across GNOME, XFCE, Hyprland, etc.)
$zenity = cachy_find_binary('zenity') ?? '';
if (!empty($zenity) && file_exists($zenity)) {
    $cmd = escapeshellcmd($zenity) . ' --file-selection --directory --title=' . escapeshellarg('Select Music Folder');
    if (!empty($initialDir) && is_dir($initialDir)) {
        $cmd .= ' --filename=' . escapeshellarg(rtrim($initialDir, '/') . '/');
    }

    $descriptorSpec = [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"]
    ];

    $process = proc_open($cmd, $descriptorSpec, $pipes);
    if (is_resource($process)) {
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);

        if ($exitCode === 0 && !empty(trim($stdout))) {
            $chosenDir = trim($stdout);
            Storage::setDefaultDirectory($chosenDir);
            echo json_encode([
                'success' => true,
                'directory' => $chosenDir
            ]);
            exit;
        } elseif ($exitCode === 1 && empty(trim($stderr))) {
            echo json_encode([
                'success' => false,
                'cancelled' => true
            ]);
            exit;
        }
    }
}

// 4. Linux / BSD: Try kdialog fallback (KDE)
$kdialog = cachy_find_binary('kdialog') ?? '';
if (!empty($kdialog) && file_exists($kdialog)) {
    $startPath = (!empty($initialDir) && is_dir($initialDir)) ? $initialDir : (cachy_home_dir() ?: '/');
    $cmd = escapeshellcmd($kdialog) . ' --getexistingdirectory ' . escapeshellarg($startPath) . ' --title ' . escapeshellarg('Select Music Folder');

    $descriptorSpec = [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"]
    ];

    $process = proc_open($cmd, $descriptorSpec, $pipes);
    if (is_resource($process)) {
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);

        if ($exitCode === 0 && !empty(trim($stdout))) {
            $chosenDir = trim($stdout);
            Storage::setDefaultDirectory($chosenDir);
            echo json_encode([
                'success' => true,
                'directory' => $chosenDir
            ]);
            exit;
        } elseif ($exitCode === 1 && empty(trim($stderr))) {
            echo json_encode([
                'success' => false,
                'cancelled' => true
            ]);
            exit;
        }
    }
}

// 5. Fallback signal for browser folder input
echo json_encode([
    'success' => false,
    'fallback' => true,
    'message' => 'Native folder dialog unavailable. Please use browser folder picker.'
]);
