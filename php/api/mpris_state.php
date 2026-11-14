<?php
// CachyMusic - Linux MPRIS2 Bridge State Store
// Bridges browser/PWA state with native Linux D-Bus player controls
header('Content-Type: application/json; charset=utf-8');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $host = parse_url($origin, PHP_URL_HOST) ?: '';
    if (in_array(strtolower($host), ['localhost', '127.0.0.1', '::1', '[::1]'], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function mpris_atomic_write(string $path, string $content): bool {
    $dir = dirname($path);
    $tmp = @tempnam($dir, '.mpris_');
    if ($tmp === false) {
        return @file_put_contents($path, $content, LOCK_EX) !== false;
    }
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) {
        @unlink($tmp);
        return false;
    }
    @chmod($tmp, 0644);
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        return false;
    }
    return true;
}

$stateDir = getenv('XDG_STATE_HOME') ?: ((getenv('HOME') ?: sys_get_temp_dir()) . '/.local/state');
$cachyStateDir = rtrim($stateDir, '/\\') . '/cachymusic';
if (!is_dir($cachyStateDir)) {
    @mkdir($cachyStateDir, 0755, true);
}

$stateFile = $cachyStateDir . '/mpris_player_state.json';
$cmdFile = $cachyStateDir . '/mpris_pending_command.json';
$artCacheFile = $cachyStateDir . '/current_cover.jpg';

$action = $_GET['action'] ?? $_POST['action'] ?? 'get_state';

switch ($action) {
    case 'update_state':
        // Web player pushes current playback metadata
        $raw = file_get_contents('php://input');
        $json = json_decode($raw ?: '', true);
        if (is_array($json)) {
            $json['updated_at'] = microtime(true);
            $artUrl = (string)($json['artUrl'] ?? '');
            if (strpos($artUrl, 'data:image/') === 0 && strpos($artUrl, ';base64,') !== false) {
                $parts = explode(';base64,', $artUrl, 2);
                $decoded = base64_decode($parts[1] ?? '', true);
                if ($decoded !== false && strlen($decoded) > 32) {
                    mpris_atomic_write($artCacheFile, $decoded);
                    $json['artFileUrl'] = 'file://' . $artCacheFile . '?v=' . md5($decoded);
                }
            } elseif ($artUrl !== '' && strpos($artUrl, 'file://') === 0) {
                $json['artFileUrl'] = $artUrl;
            } elseif ($artUrl !== '') {
                $json['artFileUrl'] = $artUrl;
            } else {
                $json['artFileUrl'] = '';
            }
            mpris_atomic_write($stateFile, (string)json_encode($json, JSON_UNESCAPED_SLASHES));
            echo json_encode(['success' => true]);
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid JSON payload']);
        }
        break;

    case 'get_state':
        // MPRIS daemon queries current state
        if (file_exists($stateFile)) {
            $raw = @file_get_contents($stateFile);
            echo $raw ?: json_encode(['status' => 'Stopped', 'title' => '', 'position' => 0]);
        } else {
            echo json_encode(['status' => 'Stopped', 'title' => 'CachyMusic', 'position' => 0]);
        }
        break;

    case 'send_command':
        // MPRIS daemon pushes user interaction (Play, Pause, Next, Prev, Seek, Shuffle, LoopStatus)
        $raw = file_get_contents('php://input');
        $json = json_decode($raw ?: '', true);
        if (is_array($json) && !empty($json['command'])) {
            $json['timestamp'] = microtime(true);
            mpris_atomic_write($cmdFile, (string)json_encode($json, JSON_UNESCAPED_SLASHES));
            echo json_encode(['success' => true]);
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid command']);
        }
        break;

    case 'get_command':
        // Web player polls for pending hardware/desktop commands
        if (file_exists($cmdFile)) {
            $raw = @file_get_contents($cmdFile);
            @unlink($cmdFile);
            echo $raw ?: json_encode(['command' => null]);
        } else {
            echo json_encode(['command' => null]);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unknown action']);
        break;
}
exit;
