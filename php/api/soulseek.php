<?php
header('Content-Type: application/json; charset=utf-8');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!empty($origin)) {
    $parsed = parse_url($origin);
    $host = $parsed['host'] ?? '';
    $serverHost = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), PHP_URL_HOST);
    $isLocalOrLan = in_array($host, ['localhost', '127.0.0.1', '::1', 'appassets.androidplatform.net'], true)
        || $host === $serverHost
        || preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/', $host)
        || strpos($origin, 'androidplatform.net') !== false;
    if ($isLocalOrLan) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    }
} else {
    header("Access-Control-Allow-Origin: *");
}

header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$NICOTINE_HOST = '127.0.0.1';
$NICOTINE_PORT = 12339;
$NICOTINE_BASE_URL = "http://$NICOTINE_HOST:$NICOTINE_PORT";

function get_project_downloads_dir() {
    $projectDir = realpath(__DIR__ . '/../../');
    $localDownloads = $projectDir . '/downloads';
    if (!is_dir($localDownloads)) {
        @mkdir($localDownloads, 0750, true);
    }
    return $localDownloads;
}

$DOWNLOADS_DIR = get_project_downloads_dir();

@require_once(__DIR__ . '/../database.php');

function get_soulseek_secret_key() {
    $keyFile = __DIR__ . '/../../data/.auth_secret';
    $read = function () use ($keyFile) {
        if (is_file($keyFile) && filesize($keyFile) >= 32) {
            $k = @file_get_contents($keyFile);
            if ($k !== false && strlen($k) >= 32) return substr($k, 0, 32);
        }
        return null;
    };
    if (($k = $read()) !== null) return $k;

    $dir = dirname($keyFile);
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $entropy = random_bytes(32);
    $old = umask(0177);
    $fh = @fopen($keyFile, 'x');
    umask($old);
    if ($fh) {
        fwrite($fh, $entropy);
        fflush($fh);
        fclose($fh);
        @chmod($keyFile, 0600);
        return $entropy;
    }
    for ($i = 0; $i < 20; $i++) {
        if (($k = $read()) !== null) return $k;
        usleep(25000);
    }
    return $entropy;
}

function is_safe_soulseek_directory($dir) {
    if (!is_string($dir) || empty(trim($dir))) return false;
    $trimmed = trim($dir);
    if (strpos($trimmed, "\0") !== false || strpos($trimmed, '..') !== false) return false;
    $disallowed = ['/etc', '/bin', '/sbin', '/usr', '/var', '/sys', '/proc', '/dev', '/boot', '/root'];
    $normalized = rtrim(str_replace('\\', '/', $trimmed), '/');
    if ($normalized === '' || $normalized === '/') return false;
    foreach ($disallowed as $bad) {
        if ($normalized === $bad || strpos($normalized, $bad . '/') === 0) return false;
    }
    $userHome = getenv('HOME') ?: ($_SERVER['HOME'] ?? '');
    if (empty($userHome) && function_exists('posix_getpwuid') && function_exists('posix_getuid')) {
        $pw = @posix_getpwuid(posix_getuid());
        $userHome = $pw['dir'] ?? '';
    }
    $projectRoot = realpath(__DIR__ . '/../../');
    $safeRoots = array_filter([$userHome, $projectRoot, '/mnt', '/media', '/run/media', '/storage', '/sdcard', '/data']);
    $real = realpath($trimmed);
    if ($real !== false) {
        foreach ($safeRoots as $root) {
            $rootNorm = rtrim($root, '/');
            if ($real === $rootNorm || strpos($real, $rootNorm . '/') === 0) return true;
        }
        return false;
    }
    $parent = dirname($trimmed);
    $realParent = realpath($parent);
    if ($realParent !== false) {
        foreach ($safeRoots as $root) {
            $rootNorm = rtrim($root, '/');
            if ($realParent === $rootNorm || strpos($realParent, $rootNorm . '/') === 0) return true;
        }
    }
    return false;
}

function sanitize_soulseek_directory($candidate, $fallback) {
    if (!empty($candidate) && is_safe_soulseek_directory($candidate)) {
        return $candidate;
    }
    return $fallback;
}

function encrypt_soulseek_secret($plainText) {
    if (empty($plainText)) return '';
    $key = get_soulseek_secret_key();
    $iv = openssl_random_pseudo_bytes(16);
    $cipherText = openssl_encrypt($plainText, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
    return base64_encode($iv . $cipherText);
}

function decrypt_soulseek_secret($encryptedBase64) {
    if (empty($encryptedBase64)) return '';
    $raw = base64_decode($encryptedBase64);
    if (strlen($raw) <= 16) return '';
    $iv = substr($raw, 0, 16);
    $cipherText = substr($raw, 16);
    
    // 1. Try local machine secret key
    $key = get_soulseek_secret_key();
    $decrypted = openssl_decrypt($cipherText, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);
    if ($decrypted !== false && !empty($decrypted)) {
        return $decrypted;
    }
    
    // 2. Legacy salt fallback for existing saved credentials
    $legacyKey = hash('sha256', 'CachyMusic-Soulseek-Secret-Salt-9942', true);
    $legacyDecrypted = openssl_decrypt($cipherText, 'aes-256-cbc', $legacyKey, OPENSSL_RAW_DATA, $iv);
    return $legacyDecrypted ?: '';
}

function get_db_soulseek_account() {
    return Storage::getSoulseekAccount();
}

$action = $_GET['action'] ?? $_POST['action'] ?? 'status';

function ensure_standalone_service_running() {
    global $NICOTINE_BASE_URL;
    $health = @call_nicotine_api('GET', '/health', null, 1);
    if ($health['ok']) return true;

    // 1. Standardize on Nicotine+ headless daemon
    $hasNicotine = !empty(shell_exec('which nicotine 2>/dev/null'));
    if ($hasNicotine) {
        // Ensure Nicotine client is disconnected by default on startup
        $userHome = getenv('HOME') ?: (isset($_SERVER['HOME']) ? $_SERVER['HOME'] : (function_exists('posix_getpwuid') ? (posix_getpwuid(posix_getuid())['dir'] ?? '') : ''));
        $nicoCfg = ($userHome ? $userHome : sys_get_temp_dir()) . '/.config/nicotine/config';
        if (file_exists($nicoCfg)) {
            $cfgContent = @file_get_contents($nicoCfg);
            if ($cfgContent !== false && strpos($cfgContent, 'auto_connect_startup = True') !== false) {
                $cfgContent = preg_replace('/auto_connect_startup\s*=\s*True/', 'auto_connect_startup = False', $cfgContent);
                @file_put_contents($nicoCfg, $cfgContent);
            }
        }
        @shell_exec("setsid -f nicotine -n < /dev/null > /tmp/nicotine-daemon.log 2>&1 &");
        for ($i = 0; $i < 15; $i++) {
            usleep(200000);
            $check = @call_nicotine_api('GET', '/health', null, 1);
            if ($check['ok']) return true;
        }
    }

    // 2. Fallback to legacy Node.js Soulseek microservice if nicotine binary is absent
    $projectDir = realpath(__DIR__ . '/../../');
    $serviceScript = $projectDir . '/server/soulseek-service.js';
    if (file_exists($serviceScript)) {
        @shell_exec("setsid -f node " . escapeshellarg($serviceScript) . " < /dev/null > /tmp/soulseek-node.log 2>&1 &");
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

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);

    $headers = ['Content-Type: application/json'];

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
        $dbHasPassword = !empty($dbAcc['password']);
        $dbPoweredOn = !empty($dbAcc['is_powered_on']);

        // Only auto-start the service on passive status poll if user previously left Soulseek powered on
        if ($dbPoweredOn) {
            ensure_standalone_service_running();
        }

        $statusRes = call_nicotine_api('GET', '/status', null, 2);
        $statusData = $statusRes['ok'] ? ($statusRes['data'] ?? []) : [];
        $connected = !empty($statusData['connected']);
        $connecting = !empty($statusData['connecting']);

        $isPowered = ($connected || $connecting || $dbPoweredOn);
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
        $activeShareDir = is_safe_soulseek_directory($nicShareDir)
            ? $nicShareDir
            : (is_safe_soulseek_directory($dbShareDir) ? $dbShareDir : $DOWNLOADS_DIR);

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
            'client' => 'nicotine-plus',
            'connected' => $connected,
            'connecting' => $connecting,
            'powered_on' => $isPowered,
            'has_credentials' => (!empty($dbUser) && $dbHasPassword) || ($loginUser !== 'Not configured' && $loginUser !== 'Not logged in'),
            'login_username' => $loginUser,
            'login_status' => $connected ? 2 : ($connecting ? 1 : 0),
            'uploads_total' => $statusData['uploads_total'] ?? 0,
            'downloads_total' => $statusData['downloads_total'] ?? 0,
            'downloads_dir' => $activeDownDir,
            'shared_dir' => $activeShareDir,
            'standalone' => false,
            'nicotine' => true,
            'error' => $statusData['error'] ?? null,
            'raw' => $statusData
        ]);
        exit;

    case 'start_daemon':
        $started = ensure_standalone_service_running();
        echo json_encode([
            'ok' => $started,
            'daemon_running' => $started,
            'client' => 'nicotine-plus',
            'message' => $started ? 'Nicotine+ service is running.' : 'Could not launch Nicotine+ service.'
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
            Storage::saveSoulseekAccount($curAcc);
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

            $username = !empty($dbAcc['username']) ? $dbAcc['username'] : $nicUser;
            $plainPassword = '';

            if (!empty($dbAcc['password'])) {
                $plainPassword = decrypt_soulseek_secret($dbAcc['password']);
            }

            if (empty($plainPassword) && !$nicHasPass && empty($username)) {
                echo json_encode([
                    'ok' => false,
                    'powered_on' => false,
                    'error' => 'No Soulseek credentials found. Please configure username and password in Settings.'
                ]);
                exit;
            }

            $safeDown = sanitize_soulseek_directory($dbAcc['downloads_dir'] ?? '', $DOWNLOADS_DIR);
            $safeShare = sanitize_soulseek_directory($dbAcc['shared_dir'] ?? '', $DOWNLOADS_DIR);
            call_nicotine_api('POST', '/directory', ['directory' => $safeDown]);
            call_nicotine_api('POST', '/shared_directory', ['directory' => $safeShare]);

            $powerPayload = ['state' => 'on'];
            if (!empty($username)) $powerPayload['username'] = $username;
            if (!empty($plainPassword)) $powerPayload['password'] = $plainPassword;

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
            Storage::saveSoulseekAccount($curAcc);

            echo json_encode([
                'ok' => true,
                'powered_on' => true,
                'connected' => true,
                'username' => $username,
                'message' => 'Connected to Soulseek network via Nicotine+!'
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
            $hasPass = !empty($dbAcc['password']) || !empty($nicData['hasPassword']);
            $nicDown = $nicData['downloads_dir'] ?? '';
            $dbDown = $dbAcc['downloads_dir'] ?? '';
            $downDir = is_safe_soulseek_directory($nicDown)
                ? $nicDown
                : (is_safe_soulseek_directory($dbDown) ? $dbDown : $DOWNLOADS_DIR);

            $nicShare = $nicData['shared_dir'] ?? '';
            $dbShare = $dbAcc['shared_dir'] ?? '';
            $shareDir = is_safe_soulseek_directory($nicShare)
                ? $nicShare
                : (is_safe_soulseek_directory($dbShare) ? $dbShare : $DOWNLOADS_DIR);

            echo json_encode([
                'ok' => true,
                'username' => $uname,
                'hasPassword' => $hasPass,
                'is_powered_on' => !empty($dbAcc['is_powered_on']) || !empty($nicData['powered_on']),
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
            $sharedDir = $downloadsDir ?: $DOWNLOADS_DIR;
        }

        $dbAcc = get_db_soulseek_account();
        $plainPassword = $password;
        $encPassword = '';

        if (empty($password)) {
            if (!empty($dbAcc['password']) && !empty($username) && $username === ($dbAcc['username'] ?? '')) {
                $plainPassword = decrypt_soulseek_secret($dbAcc['password']);
                $encPassword = $dbAcc['password'];
            } else {
                echo json_encode(['ok' => false, 'error' => 'Username and password are required.']);
                exit;
            }
        } else {
            $encPassword = encrypt_soulseek_secret($password);
            $plainPassword = $password;
        }

        $curDown = sanitize_soulseek_directory($downloadsDir ?: ($dbAcc['downloads_dir'] ?? ''), $DOWNLOADS_DIR);
        $curShare = sanitize_soulseek_directory($sharedDir ?: ($dbAcc['shared_dir'] ?? ''), $curDown);

        Storage::saveSoulseekAccount([
            'username' => $username,
            'password' => $encPassword,
            'is_powered_on' => 1,
            'downloads_dir' => $curDown,
            'shared_dir' => $curShare
        ]);

        $serviceUp = ensure_standalone_service_running();
        if (!$serviceUp) {
            $curAcc = Storage::getSoulseekAccount();
            $curAcc['is_powered_on'] = 0;
            Storage::saveSoulseekAccount($curAcc);
            echo json_encode([
                'ok' => false,
                'powered_on' => false,
                'error' => 'Soulseek daemon is offline (port 12339). Nicotine+ background service is not running on the host machine.',
                'reason' => 'daemon_offline'
            ]);
            exit;
        }

        if (!empty($curDown)) call_nicotine_api('POST', '/directory', ['directory' => $curDown]);
        if (!empty($curShare)) call_nicotine_api('POST', '/shared_directory', ['directory' => $curShare]);

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
            'message' => 'Credentials saved in database and connected!'
        ]);
        exit;

    case 'logout':
        ensure_standalone_service_running();
        call_nicotine_api('POST', '/logout');
        $curAcc = Storage::getSoulseekAccount();
        $curAcc['username'] = '';
        $curAcc['password'] = '';
        $curAcc['is_powered_on'] = 0;
        Storage::saveSoulseekAccount($curAcc);
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
            Storage::saveSoulseekAccount($curAcc);
            call_nicotine_api('POST', '/directory', ['directory' => $newDir]);
        } else {
            $newDir = $DOWNLOADS_DIR;
        }
        echo json_encode(['ok' => true, 'downloads_dir' => $newDir]);
        exit;

    case 'shared_directory':
    case 'config/shared_directory':
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? $_POST;
        $newDir = trim($input['directory'] ?? $input['shared_dir'] ?? '');
        if (!empty($newDir)) {
            if (!is_safe_soulseek_directory($newDir)) {
                $newDir = $DOWNLOADS_DIR;
            }
            $curAcc = Storage::getSoulseekAccount();
            $curAcc['shared_dir'] = $newDir;
            Storage::saveSoulseekAccount($curAcc);
            call_nicotine_api('POST', '/shared_directory', ['directory' => $newDir]);
        } else {
            $newDir = $DOWNLOADS_DIR;
        }
        echo json_encode(['ok' => true, 'shared_dir' => $newDir]);
        exit;

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

            // Calculate bitrate from size and duration if attribute is missing
            if (($bitrate === null || $bitrate <= 0) && $sizeBytes > 0 && $duration > 0) {
                $calcBitrate = (int)round(($sizeBytes * 8) / ($duration * 1000));
                if ($calcBitrate > 0 && $calcBitrate <= 9216) {
                    $bitrate = $calcBitrate;
                }
            }

            // Fallback: parse bitrate markers from file name or path (e.g. 320kbps, [320], 256k)
            if ($bitrate === null || $bitrate <= 0) {
                if (preg_match('/\b(320|256|224|192|160|128|96|64)\s*(?:kbps|k)?\b/i', $normalizedPath, $m)) {
                    $bitrate = (int)$m[1];
                } elseif (preg_match('/\bV0\b/i', $normalizedPath)) {
                    $bitrate = 245;
                } elseif (preg_match('/\bV2\b/i', $normalizedPath)) {
                    $bitrate = 190;
                }
            }

            // For lossless without calculated bitrate, set 1411 (Standard CD 16-bit 44.1kHz)
            if ($isLossless && ($bitrate === null || $bitrate <= 0)) {
                $bitrate = 1411;
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
            'data' => $res['data']
        ]);
        exit;

    case 'pause_download':
        $raw   = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? [];
        $res   = call_nicotine_api('POST', '/downloads/abort', [
            'username'     => $input['username']     ?? '',
            'virtual_path' => $input['virtual_path'] ?? '',
            'status'       => 'Paused',
        ]);
        echo json_encode(['ok' => $res['ok'], 'data' => $res['data'] ?? null, 'error' => $res['data']['error'] ?? $res['error'] ?? null]);
        exit;

    case 'cancel_download':
        $raw   = file_get_contents('php://input');
        $input = json_decode($raw, true) ?? [];

        // First abort it as Cancelled, then clear it from the list
        call_nicotine_api('POST', '/downloads/abort', [
            'username'     => $input['username']     ?? '',
            'virtual_path' => $input['virtual_path'] ?? '',
            'status'       => 'Cancelled',
        ]);
        $res = call_nicotine_api('POST', '/downloads/clear', [
            'username'     => $input['username']     ?? '',
            'virtual_path' => $input['virtual_path'] ?? '',
        ]);
        echo json_encode(['ok' => true, 'cleared' => $res['ok']]);
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

        Storage::beginBatch();
        foreach ($items as $item) {
            $virtPath = $item['virtual_path'] ?? '';
            $norm = str_replace('\\', '/', $virtPath);
            $fn = !empty($item['filename']) ? $item['filename'] : basename($norm);
            $status = $item['status'] ?? 'Unknown';
            $progress = round((float)($item['progress_pct'] ?? 0), 1);

            // Compute local target file path
            $folder = !empty($item['folder_path']) ? $item['folder_path'] : $DOWNLOADS_DIR;
            $targetLocalFile = !empty($item['local_file']) ? $item['local_file'] : ($folder . '/' . $fn);
            if (!file_exists($targetLocalFile) && file_exists($DOWNLOADS_DIR . '/' . $fn)) {
                $targetLocalFile = $DOWNLOADS_DIR . '/' . $fn;
            }
            $fileExists = file_exists($targetLocalFile);
            $isFin = ($status === 'Finished') || ($progress >= 100 && $fileExists && !in_array($status, ['Paused', 'Cancelled']));

            // Instant Auto-Indexing: automatically index completed single audio download into library in <20ms
            if ($isFin && $fileExists) {
                $ext = strtolower(pathinfo($targetLocalFile, PATHINFO_EXTENSION));
                if (in_array($ext, ['mp3', 'flac', 'm4a', 'wav', 'ogg', 'aac', 'opus'])) {
                    @require_once(__DIR__ . '/scan.php');
                    if (function_exists('extract_actual_audio_metadata')) {
                        $meta = extract_actual_audio_metadata($targetLocalFile, $ext, filesize($targetLocalFile));
                        Storage::upsertTrack([
                            'file_path' => $fn,
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
                            'file_size' => filesize($targetLocalFile),
                            'mtime' => filemtime($targetLocalFile),
                            'has_cover' => !empty($meta['hasCover']),
                            'lyrics' => $meta['lyrics'] ?? null,
                            'replay_gain' => $meta['replayGain'] ?? null,
                            'replay_peak' => $meta['replayPeak'] ?? null
                        ]);
                    }
                }
            }

            $partFile = !empty($item['part_file']) ? $item['part_file'] : ($targetLocalFile . '.part');
            $partExists = file_exists($partFile);
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
        Storage::commitBatch();

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

        if (class_exists('Storage')) {
            Storage::upsertTrack([
                'file_path' => $filename,
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

        // Upsert to DB if connection exists
        $tid = null;
        if (isset($connection) && $connection && !mysqli_connect_errno()) {
            $stmt = $connection->prepare("INSERT INTO Tracks (file_path) VALUES (?) ON DUPLICATE KEY UPDATE tid = LAST_INSERT_ID(tid)");
            if ($stmt) {
                $stmt->bind_param("s", $filename);
                $stmt->execute();
                $tid = $connection->insert_id;
            }
        }

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
            'src' => 'php/api/stream.php?path=' . urlencode($realPath)
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
