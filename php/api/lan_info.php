<?php
// Local capability discovery: no LAN probing or fabricated remote URL.
require_once(__DIR__ . '/../platform.php');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode([
    'success' => true,
    'lanUrl' => null,
    'osFamily' => cachy_os_family(),
    'mprisBridge' => getenv('CACHYMUSIC_MPRIS_ACTIVE') === '1',
    'hardwareGain' => cachy_os_family() === 'linux' && (bool)(cachy_find_binary('wpctl') ?: cachy_find_binary('pactl') ?: cachy_find_binary('amixer')),
]);
