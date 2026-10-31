<?php
// CachyMusic - Apple iOS Full-Screen WebClip Configuration Profile Generator (.mobileconfig)
// Generates a dynamic iOS WebClip profile pointing to the active LAN / Server URL

$port = (int)($_SERVER['SERVER_PORT'] ?? 8000);
if ($port <= 0 || $port > 65535) $port = 8000;

$hostHeader = $_SERVER['HTTP_HOST'] ?? '';
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';

$targetHost = '';
if (!empty($hostHeader) && !str_starts_with($hostHeader, '127.0.0.1') && !str_starts_with($hostHeader, 'localhost')) {
    $targetHost = $hostHeader;
} else {
    $ipRoute = @shell_exec("ip route get 1.1.1.1 2>/dev/null");
    if ($ipRoute && preg_match('/src\s+([0-9\.]+)/', $ipRoute, $m)) {
        $candidate = trim($m[1]);
        if (filter_var($candidate, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $targetHost = $candidate . ':' . $port;
        }
    }
    if (empty($targetHost)) {
        $targetHost = ($hostHeader ?: ('127.0.0.1:' . $port));
    }
}

$appUrl = htmlspecialchars("{$scheme}://{$targetHost}/", ENT_XML1, 'UTF-8');

header('Content-Type: application/x-apple-aspen-config; charset=utf-8');
header('Content-Disposition: attachment; filename="CachyMusic.mobileconfig"');
header('Cache-Control: no-store, no-cache, must-revalidate');

echo <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>FullScreen</key>
            <true/>
            <key>IgnoreManifestScope</key>
            <true/>
            <key>IsRemovable</key>
            <true/>
            <key>Label</key>
            <string>CachyMusic</string>
            <key>PayloadDescription</key>
            <string>Configures CachyMusic Lossless Studio Player as a native full-screen iOS Web App</string>
            <key>PayloadDisplayName</key>
            <string>CachyMusic WebClip</string>
            <key>PayloadIdentifier</key>
            <string>com.cachymusic.studio.webclip</string>
            <key>PayloadType</key>
            <string>com.apple.webClip.managed</string>
            <key>PayloadUUID</key>
            <string>8EF29818-F6AB-4782-82FA-F162ED09E52C</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>Precomposed</key>
            <true/>
            <key>URL</key>
            <string>{$appUrl}</string>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>Installs CachyMusic Hi-Fi Audio Workstation on your iOS Home Screen with full-screen studio playback.</string>
    <key>PayloadDisplayName</key>
    <string>CachyMusic Studio Player</string>
    <key>PayloadIdentifier</key>
    <string>com.cachymusic.studio.profile</string>
    <key>PayloadOrganization</key>
    <string>CachyMusic Studio</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>4A91B730-C214-4F9A-9D82-A192EC44102B</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
XML;
exit;
