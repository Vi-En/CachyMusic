<?php
// CachyMusic Audio Workstation - Router Script & Index Handler (Deny-by-default)
//
// Under `php -S` there is no .htaccess support, so every file below the project root would
// otherwise be served raw (including data/library.json with credentials, source code, scripts).
// This router therefore only exposes an explicit allowlist of static assets and PHP endpoints.

function cachy_deny(int $code, string $msg): void {
    http_response_code($code);
    header('Content-Type: text/plain; charset=UTF-8');
    header('X-Content-Type-Options: nosniff');
    echo $msg;
    exit;
}

$rawPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($rawPath) || $rawPath === '') $rawPath = '/';
$uri = rawurldecode($rawPath);

// 0. Reject malformed / traversal-style paths and every dotfile segment (.git, .htaccess, .auth_secret ...)
if (strpos($uri, "\0") !== false || strpos($uri, '\\') !== false || $uri[0] !== '/'
    || preg_match('#(^|/)\.#', $uri) || strpos($uri, '//') !== false) {
    cachy_deny(400, 'Bad request');
}

// 1. Legacy /redirect aliases and direct hits on the router itself go to the canonical root
if (preg_match('#^/redirect(?:/index\.html)?/?$#i', $uri) || $uri === '/index.php') {
    header('Location: /', true, 302);
    exit;
}

// 1b. Favicon router fallback (serves SVG app icon if favicon.ico not explicitly present)
if ($uri === '/favicon.ico') {
    if (file_exists(__DIR__ . '/favicon.ico')) {
        header('Content-Type: image/x-icon');
        readfile(__DIR__ . '/favicon.ico');
        exit;
    }
    header('Content-Type: image/svg+xml; charset=UTF-8');
    header('Cache-Control: public, max-age=604800, stale-while-revalidate=2592000');
    readfile(__DIR__ . '/resources/images/app-icon.svg');
    exit;
}

// 2. PHP endpoints: only php/api/* and php/auth/* may be executed directly
if (preg_match('#\.php$#i', $uri)) {
    if (preg_match('#^/php/(?:api|auth)/[A-Za-z0-9_\-]+\.php$#', $uri) && is_file(__DIR__ . $uri)) {
        return false; // let the built-in server execute it
    }
    cachy_deny(404, '404 Not Found');
}

// 3. Static allowlist
$publicFiles = [
    '/index.html', '/manifest.json', '/sw.js',
    '/install.sh', '/uninstall.sh',
    '/bin/cachymusic.bat', '/bin/cachymusic-mac.command',
    '/tools/packager/package-mobile.sh',
    '/downloads/CachyMusic.mobileconfig',
];
$publicPrefixes = ['/stylesheets/', '/scripts/', '/resources/images/', '/resources/fonts/', '/data/covers/'];
$publicExts = ['js', 'css', 'html', 'json', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico',
               'woff', 'woff2', 'ttf', 'mobileconfig', 'sh', 'bat', 'command'];

$ext = strtolower(pathinfo($uri, PATHINFO_EXTENSION));
$isPublic = in_array($uri, $publicFiles, true);
if (!$isPublic) {
    foreach ($publicPrefixes as $prefix) {
        if (strncmp($uri, $prefix, strlen($prefix)) === 0) { $isPublic = true; break; }
    }
}

if ($uri !== '/' && $ext !== '') {
    $file = __DIR__ . $uri;
    $real = realpath($file);
    $root = realpath(__DIR__);
    // Must be an allowlisted, existing regular file that lives inside the project (blocks symlink escapes)
    if (!$isPublic || !in_array($ext, $publicExts, true) || $real === false || !is_file($real)
        || $root === false || strncmp($real, $root . DIRECTORY_SEPARATOR, strlen($root) + 1) !== 0) {
        cachy_deny(404, '404 Not Found: Asset does not exist');
    }
    if (in_array($ext, ['js', 'css', 'html'], true)) {
        // Serve with no-store headers to prevent stale DSP worklet / stylesheet caching
        $mimeMap = [
            'js'   => 'application/javascript; charset=UTF-8',
            'css'  => 'text/css; charset=UTF-8',
            'html' => 'text/html; charset=UTF-8',
        ];
        header('Content-Type: ' . $mimeMap[$ext]);
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        readfile($real);
        exit;
    }
    return false; // binary / misc assets: built-in server sets the correct MIME + Range support
}

// 4. Non-allowlisted physical files/directories on disk must never be served or masked
$candidateDiskFile = __DIR__ . $uri;
if (file_exists($candidateDiskFile) && $uri !== '/' && $uri !== '') {
    cachy_deny(404, '404 Not Found');
}

// 5. Root route or client-side SPA routing fallback (virtual paths): serve index.html
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
readfile(__DIR__ . '/index.html');
exit;
