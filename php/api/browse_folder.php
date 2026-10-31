<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!empty($origin)) {
    $parsed = parse_url($origin);
    $host = $parsed['host'] ?? '';
    $serverHost = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), PHP_URL_HOST);
    if (in_array($host, ['localhost', '127.0.0.1', '::1'], true) || $host === $serverHost) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    }
}

header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$initialDir = !empty($input['initialDir']) ? trim($input['initialDir']) : '';

@require_once(__DIR__ . '/../database.php');
if (empty($initialDir)) {
    $initialDir = Storage::getDefaultDirectory();
}

$homeDir = getenv('HOME') ?: ($_SERVER['HOME'] ?? (getenv('USER') ? '/home/' . getenv('USER') : ''));
if (!empty($initialDir) && (str_starts_with($initialDir, '~') || str_starts_with($initialDir, '~/'))) {
    $initialDir = preg_replace('#^~(/|$)#', rtrim($homeDir, '/') . '$1', $initialDir);
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
    $psScript = '[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null; ' .
                '$f = New-Object System.Windows.Forms.FolderBrowserDialog; ' .
                '$f.Description = "Select Music Folder"; ';
    if (!empty($initialDir) && is_dir($initialDir)) {
        $psScript .= '$f.SelectedPath = ' . escapeshellarg($initialDir) . '; ';
    }
    $psScript .= 'if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }';

    $psCmd = 'powershell.exe -NoProfile -NonInteractive -Command ' . escapeshellarg($psScript);
    $output = trim(shell_exec($psCmd) ?? '');
    if (!empty($output) && is_dir($output)) {
        Storage::setDefaultDirectory($output);
        echo json_encode([
            'success' => true,
            'directory' => $output
        ]);
        exit;
    }
}

// 3. Linux / BSD: Try zenity first (standard GTK dialog across GNOME, XFCE, Hyprland, etc.)
$zenity = trim(shell_exec('which zenity 2>/dev/null') ?? '');
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
$kdialog = trim(shell_exec('which kdialog 2>/dev/null') ?? '');
if (!empty($kdialog) && file_exists($kdialog)) {
    $startPath = (!empty($initialDir) && is_dir($initialDir)) ? $initialDir : (getenv('HOME') ?: '/');
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
