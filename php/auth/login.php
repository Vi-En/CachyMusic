<?php
if (session_status() === PHP_SESSION_NONE) {
    if (!headers_sent()) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'domain'   => '',
            'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
            'httponly' => true,
            'samesite' => 'Strict'
        ]);
    }
    session_start();
}

require_once(__DIR__ . '/../platform.php');
header('Content-Type: application/json; charset=utf-8');
cachy_send_local_cors('POST, OPTIONS');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once(__DIR__ . '/../database.php');

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid request payload.']);
    exit;
}

$username = trim($data['username'] ?? '');
$password = $data['password'] ?? '';

if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Please provide both username and password.']);
    exit;
}

$account = Storage::getAccountByUsername($username);
if ($account && isset($account['password']) && password_verify($password, $account['password'])) {
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)($account['id'] ?? 1);
    $_SESSION['username'] = $account['username'] ?? $username;
    echo json_encode([
        'success'  => true,
        'username' => $_SESSION['username'],
        'message'  => 'Login successful.'
    ]);
    exit;
}

http_response_code(401);
echo json_encode(['success' => false, 'message' => 'Invalid username or password.']);
exit;
