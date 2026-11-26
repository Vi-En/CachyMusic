<?php
require_once(__DIR__ . '/../platform.php');
header('Content-Type: application/json; charset=utf-8');
cachy_send_local_cors('GET, POST, OPTIONS', true);

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$NICOTINE_HOST = '127.0.0.1';
$NICOTINE_PORT = (int)(getenv('CACHYMUSIC_SOULSEEK_PORT') ?: 12339);
$NICOTINE_BASE_URL = "http://$NICOTINE_HOST:$NICOTINE_PORT";

function get_project_downloads_dir() {
    if(getenv('CACHYMUSIC_PACKAGED')==='1'){ $d=cachy_data_dir().DIRECTORY_SEPARATOR.'downloads'; if(!is_dir($d))@mkdir($d,0700,true);return $d; }
    $projectDir = realpath(__DIR__ . '/../../');
    $localDownloads = $projectDir . DIRECTORY_SEPARATOR . 'downloads';
    if (!is_dir($localDownloads) && is_writable($projectDir)) {
        @mkdir($localDownloads, 0750, true);
    }
    if (!is_dir($localDownloads) || !is_writable($localDownloads)) {
        $localDownloads = cachy_data_dir() . DIRECTORY_SEPARATOR . 'downloads';
        if (!is_dir($localDownloads)) @mkdir($localDownloads, 0750, true);
    }
    return $localDownloads;
}

$DOWNLOADS_DIR = get_project_downloads_dir();

@require_once(__DIR__ . '/../database.php');

function is_safe_soulseek_directory($dir) {
    if (!is_string($dir) || empty(trim($dir))) return false;
    $trimmed = trim($dir);
    if (strpos($trimmed, "\0") !== false) return false;
    $real = realpath($trimmed);
    if ($real !== false) return is_dir($real) && cachy_is_allowed_scan_path($real);
    $parent = realpath(dirname($trimmed));
    return $parent !== false && cachy_is_allowed_scan_path($parent)
        && !in_array(basename($trimmed), ['.', '..'], true);
}

function sanitize_soulseek_directory($candidate, $fallback) {
    if (!empty($candidate) && is_safe_soulseek_directory($candidate)) {
        return $candidate;
    }
    return $fallback;
}

function get_db_soulseek_account() {
    return Storage::getSoulseekAccount();
}

$action = $_GET['action'] ?? $_POST['action'] ?? 'status';

function ensure_standalone_service_running() {
    $health = @call_nicotine_api('GET', '/health', null, 1);
    if ($health['ok']) return true;

    $logDir = cachy_cache_dir();

    // Packaged desktop launches the integrated child itself. Never modify or launch Nicotine+.
    if(getenv('CACHYMUSIC_PACKAGED')==='1' || getenv('CACHYMUSIC_MANAGED_SERVICES')==='1') return false;
    // Legacy developer mode may start the included service with an already installed Node runtime.
    $projectDir = realpath(__DIR__ . '/../../');
    $serviceScript = $projectDir . DIRECTORY_SEPARATOR . 'server' . DIRECTORY_SEPARATOR . 'soulseek-service.js';
    $nodeBin = cachy_find_binary('node');
    if (file_exists($serviceScript) && $nodeBin !== null) {
        cachy_spawn_detached($nodeBin, [$serviceScript], $logDir . DIRECTORY_SEPARATOR . 'soulseek-node.log');
        for ($i = 0; $i < 12; $i++) {
            usleep(250000);
            $check = @call_nicotine_api('GET', '/health', null, 1);
            if ($check['ok']) return true;
        }
    }
    return false;
}

function call_nicotine_api($method, $path, $payload = null, $timeout = 4) {
    global $NICOTINE_BASE_URL;
    $url = $NICOTINE_BASE_URL . $path;

    if (getenv('CACHYMUSIC_SOULSEEK_DISABLED') === '1' || !function_exists('curl_init')) {
        return ['ok'=>false, 'code'=>503, 'error'=>'Soulseek service or PHP cURL is unavailable'];
    }
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);

    $headers = ['Content-Type: application/json','X-Cachy-Local: 1'];
    if($token=getenv('CACHYMUSIC_SOULSEEK_TOKEN')) $headers[]='X-Cachy-Token: '.$token;

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($payload !== null) {
            $jsonData = is_string($payload) ? $payload : json_encode($payload);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonData);
        }
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return ['ok' => false, 'error' => $error, 'code' => $httpCode];
    }

    $decoded = json_decode($response, true);
    if ($decoded === null && $httpCode >= 400) {
        return ['ok' => false, 'error' => "HTTP error $httpCode", 'code' => $httpCode, 'raw' => $response];
    }

    return ['ok' => ($httpCode >= 200 && $httpCode < 300), 'code' => $httpCode, 'data' => $decoded ?? $response];
}

switch ($action) {
    case 'status':
        $dbAcc = get_db_soulseek_account();
        $dbUser = $dbAcc['username'] ?? '';
        

        // Only auto-start the service on passive status poll if user previously left Soulseek powered on


        $statusRes = call_nicotine_api('GET', '/status', null, 2);
        $statusData = $statusRes['ok'] ? ($statusRes['data'] ?? []) : [];
        $connected = !empty($statusData['connected']);
        $connecting = !empty($statusData['connecting']);

        $isPowered = ($connected || $connecting);
        $loginUser = !empty($statusData['login_username']) && $statusData['login_username'] !== 'Not logged in'
            ? $statusData['login_username']
            : ($dbUser ?: 'Not configured');

        $nicDownDir = $statusData['downloads_dir'] ?? '';
        $dbDownDir = $dbAcc['downloads_dir'] ?? '';
        $activeDownDir = is_safe_soulseek_directory($nicDownDir)
            ? $nicDownDir
            : (is_safe_soulseek_directory($dbDownDir) ? $dbDownDir : $DOWNLOADS_DIR);

        $nicShareDir = $statusData['shared_dir'] ?? '';
        $dbShareDir = $dbAcc['shared_dir'] ?? '';
        $activeShareDir = ($statusRes['ok'] && $nicShareDir==='') ? '' : (is_safe_soulseek_directory($nicShareDir)
            ? $nicShareDir
            : (is_safe_soulseek_directory($dbShareDir) ? $dbShareDir : ''));

        // Auto-heal poisoned or unauthorized directory paths in Storage and Nicotine+
        if ((!empty($dbDownDir) && !is_safe_soulseek_directory($dbDownDir)) || (!empty($dbShareDir) && !is_safe_soulseek_directory($dbShareDir))) {
            $healAcc = Storage::getSoulseekAccount();
            $healAcc['downloads_dir'] = $activeDownDir;
            $healAcc['shared_dir'] = $activeShareDir;
            Storage::saveSoulseekAccount($healAcc);
        }
        if ($statusRes['ok'] && !empty($nicDownDir) && !is_safe_soulseek_directory($nicDownDir)) {
            @call_nicotine_api('POST', '/directory', ['directory' => $activeDownDir], 2);
        }
        if ($statusRes['ok'] && !empty($nicShareDir) && !is_safe_soulseek_directory($nicShareDir)) {
            @call_nicotine_api('POST', '/shared_directory', ['directory' => $activeShareDir], 2);
        }

        echo json_encode([
            'ok' => true,
            'daemon_running' => $statusRes['ok'],
            'client' => 'cachymusic-integrated',
            'connected' => $connected,
            'connecting' => $connecting,
            'powered_on' => $isPowered,
            'has_credentials' => !empty($statusData['has_credentials']),
            'login_username' => $loginUser,
            'login_status' => $connected ? 2 : ($connecting ? 1 : 0),
            'uploads_total' => $statusData['uploads_total'] ?? 0,
            'downloads_total' => $statusData['downloads_total'] ?? 0,
            'downloads_dir' => $activeDownDir,
            'shared_dir' => $activeShareDir,
            'standalone' => false,
            'nicotine' => false,
            'error' => $statusData['error'] ?? null,
            'raw' => $statusData
        ]);
        exit;

    case 'start_daemon':
        $started = ensure_standalone_service_running();
        echo json_encode([
            'ok' => $started,
            'daemon_running' => $started,
            'client' => 'cachymusic-integrated',
            'message' => $started ? 'Integrated Soulseek service is running.' : 'Integrated Soulseek service is unavailable.'
        ]);
        exit;

    case 'power':
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? $_POST;
        $state = strtolower(trim($input['state'] ?? $_GET['state'] ?? ''));

        ensure_standalone_service_running();
        $dbAcc = get_db_soulseek_account();

        if ($state === 'off') {
            call_nicotine_api('POST', '/power', ['state' => 'off'], 5);
            $curAcc = Storage::getSoulseekAccount();
            $curAcc['is_powered_on'] = 0;
            if (!Storage::saveSoulseekAccount($curAcc)) { echo json_encode(['ok'=>false,'error'=>'Power-off requested, but local preferences could not be saved.']); exit; }
            echo json_encode([
                'ok' => true,
                'powered_on' => false,
                'connected' => false,
                'message' => 'Soulseek disconnected. Disconnected from network and files unshared.'
            ]);
            exit;
        }

        if ($state === 'on') {
            $nicAcc = call_nicotine_api('GET', '/account');
            $nicData = $nicAcc['ok'] ? ($nicAcc['data'] ?? []) : [];
            $nicUser = $nicData['username'] ?? '';
            $nicHasPass = !empty($nicData['hasPassword']);

            $username = $nicUser;
            if (!$nicHasPass || empty($username)) {
                echo json_encode([
                    'ok' => false,
                    'powered_on' => false,
                    'error' => 'No Soulseek credentials found. Please configure username and password in Settings.'
                ]);
                exit;
            }

            $safeDown = sanitize_soulseek_directory($dbAcc['downloads_dir'] ?? '', $DOWNLOADS_DIR);
            $safeShare = sanitize_soulseek_directory($dbAcc['shared_dir'] ?? '', '');
            call_nicotine_api('POST', '/directory', ['directory' => $safeDown]);
            call_nicotine_api('POST', '/shared_directory', ['directory' => $safeShare]);

            $powerPayload = ['state' => 'on'];
            if (!empty($username)) $powerPayload['username'] = $username;

            $loginRes = call_nicotine_api('POST', '/power', $powerPayload, 12);

            if (!$loginRes['ok']) {
                $curAcc = Storage::getSoulseekAccount();
                $curAcc['is_powered_on'] = 0;
                Storage::saveSoulseekAccount($curAcc);
                $errText = $loginRes['data']['error'] ?? $loginRes['error'] ?? 'Login failed on Soulseek network';
                $reason = 'network_error';
                if (stripos($errText, '12339') !== false || stripos($errText, 'refused') !== false) {
                    $reason = 'daemon_offline';
                    $errText = 'Soulseek daemon is unreachable on port 12339.';
                } else if (stripos($errText, 'password') !== false || stripos($errText, 'invalid') !== false || stripos($errText, 'credentials') !== false) {
                    $reason = 'invalid_credentials';
                    $errText = 'Invalid Soulseek username or password. Please verify your credentials.';
                } else if (stripos($errText, 'timed out') !== false || stripos($errText, 'timeout') !== false) {
                    $reason = 'network_unreachable';
                    $errText = 'Network timeout reaching Soulseek server (server.slsknet.org).';
                }
                echo json_encode([
                    'ok' => false,
                    'powered_on' => false,
                    'error' => $errText,
                    'reason' => $reason
                ]);
                exit;
            }

            $curAcc = Storage::getSoulseekAccount();
            $curAcc['is_powered_on'] = 1;
            if (!Storage::saveSoulseekAccount($curAcc)) { echo json_encode(['ok'=>false,'error'=>'Service connected, but local preferences could not be saved.']); exit; }

            echo json_encode([
                'ok' => true,
                'powered_on' => true,
                'connected' => true,
                'username' => $username,
                'message' => 'Connected to Soulseek network!'
            ]);
            exit;
        }

        echo json_encode(['ok' => false, 'error' => 'Invalid power state']);
        exit;

    case 'login':
    case 'account':
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? $_POST;
        ensure_standalone_service_running();

        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            $dbAcc = get_db_soulseek_account();
            $accRes = call_nicotine_api('GET', '/account');
            $nicData = $accRes['ok'] ? ($accRes['data'] ?? []) : [];

            $uname = !empty($dbAcc['username']) ? $dbAcc['username'] : ($nicData['username'] ?? '');
            $hasPass = !empty($nicData['hasPassword']);
            $nicDown = $nicData['downloads_dir'] ?? '';
            $dbDown = $dbAcc['downloads_dir'] ?? '';
            $downDir = is_safe_soulseek_directory($nicDown)
                ? $nicDown
                : (is_safe_soulseek_directory($dbDown) ? $dbDown : $DOWNLOADS_DIR);

            $nicShare = $nicData['shared_dir'] ?? '';
            $dbShare = $dbAcc['shared_dir'] ?? '';
            $shareDir = is_safe_soulseek_directory($nicShare)
                ? $nicShare
                : (is_safe_soulseek_directory($dbShare) ? $dbShare : '');

            echo json_encode([
                'ok' => true,
                'username' => $uname,
                'hasPassword' => $hasPass,
                'is_powered_on' => !empty($nicData['powered_on']),
                'downloads_dir' => $downDir,
                'shared_dir' => $shareDir
            ]);
            exit;
        }

        $username = trim($input['username'] ?? '');
        $password = trim($input['password'] ?? '');
        $downloadsDir = trim($input['downloads_dir'] ?? $input['download_dir'] ?? '');
        $sharedDir = trim($input['shared_dir'] ?? '');

        if (!empty($downloadsDir) && !is_safe_soulseek_directory($downloadsDir)) {
            $downloadsDir = $DOWNLOADS_DIR;
        }
        if (!empty($sharedDir) && !is_safe_soulseek_directory($sharedDir)) {
            $sharedDir = '';
        }

        $dbAcc = get_db_soulseek_account();
        $plainPassword = $password;
        if ($password === '') {
            $live = call_nicotine_api('GET','/account');
            $account = $live['ok'] ? ($live['data'] ?? []) : [];
            if (empty($account['hasPassword']) || $username !== ($account['username'] ?? '')) {
                echo json_encode(['ok'=>false,'error'=>'Username and password are required.']); exit;
            }
        }

        $curDown = sanitize_soulseek_directory($downloadsDir ?: ($dbAcc['downloads_dir'] ?? ''), $DOWNLOADS_DIR);
        $curShare = sanitize_soulseek_directory($sharedDir, '');

        if (!Storage::saveSoulseekAccount([
            'username' => $username,
            'password' => '',
            'is_powered_on' => 1,
            'downloads_dir' => $curDown,
            'shared_dir' => $curShare
        ])) { echo json_encode(['ok'=>false,'error'=>'Soulseek preferences could not be saved.']); exit; }

        $serviceUp = ensure_standalone_service_running();
        if (!$serviceUp) {
            $curAcc = Storage::getSoulseekAccount();
            $curAcc['is_powered_on'] = 0;
            Storage::saveSoulseekAccount($curAcc);
            echo json_encode([
                'ok' => false,
                'powered_on' => false,
                'error' => 'Integrated Soulseek service is unavailable.',
                'reason' => 'daemon_offline'
            ]);
            exit;
        }

        if (!empty($curDown)) call_nicotine_api('POST', '/directory', ['directory' => $curDown]);
        call_nicotine_api('POST', '/shared_directory', ['directory' => $curShare]);

        $res = call_nicotine_api('POST', '/power', [
            'state' => 'on',
            'username' => $username,
            'password' => $plainPassword
        ], 12);

        if (!$res['ok']) {
            $curAcc = Storage::getSoulseekAccount();
            $curAcc['is_powered_on'] = 0;
            Storage::saveSoulseekAccount($curAcc);
            $errText = $res['data']['error'] ?? $res['error'] ?? 'Login failed on Soulseek network';
            $reason = 'network_error';
            if (stripos($errText, '12339') !== false || stripos($errText, 'refused') !== false) {
                $reason = 'daemon_offline';
                $errText = 'Soulseek daemon is unreachable on port 12339.';
            } else if (stripos($errText, 'password') !== false || stripos($errText, 'invalid') !== false || stripos($errText, 'credentials') !== false) {
                $reason = 'invalid_credentials';
                $errText = 'Invalid Soulseek username or password. Please verify your credentials.';
            } else if (stripos($errText, 'timed out') !== false || stripos($errText, 'timeout') !== false) {
                $reason = 'network_unreachable';
                $errText = 'Network timeout reaching Soulseek server (server.slsknet.org).';
            }
            echo json_encode([
                'ok' => false,
                'error' => $errText,
                'reason' => $reason
            ]);
            exit;
        }

        echo json_encode([
            'ok' => true,
            'username' => $username,
            'powered_on' => true,
            'message' => 'Connected. Password kept in session memory only.'
        ]);
        exit;

    case 'logout':
        ensure_standalone_service_running();
        call_nicotine_api('POST', '/logout');
        $curAcc = Storage::getSoulseekAccount();
        $curAcc['username'] = '';
        $curAcc['password'] = '';
        $curAcc['is_powered_on'] = 0;
        if (!Storage::saveSoulseekAccount($curAcc)) { echo json_encode(['ok'=>false,'error'=>'Local account preferences could not be cleared; service logout was requested.']); exit; }
        echo json_encode(['ok' => true, 'message' => 'Credentials removed from database and disconnected.']);
        exit;

    case 'directory':
    case 'config/directory':
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? $_POST;
        $newDir = trim($input['directory'] ?? $input['downloads_dir'] ?? '');
        if (!empty($newDir)) {
            if (!is_safe_soulseek_directory($newDir)) {
                $newDir = $DOWNLOADS_DIR;
            }
            $curAcc = Storage::getSoulseekAccount();
            $curAcc['downloads_dir'] = $newDir;
            if (!Storage::saveSoulseekAccount($curAcc)) { echo json_encode(['ok'=>false,'error'=>'Download directory could not be saved.']); exit; }
            call_nicotine_api('POST', '/directory', ['directory' => $newDir]);
        } else {
            $newDir = $DOWNLOADS_DIR;
        }
        echo json_encode(['ok' => true, 'downloads_dir' => $newDir]);
        exit;

    case 'shared_directory':
    case 'config/shared_directory':
        $raw = file_get_contents('php://input',false,null,0,16384);
        $input = json_decode($raw,true) ?? [];
        $newDir = trim((string)($input['directory'] ?? $input['shared_dir'] ?? ''));
        if($newDir!=='' && !is_safe_soulseek_directory($newDir)) {http_response_code(400);echo json_encode(['ok'=>false,'error'=>'Invalid shared directory']);exit;}
        $curAcc = Storage::getSoulseekAccount();
        $curAcc['shared_dir'] = $newDir;
        if (!Storage::saveSoulseekAccount($curAcc)) { echo json_encode(['ok'=>false,'error'=>'Shared directory could not be saved.']); exit; }
        call_nicotine_api('POST','/shared_directory',['directory'=>$newDir]);
        echo json_encode(['ok'=>true,'shared_dir'=>$newDir]);exit;

    case 'search':
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? $_POST;
        $query = trim($input['query'] ?? $_GET['query'] ?? '');
        $mode = $input['mode'] ?? 'global';

        if (empty($query)) {
            echo json_encode(['ok' => false, 'message' => 'Search query is required.']);
            exit;
        }

        $res = call_nicotine_api('POST', '/search', [
            'query' => $query,
            'mode' => $mode,
            'switch_page' => false
        ]);

        if (!$res['ok']) {
            echo json_encode([
                'ok' => false,
                'message' => $res['data']['error'] ?? $res['error'] ?? 'Search request failed'
            ]);
            exit;
        }

        echo json_encode([
            'ok' => true,
            'token' => $res['data']['token'] ?? null,
            'query' => $query
        ]);
        exit;

    case 'results':
        $token = $_GET['token'] ?? null;
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 150;
        $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

        $path = '/search/results?limit=' . urlencode($limit) . '&offset=' . urlencode($offset);
        if ($token !== null && $token !== '') {
            $path .= '&token=' . urlencode($token);
        }

        $res = call_nicotine_api('GET', $path);
        if (!$res['ok']) {
            echo json_encode([
                'ok' => false,
                'message' => $res['data']['error'] ?? $res['error'] ?? 'Could not fetch results'
            ]);
            exit;
        }

        $data = $res['data'] ?? [];
        $items = $data['items'] ?? [];
        $enrichedItems = [];

        foreach ($items as $idx => $item) {
            $filePath = $item['file_path'] ?? '';
            // Split path into clean parts (support both \ and / from Windows/Linux peers)
            $normalizedPath = str_replace('\\', '/', $filePath);
            $parts = explode('/', $normalizedPath);
            $filename = end($parts);

            $ext = strtolower($item['extension'] ?? pathinfo($filename, PATHINFO_EXTENSION));
            $attrs = $item['file_attributes'] ?? [];

            // Soulseek file attributes mapping:
            // 0: bitrate (kbps)
            // 1: duration (seconds)
            // 2: vbr (0 or 1)
            // 3: samplerate (Hz)
            // 4: bitdepth (bits)
            $bitrate = isset($attrs['0']) ? (int)$attrs['0'] : (isset($attrs[0]) ? (int)$attrs[0] : null);
            $duration = isset($attrs['1']) ? (int)$attrs['1'] : (isset($attrs[1]) ? (int)$attrs[1] : null);
            $sampleRate = isset($attrs['3']) ? (int)$attrs['3'] : (isset($attrs[3]) ? (int)$attrs[3] : null);
            $bitDepth = isset($attrs['4']) ? (int)$attrs['4'] : (isset($attrs[4]) ? (int)$attrs[4] : null);

            $sizeBytes = $item['size'] ?? 0;
            $sizeStr = $sizeBytes > 0 ? format_size_human($sizeBytes) : 'Unknown';

            $isLossless = in_array($ext, ['flac', 'wav', 'alac', 'aiff']);

            // Reported bitrate or an explicitly labelled file-size estimate.
            $bitrateSource = ($bitrate !== null && $bitrate > 0) ? 'reported' : 'unknown';
            if ($bitrateSource === 'unknown') {
                $bitrate = null;
                if ($sizeBytes > 0 && $duration > 0) {
                    $calcBitrate = (int)round(($sizeBytes * 8) / ($duration * 1000));
                    if ($calcBitrate > 0 && $calcBitrate <= 9216) {
                        $bitrate = $calcBitrate;
                        $bitrateSource = 'estimated';
                    }
                }
            }

            // Clean title & artist guess from folder structure and filename
            $artistGuess = count($parts) >= 3 ? $parts[count($parts) - 3] : (count($parts) >= 2 ? $parts[count($parts) - 2] : '');
            $albumGuess = count($parts) >= 2 ? $parts[count($parts) - 2] : '';

            $enrichedItems[] = [
                'index' => $offset + $idx,
                'username' => $item['username'] ?? '',
                'filePath' => $filePath,
                'filename' => $filename,
                'extension' => strtoupper($ext),
                'size' => $sizeBytes,
                'sizeFormatted' => $sizeStr,
                'freeSlots' => !empty($item['free_upload_slots']),
                'queuePosition' => (int)($item['queue_position'] ?? 0),
                'speed' => (int)($item['upload_speed'] ?? 0),
                'speedFormatted' => format_speed_human((int)($item['upload_speed'] ?? 0)),
                'bitrate' => $bitrate,
                'bitrateSource' => $bitrateSource,
                'duration' => $duration,
                'sampleRate' => $sampleRate,
                'bitDepth' => $bitDepth,
                'artistGuess' => $artistGuess,
                'albumGuess' => $albumGuess,
                'isLossless' => $isLossless,
                'isHighBitrate' => ($bitrate !== null && $bitrate >= 320) || $isLossless,
            ];
        }

        echo json_encode([
            'ok' => true,
            'token' => $data['token'] ?? $token,
            'total' => $data['total'] ?? count($items),
            'count' => count($enrichedItems),
            'items' => $enrichedItems
        ], JSON_UNESCAPED_SLASHES);
        exit;

    case 'download':
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? $_POST;
        $dbAcc = get_db_soulseek_account();
        $reqFolder = trim($input['folder_path'] ?? '');
        if (!empty($reqFolder) && !is_safe_soulseek_directory($reqFolder)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => 'Invalid or unauthorized download folder path.']);
            exit;
        }
        $targetFolder = !empty($reqFolder)
            ? $reqFolder
            : sanitize_soulseek_directory($dbAcc['downloads_dir'] ?? '', $DOWNLOADS_DIR);

        if (isset($input['items']) && is_array($input['items'])) {
            // 1-Click Album / Multi-Track Batch Download
            $queued = 0;
            $failed = 0;
            foreach ($input['items'] as $item) {
                if (!empty($item['username']) && !empty($item['virtual_path'])) {
                    $res = call_nicotine_api('POST', '/downloads/enqueue', [
                        'username' => $item['username'],
                        'virtual_path' => $item['virtual_path'],
                        'folder_path' => $targetFolder,
                        'size' => (int)($item['size'] ?? 0),
                        'bypass_filter' => true
                    ]);
                    if ($res['ok']) $queued++;
                    else $failed++;
                }
            }
            echo json_encode(['ok' => true, 'queued' => true, 'count' => $queued, 'failed' => $failed]);
            exit;
        } else if (isset($input['token']) && isset($input['index'])) {
            // Queue via search token & index
            $res = call_nicotine_api('POST', '/search/download', [
                'token' => (int)$input['token'],
                'index' => (int)$input['index'],
                'folder_path' => $targetFolder,
                'bypass_filter' => true
            ]);
        } else if (!empty($input['username']) && !empty($input['virtual_path'])) {
            // Queue directly via user and path
            $res = call_nicotine_api('POST', '/downloads/enqueue', [
                'username' => $input['username'],
                'virtual_path' => $input['virtual_path'],
                'folder_path' => $targetFolder,
                'size' => (int)($input['size'] ?? 0),
                'bypass_filter' => true
            ]);
        } else {
            echo json_encode(['ok' => false, 'message' => 'Missing download parameters (token + index or username + virtual_path required).']);
            exit;
        }

        if (!$res['ok']) {
            echo json_encode([
                'ok' => false,
                'message' => $res['data']['error'] ?? $res['error'] ?? 'Download enqueue failed'
            ]);
            exit;
        }

        echo json_encode([
            'ok' => true,
            'queued' => true,
            'id' => $res['data']['id'] ?? null,
            'data' => $res['data']
        ]);
        exit;

    case 'pause_download':
        $raw   = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? [];
        $res   = call_nicotine_api('POST', '/downloads/abort', [
            'id'           => $input['id']           ?? '',
            'username'     => $input['username']     ?? '',
            'virtual_path' => $input['virtual_path'] ?? '',
            'status'       => 'Paused',
        ]);
        echo json_encode(['ok' => $res['ok'], 'data' => $res['data'] ?? null, 'error' => $res['data']['error'] ?? $res['error'] ?? null]);
        exit;

    case 'cancel_download':
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        // Clear the exact transfer in one operation, not an abort followed by
        // a second broad path lookup after the first has removed the entry.
        $res = call_nicotine_api('POST', '/downloads/clear', [
            'id' => $input['id'] ?? '',
            'username' => $input['username'] ?? '',
            'virtual_path' => $input['virtual_path'] ?? '',
        ]);
        echo json_encode(['ok' => $res['ok'], 'cleared' => $res['ok'], 'error' => $res['data']['error'] ?? $res['error'] ?? null]);
        exit;

    case 'resume_download':
        $raw   = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? [];
        $res   = call_nicotine_api('POST', '/downloads/retry', [
            'id'           => $input['id']           ?? '',
            'username'     => $input['username']     ?? '',
            'virtual_path' => $input['virtual_path'] ?? '',
            'size'         => $input['size']         ?? 0,
        ]);
        echo json_encode(['ok' => $res['ok'], 'data' => $res['data'] ?? null, 'error' => $res['data']['error'] ?? $res['error'] ?? null]);
        exit;

    case 'resume_all':
        $res = call_nicotine_api('POST', '/downloads/resume_all');
        echo json_encode(['ok' => $res['ok'], 'data' => $res['data'] ?? null, 'error' => $res['data']['error'] ?? $res['error'] ?? null]);
        exit;

    case 'pause_all':
        $res = call_nicotine_api('POST', '/downloads/pause_all');
        echo json_encode(['ok' => $res['ok'], 'data' => $res['data'] ?? null, 'error' => $res['data']['error'] ?? $res['error'] ?? null]);
        exit;

    case 'clear_download':
        $raw   = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? [];
        $res   = call_nicotine_api('POST', '/downloads/clear', [
            'id'           => $input['id'] ?? '',
            'username'     => $input['username']     ?? '',
            'virtual_path' => $input['virtual_path'] ?? '',
        ]);
        echo json_encode(['ok' => $res['ok'], 'data' => $res['data'] ?? null]);
        exit;

    case 'transfers':
        $res = call_nicotine_api('GET', '/downloads?active_only=false');
        if (!$res['ok']) {
            echo json_encode(['ok' => false, 'items' => []]);
            exit;
        }

        $items = $res['data']['items'] ?? [];
        $formatted = [];

        if (!Storage::beginBatch()) { echo json_encode(['ok'=>false,'error'=>'Library storage unreadable.']); exit; }
        foreach ($items as $item) {
            $virtPath = $item['virtual_path'] ?? '';
            $norm = str_replace('\\', '/', $virtPath);
            $fn = !empty($item['filename']) ? $item['filename'] : basename($norm);
            $status = $item['status'] ?? 'Unknown';
            $progress = round((float)($item['progress_pct'] ?? 0), 1);

            // Only the exact backend-owned final path can identify a download.
            // A matching basename in another folder may be a different song.
            $targetLocalFile = !empty($item['local_file']) && is_string($item['local_file']) ? $item['local_file'] : '';
            $fileExists = $targetLocalFile !== '' && !is_link($targetLocalFile) && is_file($targetLocalFile) && is_safe_soulseek_directory(dirname($targetLocalFile));
            $isFin = $status === 'Finished';

            // Instant Auto-Indexing (deduplicated against cached mtime & size to prevent re-index storms on polling)
            if ($isFin && $fileExists) {
                $ext = strtolower(pathinfo($targetLocalFile, PATHINFO_EXTENSION));
                if (in_array($ext, ['mp3', 'flac', 'm4a', 'wav', 'ogg', 'aac', 'opus'])) {
                    $fileMtime = @filemtime($targetLocalFile) ?: 0;
                    $fileSize = @filesize($targetLocalFile) ?: 0;
                    $cachedTrack = Storage::getTrackByPath($targetLocalFile);
                    $alreadyIndexed = is_array($cachedTrack)
                        && (int)($cachedTrack['mtime'] ?? -1) === (int)$fileMtime
                        && (int)($cachedTrack['file_size'] ?? -1) === (int)$fileSize
                        && !empty($cachedTrack['title']);
                    if (!$alreadyIndexed) {
                        @require_once(__DIR__ . '/scan.php');
                        if (function_exists('extract_actual_audio_metadata')) {
                            $meta = extract_actual_audio_metadata($targetLocalFile, $ext, $fileSize);
                            Storage::upsertTrack([
                                'file_path' => $targetLocalFile,
                                'full_path' => $targetLocalFile,
                                'title' => $meta['title'] ?: pathinfo($targetLocalFile, PATHINFO_FILENAME),
                                'artist' => $meta['artist'] ?: 'Soulseek Download',
                                'album' => $meta['album'] ?: 'Downloads',
                                'genre' => $meta['genre'] ?: 'Audio',
                                'year' => $meta['year'] ?: null,
                                'track_num' => $meta['track'] ?: null,
                                'duration' => $meta['duration'] ?: 0,
                                'bitrate' => $meta['bitrate'] ?: null,
                                'sample_rate' => $meta['sampleRate'] ?: 44100,
                                'channels' => $meta['channels'] ?: 2,
                                'bit_depth' => $meta['bitDepth'] ?? 16,
                                'format' => strtoupper($ext),
                                'file_size' => $fileSize,
                                'mtime' => $fileMtime,
                                'has_cover' => !empty($meta['hasCover']),
                                'lyrics' => $meta['lyrics'] ?? null,
                                'replay_gain' => $meta['replayGain'] ?? null,
                                'replay_peak' => $meta['replayPeak'] ?? null
                            ]);
                        }
                    }
                }
            }

            $partFile = !empty($item['part_file']) ? $item['part_file'] : ($targetLocalFile !== '' ? $targetLocalFile . '.part' : '');
            $partExists = $partFile !== '' && is_file($partFile) && is_safe_soulseek_directory(dirname($partFile));
            $bytesDownloaded = !empty($item['bytes_downloaded']) ? (int)$item['bytes_downloaded'] : ($partExists ? filesize($partFile) : ($fileExists ? filesize($targetLocalFile) : 0));

            $formatted[] = [
                'id' => $item['id'] ?? (($item['username'] ?? '') . ':' . $virtPath),
                'username' => $item['username'] ?? '',
                'virtualPath' => $virtPath,
                'filename' => $fn,
                'size' => $item['size'] ?? 0,
                'sizeFormatted' => format_size_human($item['size'] ?? 0),
                'speed' => $item['speed'] ?? 0,
                'speedFormatted' => format_speed_human($item['speed'] ?? 0),
                'status' => $status,
                'progress' => $progress,
                'queuePosition' => $item['queue_position'] ?? 0,
                'isFinished' => $isFin,
                'localFile' => $targetLocalFile,
                'partFile' => $partFile,
                'partExists' => $partExists,
                'bytesDownloaded' => $bytesDownloaded,
                'fileExists' => $fileExists
            ];
        }
        if (!Storage::commitBatch()) { echo json_encode(['ok'=>false,'error'=>'Library changed during indexing or storage commit failed. Retry indexing.']); exit; }

        echo json_encode([
            'ok' => true,
            'count' => count($formatted),
            'items' => $formatted
        ]);
        exit;

    case 'uploads':
        $res = call_nicotine_api('GET', '/uploads?active_only=false');
        if (!$res['ok']) {
            echo json_encode(['ok' => false, 'items' => []]);
            exit;
        }
        $uploadItems = $res['data']['items'] ?? [];
        echo json_encode([
            'ok' => true,
            'count' => count($uploadItems),
            'items' => $uploadItems
        ]);
        exit;

    case 'import_track':
        // Imports a downloaded track into CachyMusic format
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? $_POST;
        $targetFile = $input['file'] ?? $input['path'] ?? '';

        if (empty($targetFile)) {
            echo json_encode(['ok' => false, 'message' => 'No file specified for import.']);
            exit;
        }

        // Check if full path or relative to downloads dir
        if (!file_exists($targetFile)) {
            $candidate = $DOWNLOADS_DIR . '/' . ltrim(basename($targetFile), '/');
            if (file_exists($candidate)) {
                $targetFile = $candidate;
            } else {
                echo json_encode(['ok' => false, 'message' => 'File not found on disk: ' . htmlspecialchars($targetFile)]);
                exit;
            }
        }

        $realPath = realpath($targetFile);
        $ext = strtolower(pathinfo($realPath ?: '', PATHINFO_EXTENSION));
        $allowedAudioExts = ['mp3', 'flac', 'm4a', 'wav', 'ogg', 'aac', 'opus', 'wma'];
        if (!$realPath || !is_file($realPath) || !in_array($ext, $allowedAudioExts, true) || !is_safe_soulseek_directory(dirname($realPath))) {
            echo json_encode(['ok' => false, 'message' => 'Invalid or unsupported audio file for import.']);
            exit;
        }
        $fileSize = filesize($realPath);
        $filename = basename($realPath);

        // Include metadata extractor from scan.php
        @require_once(__DIR__ . '/../database.php');
        @require_once(__DIR__ . '/scan.php');

        $meta = function_exists('extract_actual_audio_metadata')
            ? extract_actual_audio_metadata($realPath, $ext, $fileSize)
            : [
                'title' => pathinfo($filename, PATHINFO_FILENAME),
                'artist' => 'Soulseek Download',
                'album' => 'Downloads',
                'genre' => 'Audio',
                'year' => date('Y'),
                'track' => null,
                'duration' => 0,
                'bitrate' => null,
                'sampleRate' => 44100,
                'channels' => 2,
                'codec' => $ext,
                'cover' => null
            ];

        $tid = null;
        if (class_exists('Storage')) {
            $tid = Storage::upsertTrack([
                'file_path' => $realPath,
                'full_path' => $realPath,
                'title' => $meta['title'] ?: pathinfo($filename, PATHINFO_FILENAME),
                'artist' => $meta['artist'] ?: 'Soulseek Download',
                'album' => $meta['album'] ?: 'Downloads',
                'genre' => $meta['genre'] ?: 'Audio',
                'year' => $meta['year'] ?: null,
                'track_num' => $meta['track'] ?: null,
                'duration' => $meta['duration'] ?: 0,
                'bitrate' => $meta['bitrate'] ?: null,
                'sample_rate' => $meta['sampleRate'] ?: 44100,
                'channels' => $meta['channels'] ?: 2,
                'bit_depth' => $meta['bitDepth'] ?? 16,
                'format' => strtoupper($meta['codec'] ?: $ext),
                'file_size' => $fileSize,
                'mtime' => filemtime($realPath),
                'has_cover' => !empty($meta['hasCover']) || !empty($meta['cover']),
                'lyrics' => $meta['lyrics'] ?? null,
                'replay_gain' => $meta['replayGain'] ?? null,
                'replay_peak' => $meta['replayPeak'] ?? null
            ]);
        }

        // Storage allocated and verified the authoritative identity. Never
        // reselect by basename: two different downloads may share a filename.
        if (!$tid) { echo json_encode(['ok'=>false,'error'=>'Track could not be indexed. Check library storage.']); exit; }

        $trackObj = [
            'id' => $tid ?: $filename,
            'tid' => $tid,
            'filename' => $filename,
            'fullPath' => $realPath,
            'title' => $meta['title'] ?: pathinfo($filename, PATHINFO_FILENAME),
            'artist' => $meta['artist'] ?: 'Soulseek Download',
            'album' => $meta['album'] ?: 'Soulseek',
            'genre' => $meta['genre'] ?: 'Audio',
            'year' => $meta['year'] ?: null,
            'track' => $meta['track'] ?: null,
            'duration' => $meta['duration'] ?: 0,
            'bitrate' => $meta['bitrate'] ?: null,
            'sampleRate' => $meta['sampleRate'] ?: null,
            'channels' => $meta['channels'] ?: 2,
            'format' => strtoupper($meta['codec'] ?: $ext),
            'size' => format_size_human($fileSize),
            'cover' => $meta['cover'] ?? null,
            'hasCover' => !empty($meta['cover']),
            'src' => $tid ? ('php/api/stream.php?tid=' . $tid) : ('php/api/stream.php?path=' . urlencode($realPath))
        ];

        echo json_encode([
            'ok' => true,
            'track' => $trackObj
        ], JSON_UNESCAPED_SLASHES);
        exit;

    default:
        echo json_encode(['ok' => false, 'message' => "Unknown action: $action"]);
        exit;
}

function format_size_human($bytes) {
    if ($bytes <= 0) return '0 B';
    $units = ['B', 'KB', 'MB', 'GB'];
    $i = floor(log($bytes, 1024));
    return round($bytes / pow(1024, $i), 1) . ' ' . $units[$i];
}

function format_speed_human($bytesPerSec) {
    if ($bytesPerSec <= 0) return '0 B/s';
    if ($bytesPerSec < 1024) return $bytesPerSec . ' B/s';
    if ($bytesPerSec < 1048576) return round($bytesPerSec / 1024, 1) . ' KB/s';
    return round($bytesPerSec / 1048576, 2) . ' MB/s';
}
