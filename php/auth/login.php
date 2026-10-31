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

$account = null;
if (isset($connection) && $connection && !mysqli_connect_errno()) {
    $stmt = $connection->prepare("SELECT id, password FROM Accounts WHERE username = ? LIMIT 1");
    if ($stmt) {
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result && $row = $result->fetch_assoc()) {
            $account = $row;
        }
    }
}

if (!$account) {
    $account = Storage::getAccountByUsername($username);
}

if ($account && password_verify($password, $account['password'])) {
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$account['id'];
    $_SESSION['username'] = $username;
    echo json_encode([
        'success'  => true,
        'username' => $username,
        'message'  => 'Login successful.'
    ]);
    exit;
}

http_response_code(401);
echo json_encode(['success' => false, 'message' => 'Invalid username or password.']);
exit;