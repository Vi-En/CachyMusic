<?php
// CachyMusic - Linux MPRIS2 Bridge State Store
// Bridges browser/PWA state with native Linux D-Bus player controls
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$stateDir = getenv('XDG_STATE_HOME') ?: (getenv('HOME') . '/.local/state');
$cachyStateDir = rtrim($stateDir, '/') . '/cachymusic';
if (!is_dir($cachyStateDir)) {
    @mkdir($cachyStateDir, 0755, true);
}

$stateFile = $cachyStateDir . '/mpris_player_state.json';
$cmdFile = $cachyStateDir . '/mpris_pending_command.json';

$action = $_GET['action'] ?? $_POST['action'] ?? 'get_state';

switch ($action) {
    case 'update_state':
        // Web player pushes current playback metadata
        $raw = file_get_contents('php://input');
        $json = json_decode($raw, true);
        if (is_array($json)) {
            $json['updated_at'] = microtime(true);
            @file_put_contents($stateFile, json_encode($json, JSON_UNESCAPED_SLASHES));
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
        // MPRIS daemon pushes user interaction (Play, Pause, Next, Prev, Seek)
        $raw = file_get_contents('php://input');
        $json = json_decode($raw, true);
        if (is_array($json) && !empty($json['command'])) {
            $json['timestamp'] = microtime(true);
            @file_put_contents($cmdFile, json_encode($json, JSON_UNESCAPED_SLASHES));
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

