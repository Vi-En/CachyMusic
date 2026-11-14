<?php
// CachyMusic - Local Network Streaming Info Resolver
// Detects active Wi-Fi / Ethernet LAN IP address for lossless multi-device streaming
require_once(__DIR__ . '/../platform.php');
header('Content-Type: application/json; charset=utf-8');
cachy_send_local_cors('GET, OPTIONS', true);

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$port = (int)($_SERVER['SERVER_PORT'] ?? 8000);
if ($port <= 0 || $port > 65535) $port = 8000;

$lanIp = '';

// Method 1: Linux ip route query (most accurate for active gateway interface)
if (strtoupper(substr(PHP_OS, 0, 3)) !== 'WIN') {
    $ipRoute = @shell_exec("ip route get 1.1.1.1 2>/dev/null");
    if ($ipRoute && preg_match('/src\s+([0-9\.]+)/', $ipRoute, $m)) {
        $candidate = trim($m[1]);
        if (filter_var($candidate, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $lanIp = $candidate;
        }
    }

    // Method 2: hostname -I fallback
    if (empty($lanIp)) {
        $ipOut = @shell_exec("hostname -I 2>/dev/null");
        if ($ipOut) {
            $ips = preg_split('/\s+/', trim($ipOut));
            foreach ($ips as $ip) {
                if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && $ip !== '127.0.0.1' && !str_starts_with($ip, '169.254.')) {
                    $lanIp = $ip;
                    break;
                }
            }
        }
    }
} else {
    // Windows ipconfig parsing
    $ipConfig = @shell_exec("ipconfig 2>NUL");
    if ($ipConfig && preg_match_all('/IPv4 Address[^\:]*:\s*([0-9\.]+)/i', $ipConfig, $matches)) {
        foreach ($matches[1] as $ip) {
            $ip = trim($ip);
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && $ip !== '127.0.0.1') {
                $lanIp = $ip;
                break;
            }
        }
    }
}

// Fallback to server address
if (empty($lanIp)) {
    $lanIp = $_SERVER['SERVER_ADDR'] ?? '127.0.0.1';
    if ($lanIp === '0.0.0.0' || $lanIp === '::' || $lanIp === '::1') {
        $lanIp = '127.0.0.1';
    }
}

$lanUrl = "http://{$lanIp}:{$port}";

echo json_encode([
    'success'  => true,
    'lanIp'    => $lanIp,
    'port'     => $port,
    'lanUrl'   => $lanUrl,
    'osFamily' => strtolower(PHP_OS_FAMILY)
], JSON_UNESCAPED_SLASHES);
exit;
