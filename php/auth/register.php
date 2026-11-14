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
$confirmPassword = $data['confirmPassword'] ?? null;

if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Please fill in all fields.']);
    exit;
}

$uLen = function_exists('mb_strlen') ? mb_strlen($username, 'UTF-8') : strlen($username);
if ($uLen < 3 || $uLen > 30) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Username must be between 3 and 30 characters.']);
    exit;
}

if (strlen($password) < 6) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Password must be at least 6 characters long.']);
    exit;
}

if ($confirmPassword !== null && $password !== $confirmPassword) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Passwords do not match.']);
    exit;
}

if (Storage::getAccountByUsername($username) !== null) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => 'Username is already taken.']);
    exit;
}

$algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
$hash = password_hash($password, $algo);

$userId = Storage::createAccount($username, $hash);
if ($userId !== false) {
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$userId;
    $_SESSION['username'] = $username;
    echo json_encode(['success' => true, 'message' => 'Account created successfully!']);
    exit;
}

http_response_code(500);
echo json_encode(['success' => false, 'message' => 'Registration failed. Please try again.']);
exit;
