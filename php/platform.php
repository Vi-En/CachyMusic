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
            cachy_is_windows() ? getenv('USERPROFILE') : null,
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
        @mkdir($dir, $mode, true);
        return is_dir($dir) && is_writable($dir);
    }

    // Do not redirect a failed storage path to an unrelated database or a shared
    // temporary directory. A failed preflight must be visible to the launcher.
    function cachy_require_dir(string $dir): string {
        if (!cachy_ensure_dir($dir, 0700)) {
            throw new RuntimeException('CachyMusic storage directory is unavailable or not writable. Check the configured path and permissions.');
        }
        $canonical = realpath($dir);
        if ($canonical === false) throw new RuntimeException('CachyMusic storage directory could not be resolved.');
        return $canonical;
    }

    function cachy_data_dir(): string {
        $envDir = getenv('CACHYMUSIC_DATA_DIR');
        if (is_string($envDir) && $envDir !== '') return cachy_require_dir($envDir);

        // Preserve existing portable libraries, including an explicit failure if
        // their storage becomes inaccessible. Never create a new fallback library.
        $repoData = __DIR__ . '/../data';
        if (file_exists($repoData) || is_link($repoData)) return cachy_require_dir($repoData);

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
        return cachy_require_dir($dir);
    }

    function cachy_cache_dir(): string {
        $envDir = getenv('CACHYMUSIC_CACHE_DIR');
        if (is_string($envDir) && $envDir !== '') return cachy_require_dir($envDir);
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
        return cachy_require_dir($dir);
    }

    // IDs cross JSON and query-string boundaries; PHP's casts would turn
    // booleans, arrays, fractional values and numeric prefixes into other IDs.
    function cachy_positive_id($value): ?int {
        if (is_int($value)) return $value > 0 ? $value : null;
        if (!is_string($value) || !preg_match('/^[1-9][0-9]*$/D', $value)) return null;
        $id = filter_var($value, FILTER_VALIDATE_INT);
        return $id === false ? null : $id;
    }

    function cachy_normalize_path(string $path): string {
        return str_replace('\\', '/', trim($path));
    }

    // Only compare canonical paths (realpath) at access-control call sites.
    function cachy_path_within(string $path, string $root, ?bool $windows = null): bool {
        $windows = $windows ?? cachy_is_windows();
        if ($windows) { $path = strtolower(str_replace('\\', '/', $path)); $root = strtolower(str_replace('\\', '/', $root)); }
        $root = rtrim($root, '/');
        return $root !== '' && ($path === $root || str_starts_with($path, $root . '/'));
    }

    // POSIX pipe mode has no unbounded temporary output files. Read both
    // streams fairly and cap each buffer before accumulating more data.
    // Windows pipe nonblocking is not portable; retain its sampled spool path.
    function cachy_run_process_pipes(array $args,int $maxOutput,float $timeout,$input,?Closure $checkpoint=null): ?array {
        $process=null;$pipes=[];$out='';$err='';$exit=-1;$done=false;$pid=null;$group=false;
        // setsid is optional and deliberately resolved at a fixed system path.
        // Never signal a group unless the child is confirmed as its leader.
        $isolate=PHP_OS_FAMILY==='Linux' && function_exists('posix_getpgid') && function_exists('posix_kill') && is_executable('/usr/bin/setsid');
        if ($isolate) $args=array_merge(['/usr/bin/setsid','--'],$args);
        try {
            $process=@proc_open($args,[0=>$input??['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,null,null,['bypass_shell'=>true]);
            if (!is_resource($process)) return null;
            $initial=proc_get_status($process);$pid=$initial['pid'];
            if (!$initial['running']) {$exit=$initial['exitcode'];$done=true;}
            if (isset($pipes[0])) {fclose($pipes[0]);unset($pipes[0]);}
            foreach ($pipes as $pipe) if (!stream_set_blocking($pipe,false)) return null;
            $deadline=hrtime(true)/1e9+$timeout;
            do {
                if ($isolate && !$done && $pid>1 && @posix_getpgid($pid)===$pid) $group=true;
                if ($checkpoint) $checkpoint();
                $remaining=$deadline-hrtime(true)/1e9;
                if ($remaining<=0) return null;
                $read=array_values($pipes);$write=$except=null;
                if ($read) {
                    $ready=@stream_select($read,$write,$except,0,(int)min(10000,max(0,$remaining*1e6)));
                    if ($ready===false) {usleep(1000);continue;}
                    foreach ([1,2] as $idx) {
                        if (!isset($pipes[$idx])||!in_array($pipes[$idx],$read,true)) continue;
                        $length=$idx===1?strlen($out):strlen($err);
                        $chunk=fread($pipes[$idx],min(65536,$maxOutput-$length+1));
                        if ($chunk===false || $length+strlen($chunk)>$maxOutput) return null;
                        if ($idx===1) $out.=$chunk; else $err.=$chunk;
                        if (feof($pipes[$idx])) {fclose($pipes[$idx]);unset($pipes[$idx]);}
                    }
                } else usleep((int)min(10000,max(1,$remaining*1e6)));
                if (!$done) {
                    $status=proc_get_status($process);
                    if (!$status['running']) {$exit=$status['exitcode'];$done=true;}
                }
                if ($done&&!$pipes) break;
            } while(true);
            $closed=proc_close($process);$process=null;
            return ['exitcode'=>$exit===-1?$closed:$exit,'stdout'=>$out,'stderr'=>$err];
        } catch (Throwable $e) {return null;}
        finally {
            foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
            if (is_resource($process)) {
                if ($group && !$done && $pid>1 && @posix_getpgid($pid)===$pid) @posix_kill(-$pid,9);
                @proc_terminate($process,9);@proc_close($process);
            }
        }
    }

    // Direct subprocess execution with a monotonic deadline and bounded reads.
    // Managed Windows source launches require the probed bounded supervisor.
    // Unmanaged/portable compatibility launches retain sampled spool limits.
    function cachy_windows_process_policy(): string {
        $python=getenv('CACHYMUSIC_WINDOWS_PYTHON');$helper=getenv('CACHYMUSIC_WINDOWS_PROCESS_HELPER');
        if ($python!==false||$helper!==false) return is_string($python)&&is_string($helper)&&is_file($python)&&is_file($helper)?'supervised':'deny';
        return getenv('CACHYMUSIC_WINDOWS_REQUIRE_SUPERVISOR')==='1'?'deny':'compatibility';
    }
    function cachy_run_process(array $args, int $maxOutput = 1048576, float $timeout = 15.0, $input = null, ?Closure $checkpoint=null): ?array {
        if (!function_exists('proc_open') || !$args || $maxOutput < 0 || $maxOutput > 67108864 || !is_finite($timeout) || $timeout <= 0 || $timeout > 300) return null;
        foreach ($args as $arg) if (!is_string($arg) || strpos($arg, "\0") !== false) return null;
        if ($args[0] === '' || ($input !== null && !is_resource($input))) return null;
        if (!cachy_is_windows()) return cachy_run_process_pipes($args,$maxOutput,$timeout,$input,$checkpoint);
        $python=getenv('CACHYMUSIC_WINDOWS_PYTHON');$helper=getenv('CACHYMUSIC_WINDOWS_PROCESS_HELPER');
        $policy=cachy_windows_process_policy();
        if ($policy==='deny') return null;
        if ($policy==='supervised') {
            $framed=cachy_run_process_spool(array_merge([$python,$helper,(string)$maxOutput,sprintf('%.6F',$timeout),'--'],$args),16+2*$maxOutput,65536,$timeout,$input,$checkpoint);
            return cachy_decode_supervisor_result($framed,$maxOutput);
        }
        return cachy_run_process_spool($args,$maxOutput,$maxOutput,$timeout,$input,$checkpoint);
    }
    function cachy_decode_supervisor_result(?array $result,int $cap): ?array {
        if ($result===null||$result['exitcode']!==0||!is_string($result['stdout'])||strlen($result['stdout'])<16) return null;
        $bytes=$result['stdout'];$head=unpack('a4magic/Nexit/Nout/Nerr',substr($bytes,0,16));
        if (!$head||$head['magic']!=='CMP1'||$head['out']>$cap||$head['err']>$cap||strlen($bytes)!==16+$head['out']+$head['err']) return null;
        $exit=$head['exit'];if ($exit>2147483647) $exit-=4294967296;
        return ['exitcode'=>$exit,'stdout'=>substr($bytes,16,$head['out']),'stderr'=>substr($bytes,16+$head['out'],$head['err'])];
    }
    // The supervised helper emits only the final bounded frame. In legacy
    // mode child output remains sampled; both paths enforce bounded reads.
    function cachy_run_process_spool(array $args,int $stdoutLimit,int $stderrLimit,float $timeout,$input,?Closure $checkpoint=null): ?array {
        $stdout = $stderr = $process = null;
        $pipes = [];
        try {
            $stdout = tmpfile(); $stderr = tmpfile();
            if (!$stdout || !$stderr) return null;
            $process = @proc_open($args, [0=>$input ?? ['pipe','r'], 1=>$stdout, 2=>$stderr], $pipes, null, null, ['bypass_shell'=>true]);
            if (!is_resource($process)) return null;
            if (isset($pipes[0])) { fclose($pipes[0]); unset($pipes[0]); }
            $deadline = hrtime(true) + $timeout * 1000000000;
            do {
                if ($checkpoint) $checkpoint();
                $status = proc_get_status($process);
                $outStat = fstat($stdout); $errStat = fstat($stderr);
                if (!$outStat || !$errStat || $outStat['size'] > $stdoutLimit || $errStat['size'] > $stderrLimit || hrtime(true) >= $deadline) return null;
                if (!$status['running']) break;
                usleep(10000);
            } while (true);
            $exit = $status['exitcode'];
            $closed = proc_close($process); $process = null;
            rewind($stdout); rewind($stderr);
            $out = stream_get_contents($stdout, $stdoutLimit + 1);
            $err = stream_get_contents($stderr, $stderrLimit + 1);
            if (!is_string($out) || !is_string($err) || strlen($out) > $stdoutLimit || strlen($err) > $stderrLimit) return null;
            return ['exitcode'=>$exit === -1 ? $closed : $exit, 'stdout'=>$out, 'stderr'=>$err];
        } catch (Throwable $e) {
            return null;
        } finally {
            if (is_resource($process)) { @proc_terminate($process, 9); @proc_close($process); }
            foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
            foreach ([$stdout, $stderr] as $file) if (is_resource($file)) fclose($file);
        }
    }
    function cachy_run_args(array $args, ?int $maxOutput = null, float $timeout = 15.0, ?Closure $checkpoint=null): ?string {
        $result = cachy_run_process($args, $maxOutput ?? 1048576, $timeout, null,$checkpoint);
        return $result !== null && $result['exitcode'] === 0 ? $result['stdout'] : null;
    }

    function cachy_run_binary(string $binary, array $args, int $maxOutput = 1048576, float $timeout = 3.0): ?string {
        $path = cachy_find_binary($binary);
        return $path === null ? null : cachy_run_args(array_merge([$path], $args), $maxOutput, $timeout);
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
        if (!$isWin && getenv('CACHYMUSIC_PACKAGED')!=='1') {
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
