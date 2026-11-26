<?php
require_once(__DIR__ . '/../platform.php');
header('Content-Type: application/json; charset=utf-8');
cachy_send_local_cors('GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') { http_response_code(405); echo json_encode(['success'=>false,'message'=>'POST required']); exit; }
$raw = file_get_contents('php://input', false, null, 0, 16385);
if ($raw === false || strlen($raw) > 16384) { http_response_code(413); echo json_encode(['success'=>false,'message'=>'Request too large']); exit; }
$input = $raw === '' ? [] : json_decode($raw, true);
$initial = is_array($input) ? ($input['initialDir'] ?? '') : null;
if (!is_string($initial) || strlen($initial) > 4096 || strpos($initial, "\0") !== false) { http_response_code(400); echo json_encode(['success'=>false,'message'=>'Invalid directory']); exit; }
$initialDir = trim($initial);

require_once __DIR__.'/../database.php';
require_once __DIR__.'/../folder_picker.php';
require_once __DIR__.'/../scan_jobs.php';
if (CachyScanJob::session()!==null) { http_response_code(409); echo json_encode(['success'=>false,'message'=>'Use the managed folder picker; reload the client.']); exit; }
header('Cache-Control: private, no-store');
echo json_encode(cm_choose_folder($initialDir),JSON_INVALID_UTF8_SUBSTITUTE);
