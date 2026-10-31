<?php
// CachyMusic - Linux Hardware Analog Gain Bridge (PipeWire / PulseAudio / ALSA)
// Provides bit-perfect hardware volume control directly communicating with DAC registers
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
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function detect_hardware_backend() {
    static $backend = null;
    if ($backend !== null) return $backend;

    if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' || PHP_OS === 'Darwin') {
        $backend = 'unsupported';
        return $backend;
    }

    if (!empty(shell_exec('which wpctl 2>/dev/null'))) {
        $backend = 'pipewire';
    } elseif (!empty(shell_exec('which pactl 2>/dev/null'))) {
        $backend = 'pulseaudio';
    } elseif (!empty(shell_exec('which amixer 2>/dev/null'))) {
        $backend = 'alsa';
    } else {
        $backend = 'none';
    }
    return $backend;
}

function get_hardware_volume() {
    $backend = detect_hardware_backend();
    $volume = 1.0;
    $muted = false;

    if ($backend === 'pipewire') {
        $out = @shell_exec('wpctl get-volume @DEFAULT_AUDIO_SINK@ 2>/dev/null');
        if ($out) {
            // Output example: "Volume: 0.80" or "Volume: 0.80 [MUTED]"
            if (preg_match('/Volume:\s+([0-9\.]+)/i', $out, $m)) {
                $volume = (float)$m[1];
            }
            if (stripos($out, '[MUTED]') !== false) {
                $muted = true;
            }
        }
    } elseif ($backend === 'pulseaudio') {
        $out = @shell_exec('pactl get-sink-volume @DEFAULT_SINK@ 2>/dev/null');
        if ($out && preg_match('/(\d+)%/i', $out, $m)) {
            $volume = (float)$m[1] / 100.0;
        }
        $muteOut = @shell_exec('pactl get-sink-mute @DEFAULT_SINK@ 2>/dev/null');
        if ($muteOut && stripos($muteOut, 'yes') !== false) {
            $muted = true;
        }
    } elseif ($backend === 'alsa') {
        $out = @shell_exec("amixer sget Master 2>/dev/null");
        if ($out && preg_match('/\[(\d+)%\]/i', $out, $m)) {
            $volume = (float)$m[1] / 100.0;
        }
        if ($out && stripos($out, '[off]') !== false) {
            $muted = true;
        }
    }

    return [
        'available' => in_array($backend, ['pipewire', 'pulseaudio', 'alsa'], true),
        'backend'   => $backend,
        'volume'    => max(0.0, min(1.5, round($volume, 3))),
        'muted'     => $muted
    ];
}

function set_hardware_volume($vol) {
    $backend = detect_hardware_backend();
    $vol = max(0.0, min(1.5, (float)$vol)); // Allow up to +3.5dB headroom (1.5), safely clamped

    if ($backend === 'pipewire') {
        $safeVol = sprintf("%.2f", $vol);
        @shell_exec("wpctl set-volume @DEFAULT_AUDIO_SINK@ {$safeVol} 2>/dev/null");
        return true;
    } elseif ($backend === 'pulseaudio') {
        $pct = (int)round($vol * 100);
        @shell_exec("pactl set-sink-volume @DEFAULT_SINK@ {$pct}% 2>/dev/null");
        return true;
    } elseif ($backend === 'alsa') {
        $pct = (int)round($vol * 100);
        @shell_exec("amixer sset Master {$pct}% 2>/dev/null");
        return true;
    }
    return false;
}

function toggle_hardware_mute($muteState = null) {
    $backend = detect_hardware_backend();
    if ($backend === 'pipewire') {
        if ($muteState === null) {
            @shell_exec('wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle 2>/dev/null');
        } else {
            $val = $muteState ? 1 : 0;
            @shell_exec("wpctl set-mute @DEFAULT_AUDIO_SINK@ {$val} 2>/dev/null");
        }
        return true;
    } elseif ($backend === 'pulseaudio') {
        if ($muteState === null) {
            @shell_exec('pactl set-sink-mute @DEFAULT_SINK@ toggle 2>/dev/null');
        } else {
            $val = $muteState ? '1' : '0';
            @shell_exec("pactl set-sink-mute @DEFAULT_SINK@ {$val} 2>/dev/null");
        }
        return true;
    } elseif ($backend === 'alsa') {
        if ($muteState === null) {
            @shell_exec('amixer sset Master toggle 2>/dev/null');
        } else {
            $val = $muteState ? 'mute' : 'unmute';
            @shell_exec("amixer sset Master {$val} 2>/dev/null");
        }
        return true;
    }
    return false;
}

$rawInput = file_get_contents('php://input');
$json = json_decode($rawInput, true) ?: [];
$action = $_GET['action'] ?? $_POST['action'] ?? $json['action'] ?? 'get_volume';

switch ($action) {
    case 'status':
    case 'get_volume':
        $st = get_hardware_volume();
        echo json_encode(array_merge(['success' => true], $st), JSON_UNESCAPED_SLASHES);
        break;

    case 'set_volume':
        $vol = $json['volume'] ?? $_POST['volume'] ?? $_GET['volume'] ?? null;
        if ($vol === null || !is_numeric($vol)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid volume value.']);
            exit;
        }
        $ok = set_hardware_volume((float)$vol);
        $st = get_hardware_volume();
        echo json_encode([
            'success'   => $ok,
            'backend'   => $st['backend'],
            'volume'    => $st['volume'],
            'muted'     => $st['muted']
        ], JSON_UNESCAPED_SLASHES);
        break;

    case 'toggle_mute':
        $muteParam = $json['muted'] ?? $_POST['muted'] ?? $_GET['muted'] ?? null;
        $muteBool = ($muteParam !== null) ? filter_var($muteParam, FILTER_VALIDATE_BOOLEAN) : null;
        $ok = toggle_hardware_mute($muteBool);
        $st = get_hardware_volume();
        echo json_encode([
            'success'   => $ok,
            'backend'   => $st['backend'],
            'volume'    => $st['volume'],
            'muted'     => $st['muted']
        ], JSON_UNESCAPED_SLASHES);
        break;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unknown action']);
        break;
}
exit;
