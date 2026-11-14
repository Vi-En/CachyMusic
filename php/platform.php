<?php
// CachyMusic v2.0.0 — Cross-Platform OS, Path, CORS & Binary Helpers

if (!function_exists('cachy_is_windows')) {
    function cachy_is_windows(): bool {
        return stripos(PHP_OS, 'WIN') === 0 || DIRECTORY_SEPARATOR === '\\';
    }

    function cachy_is_macos(): bool {
        return stripos(PHP_OS, 'DARWIN') === 0;
    }

    function cachy_os_family(): string {
        if (cachy_is_windows()) return 'windows';
        if (cachy_is_macos()) return 'darwin';
        return 'linux';
    }

    function cachy_home_dir(): string {
        $candidates = [
            getenv('HOME'),
            $_SERVER['HOME'] ?? null,
            getenv('USERPROFILE'),
            $_SERVER['USERPROFILE'] ?? null,
        ];
        foreach ($candidates as $c) {
            if (is_string($c) && $c !== '') return rtrim($c, "/\\");
        }
        $hd = getenv('HOMEDRIVE');
        $hp = getenv('HOMEPATH');
        if ($hd && $hp) return rtrim($hd . $hp, "/\\");
        if (function_exists('posix_getpwuid') && function_exists('posix_getuid')) {
            $pw = @posix_getpwuid(posix_getuid());
            if (!empty($pw['dir'])) return rtrim($pw['dir'], "/\\");
        }
        return sys_get_temp_dir();
    }

    function cachy_ensure_dir(string $dir, int $mode = 0750): bool {
        if (is_dir($dir)) return is_writable($dir);
        return @mkdir($dir, $mode, true) && is_writable($dir);
    }

    function cachy_data_dir(): string {
        $envDir = getenv('CACHYMUSIC_DATA_DIR');
        if (is_string($envDir) && $envDir !== '' && cachy_ensure_dir($envDir)) {
            return rtrim($envDir, "/\\");
        }

        // Legacy in-repo /data directory when project root itself is user-writable (portable USB / dev mode)
        $repoData = __DIR__ . '/../data';
        $projectRoot = realpath(__DIR__ . '/..') ?: dirname(__DIR__);
        if (is_dir($repoData) && is_writable($repoData)) {
            return rtrim($repoData, "/\\");
        }

        $home = cachy_home_dir();
        if (cachy_is_windows()) {
            $base = getenv('LOCALAPPDATA') ?: getenv('APPDATA') ?: ($home . '\\AppData\\Local');
            $dir = rtrim($base, "/\\") . DIRECTORY_SEPARATOR . 'CachyMusic';
        } elseif (cachy_is_macos()) {
            $dir = $home . '/Library/Application Support/CachyMusic';
        } else {
            $xdg = getenv('XDG_DATA_HOME') ?: ($home . '/.local/share');
            $dir = rtrim($xdg, '/') . '/cachymusic';
        }

        if (cachy_ensure_dir($dir)) return $dir;
        if (is_writable($projectRoot) && cachy_ensure_dir($repoData)) return $repoData;
        $tmpDir = rtrim(sys_get_temp_dir(), "/\\") . DIRECTORY_SEPARATOR . 'cachymusic-data';
        cachy_ensure_dir($tmpDir);
        return $tmpDir;
    }

    function cachy_cache_dir(): string {
        $envDir = getenv('CACHYMUSIC_CACHE_DIR');
        if (is_string($envDir) && $envDir !== '' && cachy_ensure_dir($envDir)) {
            return rtrim($envDir, "/\\");
        }
        $home = cachy_home_dir();
        if (cachy_is_windows()) {
            $base = getenv('LOCALAPPDATA') ?: ($home . '\\AppData\\Local');
            $dir = rtrim($base, "/\\") . DIRECTORY_SEPARATOR . 'CachyMusic' . DIRECTORY_SEPARATOR . 'Cache';
        } elseif (cachy_is_macos()) {
            $dir = $home . '/Library/Caches/CachyMusic';
        } else {
            $xdg = getenv('XDG_CACHE_HOME') ?: ($home . '/.cache');
            $dir = rtrim($xdg, '/') . '/cachymusic';
        }
        if (cachy_ensure_dir($dir, 0755)) return $dir;
        $tmpDir = rtrim(sys_get_temp_dir(), "/\\") . DIRECTORY_SEPARATOR . 'cachymusic-cache';
        cachy_ensure_dir($tmpDir, 0755);
        return $tmpDir;
    }

    function cachy_normalize_path(string $path): string {
        return str_replace('\\', '/', trim($path));
    }

    function cachy_is_allowed_scan_path(string $realPath): bool {
        $norm = rtrim(cachy_normalize_path($realPath), '/');
        if ($norm === '' || $norm === '/') return false;
        if (preg_match('#^[A-Za-z]:/?$#', $norm)) return false;

        if (cachy_is_windows()) {
            $lower = strtolower($norm);
            $blockedWin = ['c:/windows', 'c:/program files', 'c:/program files (x86)', 'c:/programdata'];
            foreach ($blockedWin as $bad) {
                if ($lower === $bad || str_starts_with($lower, $bad . '/')) return false;
            }
            $homeNorm = strtolower(rtrim(cachy_normalize_path(cachy_home_dir()), '/'));
            $projNorm = strtolower(rtrim(cachy_normalize_path(realpath(__DIR__ . '/..') ?: dirname(__DIR__)), '/'));
            if ($homeNorm !== '' && ($lower === $homeNorm || str_starts_with($lower, $homeNorm . '/'))) return true;
            if ($projNorm !== '' && ($lower === $projNorm || str_starts_with($lower, $projNorm . '/'))) return true;
            return (bool)preg_match('#^[a-z]:/users/[^/]+/#', $lower) || (bool)preg_match('#^[d-z]:/#', $lower);
        }

        $blockedPosix = ['/etc', '/proc', '/sys', '/dev', '/root', '/boot', '/bin', '/sbin', '/usr', '/lib', '/lib64', '/var/log', '/var/lib'];
        foreach ($blockedPosix as $bad) {
            if ($norm === $bad || str_starts_with($norm, $bad . '/')) return false;
        }

        $home = cachy_home_dir();
        $projectRoot = realpath(__DIR__ . '/..');
        $allowedRoots = array_filter([
            $home ? (realpath($home) ?: $home) : null,
            $projectRoot ?: null,
            '/mnt',
            '/media',
            '/run/media',
            '/Volumes'
        ]);
        foreach ($allowedRoots as $root) {
            $rNorm = rtrim(cachy_normalize_path((string)$root), '/');
            if ($rNorm !== '' && ($norm === $rNorm || str_starts_with($norm, $rNorm . '/'))) {
                return true;
            }
        }
        return false;
    }

    function cachy_find_binary(string $name): ?string {
        $isWin = cachy_is_windows();
        $pathEnv = getenv('PATH') ?: ($_SERVER['PATH'] ?? '');
        $dirs = array_filter(explode(PATH_SEPARATOR, $pathEnv));
        if (!$isWin) {
            $dirs = array_merge($dirs, ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin']);
        }
        $exts = $isWin ? ['.exe', '.cmd', '.bat', ''] : [''];

        foreach ($dirs as $dir) {
            $dir = rtrim($dir, "/\\");
            if ($dir === '') continue;
            foreach ($exts as $ext) {
                $candidate = $dir . DIRECTORY_SEPARATOR . $name . $ext;
                if (@is_file($candidate) && ($isWin || @is_executable($candidate))) {
                    return $candidate;
                }
            }
        }
        return null;
    }

    function cachy_spawn_detached(string $binary, array $args = [], ?string $logFile = null): bool {
        $argStr = implode(' ', array_map('escapeshellarg', $args));
        $binEsc = escapeshellarg($binary);
        if (cachy_is_windows()) {
            $cmd = 'start "" /B ' . $binEsc . ($argStr !== '' ? ' ' . $argStr : '') . ' >NUL 2>NUL';
            $proc = @popen($cmd, 'r');
            if ($proc) {
                @pclose($proc);
                return true;
            }
            return false;
        }
        $out = $logFile ? escapeshellarg($logFile) : '/dev/null';
        $cmd = "nohup $binEsc" . ($argStr !== '' ? " $argStr" : '') . " </dev/null >$out 2>&1 &";
        @exec($cmd);
        return true;
    }

    function cachy_send_local_cors(string $methods = 'GET, POST, OPTIONS', bool $allowLan = false): void {
        if (headers_sent()) return;
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '') {
            $parsed = @parse_url($origin);
            $host = strtolower($parsed['host'] ?? '');
            $serverHost = strtolower((string)@parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), PHP_URL_HOST));
            $isLocal = in_array($host, ['localhost', '127.0.0.1', '::1', 'appassets.androidplatform.net'], true)
                || ($serverHost !== '' && $host === $serverHost);
            $isPrivateLan = $allowLan && (bool)preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/', $host);
            if ($isLocal || $isPrivateLan) {
                header("Access-Control-Allow-Origin: $origin");
                header("Access-Control-Allow-Credentials: true");
                header("Vary: Origin");
            }
        }
        header("Access-Control-Allow-Methods: $methods");
        header("Access-Control-Allow-Headers: Content-Type, Authorization");
    }
}
