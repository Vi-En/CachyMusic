<?php
// CachyMusic - Linux Hardware Analog Gain Bridge (PipeWire / PulseAudio / ALSA)
// Controls the OS default sink/mixer, not verified hardware DAC gain.
require_once(__DIR__ . "/../platform.php");
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

    $wpctl = cachy_find_binary('wpctl');
    $pactl = cachy_find_binary('pactl');
    $amixer = cachy_find_binary('amixer');
    if ($wpctl && preg_match('/Volume:\s*[0-9.]+/i', cachy_run_args([$wpctl,'get-volume','@DEFAULT_AUDIO_SINK@'], 65536, 3) ?? '')) {
        $backend = 'pipewire';
    } elseif ($pactl && preg_match('/\d+%/', cachy_run_args([$pactl,'get-sink-volume','@DEFAULT_SINK@'], 65536, 3) ?? '')) {
        $backend = 'pulseaudio';
    } elseif ($amixer && preg_match('/\[\d+%\]/', cachy_run_args([$amixer,'sget',detect_alsa_control()], 65536, 3) ?? '')) {
        $backend = 'alsa';
    } else {
        $backend = 'none';
    }
    return $backend;
}

function detect_alsa_control() {
    $out = cachy_run_binary('amixer', ['scontrols']);
    if ($out) {
        foreach (['Master', 'PCM', 'Headphone', 'Speaker', 'DAC', 'Digital'] as $cand) {
            if (stripos($out, "Simple mixer control '{$cand}'") !== false) {
                return $cand;
            }
        }
        if (preg_match("/Simple mixer control '([^']+)'/", $out, $m)) {
            return $m[1];
        }
    }
    return 'Master';
}

function detect_connected_audio_devices() {
    $activeDevice = 'Default Audio Sink';
    $isExternalDac = false;
    $devices = [];

    if (strtoupper(substr(PHP_OS, 0, 3)) !== 'WIN' && PHP_OS !== 'Darwin') {
        if (cachy_find_binary('wpctl') !== null) {
            $inspect = cachy_run_binary('wpctl', ['inspect','@DEFAULT_AUDIO_SINK@']);
            if ($inspect) {
                if (preg_match('/node\.description\s*=\s*"([^"]+)"/i', $inspect, $m)
                    || preg_match('/device\.description\s*=\s*"([^"]+)"/i', $inspect, $m)
                    || preg_match('/node\.nick\s*=\s*"([^"]+)"/i', $inspect, $m)) {
                    $activeDevice = trim($m[1]);
                }
                if (preg_match('/(usb|dac|iem|moondrop|may|dongle|fiio|topping|schiit|chord|headphone|earphone|bluetooth|bluez|hdmi|displayport|external|speaker)/i', $inspect . ' ' . $activeDevice)) {
                    $isExternalDac = true;
                }
                if ($activeDevice !== 'Default Audio Sink') {
                    $devices[] = [
                        'name' => $activeDevice,
                        'isExternalDac' => $isExternalDac,
                        'backend' => 'pipewire'
                    ];
                }
            }
        } elseif (cachy_find_binary('pactl') !== null) {
            $defaultSink = trim((string)cachy_run_binary('pactl', ['get-default-sink']));
            $sinksOut = cachy_run_binary('pactl', ['list','sinks']);
            if ($sinksOut && preg_match_all('/Name:\s*([^\n]+).*?Description:\s*([^\n]+)/is', $sinksOut, $matches, PREG_SET_ORDER)) {
                foreach ($matches as $row) {
                    $sinkName = trim($row[1]);
                    $sinkDesc = trim($row[2]);
                    $ext = (bool)preg_match('/(usb|dac|iem|moondrop|may|dongle|fiio|topping|headphone|earphone|bluez|bluetooth|external|hdmi)/i', $sinkName . ' ' . $sinkDesc);
                    $devices[] = ['name' => $sinkDesc, 'sink' => $sinkName, 'isExternalDac' => $ext, 'backend' => 'pulseaudio'];
                    if ($sinkName === $defaultSink || ($activeDevice === 'Default Audio Sink' && $ext)) {
                        $activeDevice = $sinkDesc;
                        $isExternalDac = $ext;
                    }
                }
            }
        }
        if (is_readable('/proc/asound/cards')) {
            $cards = @file_get_contents('/proc/asound/cards');
            if ($cards && preg_match_all('/^\s*\d+\s+\[[^\]]+\]:\s*USB-Audio\s*-\s*([^\n]+)/mi', $cards, $usbMatches)) {
                foreach ($usbMatches[1] as $cardName) {
                    $cleanName = trim($cardName);
                    $isExternalDac = true;
                    if ($activeDevice === 'Default Audio Sink') {
                        $activeDevice = $cleanName;
                    }
                    $devices[] = ['name' => $cleanName, 'category' => 'usb-dac', 'isExternalDac' => true, 'backend' => 'alsa-usb'];
                }
            }
        }
    }

    return [
        'activeDevice' => $activeDevice,
        'isExternalDac' => $isExternalDac,
        'devices' => $devices
    ];
}

function get_hardware_volume() {
    $backend = detect_hardware_backend();
    $volume = 1.0;
    $muted = false;
    $valid = false;

    if ($backend === 'pipewire') {
        $out = cachy_run_binary('wpctl', ['get-volume','@DEFAULT_AUDIO_SINK@']);
        if ($out) {
            // Output example: "Volume: 0.80" or "Volume: 0.80 [MUTED]"
            if (preg_match('/Volume:\s+([0-9\.]+)/i', $out, $m)) {
                $volume = (float)$m[1]; $valid = is_finite($volume);
            }
            if (stripos($out, '[MUTED]') !== false) {
                $muted = true;
            }
        }
    } elseif ($backend === 'pulseaudio') {
        $out = cachy_run_binary('pactl', ['get-sink-volume','@DEFAULT_SINK@']);
        if ($out && preg_match('/(\d+)%/i', $out, $m)) {
            $volume = (float)$m[1] / 100.0; $valid = is_finite($volume);
        }
        $muteOut = cachy_run_binary('pactl', ['get-sink-mute','@DEFAULT_SINK@']);
        if ($muteOut && stripos($muteOut, 'yes') !== false) {
            $muted = true;
        }
    } elseif ($backend === 'alsa') {
        $out = cachy_run_binary('amixer', ['sget',detect_alsa_control()]);
        if ($out && preg_match('/\[(\d+)%\]/i', $out, $m)) {
            $volume = (float)$m[1] / 100.0; $valid = is_finite($volume);
        }
        if ($out && stripos($out, '[off]') !== false) {
            $muted = true;
        }
    }

    $devInfo = detect_connected_audio_devices();

    return [
        'available'     => $valid && in_array($backend, ['pipewire', 'pulseaudio', 'alsa'], true),
        'backend'       => $backend,
        'volume'        => max(0.0, min(1.5, round($volume, 3))),
        'muted'         => $muted,
        'activeDevice'  => $devInfo['activeDevice'],
        'isExternalDac' => $devInfo['isExternalDac'],
        'devices'       => $devInfo['devices']
    ];
}

function set_hardware_volume($vol) {
    $backend = detect_hardware_backend();
    $vol = max(0.0, min(1.5, (float)$vol)); // Allow up to +3.5dB headroom (1.5), safely clamped

    $pct = (int)round($vol * 100);
    if ($backend === 'pipewire') return cachy_run_binary('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', number_format($vol, 2, '.', '')]) !== null;
    if ($backend === 'pulseaudio') return cachy_run_binary('pactl', ['set-sink-volume', '@DEFAULT_SINK@', $pct.'%']) !== null;
    if ($backend === 'alsa') return cachy_run_binary('amixer', ['sset', detect_alsa_control(), min(100,$pct).'%']) !== null;
    return false;
}

function toggle_hardware_mute($muteState = null) {
    $backend = detect_hardware_backend();
    $value = $muteState === null ? 'toggle' : ($muteState ? '1' : '0');
    if ($backend === 'pipewire') return cachy_run_binary('wpctl', ['set-mute','@DEFAULT_AUDIO_SINK@',$value]) !== null;
    if ($backend === 'pulseaudio') return cachy_run_binary('pactl', ['set-mute','@DEFAULT_SINK@',$value]) !== null;
    if ($backend === 'alsa') return cachy_run_binary('amixer', ['sset',detect_alsa_control(),$muteState === null ? 'toggle' : ($muteState ? 'mute' : 'unmute')]) !== null;
    return false;
}

function mixer_error(int $code, string $message): void {
    http_response_code($code); echo json_encode(['success'=>false,'message'=>$message]); exit;
}
header('Cache-Control: private, no-store');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET','POST'], true)) mixer_error(405, 'Method not allowed');
$rawInput = file_get_contents('php://input', false, null, 0, 8193);
if ($rawInput === false || strlen($rawInput) > 8192) mixer_error(413, 'Request too large');
$json = $rawInput === '' ? [] : json_decode($rawInput, true);
if (!is_array($json)) mixer_error(400, 'Invalid request');
$action = $_GET['action'] ?? $_POST['action'] ?? $json['action'] ?? 'get_volume';

if (!is_string($action)) mixer_error(400, 'Invalid action');
if (in_array($action, ['set_volume','toggle_mute'], true) && $method !== 'POST') mixer_error(405, 'POST required');
switch ($action) {
    case 'status':
    case 'get_volume':
        $st = get_hardware_volume();
        echo json_encode(array_merge(['success' => true], $st), JSON_UNESCAPED_SLASHES);
        break;

    case 'set_volume':
        $vol = $json['volume'] ?? $_POST['volume'] ?? $_GET['volume'] ?? null;
        if ($vol === null || !is_numeric($vol) || !is_finite((float)$vol) || (float)$vol < 0 || (float)$vol > 1.5) {
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
        if ($muteParam !== null && !is_bool($muteParam) && !in_array($muteParam, [0,1,'0','1','true','false'], true)) mixer_error(400, 'Invalid mute value');
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
