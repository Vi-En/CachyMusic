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

header('Content-Type: application/json; charset=utf-8');
require_once(__DIR__ . '/../database.php');

if (!isset($connection) || !$connection) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

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

if (mb_strlen($username, 'UTF-8') < 3 || mb_strlen($username, 'UTF-8') > 30) {
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

$checkStmt = $connection->prepare("SELECT id FROM Accounts WHERE username = ? LIMIT 1");
if (!$checkStmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error preparing statement.']);
    exit;
}

$checkStmt->bind_param('s', $username);
$checkStmt->execute();
$result = $checkStmt->get_result();

if ($result && $result->num_rows > 0) {
    http_response_code(409);
    echo json_encode(['success' => false, 'message' => 'Username is already taken.']);
    exit;
}

$algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
$hash = password_hash($password, $algo);

$insertStmt = $connection->prepare("INSERT INTO Accounts (username, password) VALUES (?, ?)");
if (!$insertStmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error preparing insert.']);
    exit;
}

$insertStmt->bind_param('ss', $username, $hash);

if ($insertStmt->execute()) {
    session_regenerate_id(true);
    $_SESSION['user_id'] = $connection->insert_id;
    $_SESSION['username'] = $username;
    echo json_encode(['success' => true, 'message' => 'Account created successfully!']);
    exit;
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Registration failed. Please try again.']);
    exit;
}