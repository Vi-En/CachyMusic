<?php
// The router's loopback and origin checks apply to this endpoint as well.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(['app' => 'CachyMusic', 'instance' => getenv('CACHYMUSIC_LAUNCH_INSTANCE') ?: 'unmanaged']);
