#!/usr/bin/env python3
"""Source-mode desktop launcher. Owns child processes; no raw static server fallback."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
WINDOWS = os.name == 'nt'
HOME = Path.home()
STATE = (Path(os.environ.get('LOCALAPPDATA', HOME / 'AppData/Local')) / 'CachyMusic' / 'Launcher' if WINDOWS else
         Path(os.environ.get('XDG_STATE_HOME', HOME / '.local/state')) / 'cachymusic')
STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
SESSION = STATE / 'launcher-session.json'
STOP = STATE / 'launcher-stop'
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def source_version():
    return json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']

def assert_matching_session(active):
    # Old sessions remain stoppable, but cannot masquerade as an upgraded build.
    if active.get('version') != source_version() or active.get('root') != str(ROOT):
        raise RuntimeError('A different CachyMusic build is running. Close its player, run --stop, then start this build again.')
    if os.environ.get('CACHY_PORT') and int(os.environ['CACHY_PORT']) != active['port']:
        raise RuntimeError('The running service uses a different port. Run --stop before changing it.')
    for key, field in [('CACHYMUSIC_DATA_DIR', 'data'), ('CACHYMUSIC_CACHE_DIR', 'cache')]:
        if os.environ.get(key) and os.path.normcase(str(Path(os.environ[key]).resolve())) != os.path.normcase(active.get(field, '')):
            raise RuntimeError('The running service uses different storage. Run --stop before changing it.')


def read_session():
    try:
        data = json.loads(SESSION.read_text())
        if 1 <= int(data['port']) <= 65535 and len(data['instance']) == 48:
            return data
    except (OSError, ValueError, TypeError, KeyError):
        pass
    return None


def health(port, instance):
    try:
        with HTTP.open(f'http://127.0.0.1:{port}/php/api/launcher_health.php', timeout=.4) as reply:
            data = json.load(reply)
            return data == {'app': 'CachyMusic', 'instance': instance}
    except (OSError, ValueError):
        return False


def active_session():
    data = read_session()
    return data if data and health(data['port'], data['instance']) else None


def choose_port():
    # Do not silently change origin: IndexedDB and installed PWAs are origin-bound.
    default = os.environ.get('CACHY_PORT')
    if not default:
        try:
            default = (STATE / 'port').read_text().strip()
        except OSError:
            default = '8000'
    port = int(default)
    if not 1 <= port <= 65535:
        raise ValueError('CACHY_PORT must be between 1 and 65535')
    return port


def require_free(port):
    with socket.socket() as sock:
        # Match the POSIX PHP server's reuse policy: an orderly shutdown can
        # leave TCP TIME_WAIT entries even though no listener owns the port.
        # Do not enable SO_REUSEPORT or loosen Windows exclusive binding.
        if not WINDOWS: sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('127.0.0.1', port))


def find_php():
    if WINDOWS:
        for path in [ROOT / 'php-win/php.exe', ROOT / 'php/php.exe']:
            if path.is_file():
                return str(path)
    return shutil.which('php')


def lock_file():
    lock = (STATE / 'launcher.lock').open('a+b')
    if WINDOWS:
        import msvcrt
        lock.seek(0)
        if not lock.read(1):
            lock.write(b'0'); lock.flush()
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    return lock


def terminate(child):
    if not WINDOWS:
        # PHP's POSIX worker processes share the owned child process group.
        try: os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError: pass
    if child.poll() is None:
        if WINDOWS: child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if WINDOWS: child.kill()
            else:
                try: os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError: pass
            child.wait()


def serve(port):
    lock = lock_file()
    children = []
    handles = []
    instance = secrets.token_hex(24)
    stopping = False
    def on_stop(*_):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, on_stop)
    signal.signal(signal.SIGINT, on_stop)
    def launch(args, env, name):
        log = (STATE / (name + '.log')).open('wb')
        handles.append(log)
        child = subprocess.Popen(args, cwd=ROOT, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=not WINDOWS)
        children.append(child)
        return child
    try:
        require_free(port)
        php = find_php()
        if not php:
            raise RuntimeError('PHP 8.1+ is required; no unrestricted static server will be started.')
        env = dict(os.environ, CACHYMUSIC_LAUNCH_INSTANCE=instance, CACHYMUSIC_MANAGED_SERVICES='1', CACHYMUSIC_SOULSEEK_DISABLED='1')
        env.pop('PHP_CLI_SERVER_WORKERS', None)
        env.pop('CACHYMUSIC_LOOKUP_KEY', None)
        if not WINDOWS: env['PHP_CLI_SERVER_WORKERS'] = '4'  # Managed process group.
        env.pop('CACHYMUSIC_MPRIS_ACTIVE', None)
        use_mpris = not WINDOWS and env.get('CACHYMUSIC_MPRIS') == '1' and subprocess.run([sys.executable, '-c', 'import dbus; from gi.repository import GLib; dbus.SessionBus()'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
        if use_mpris: env['CACHYMUSIC_MPRIS_ACTIVE'] = '1' 
        # Validate runtime and both storage roots before starting any child service.
        subprocess.run([php, '-r', 'if (PHP_VERSION_ID < 80100) { fwrite(STDERR, "PHP 8.1+ required\\n"); exit(1); }'], cwd=ROOT, env=env, check=True, timeout=10)
        for key, function in [('CACHYMUSIC_DATA_DIR', 'cachy_data_dir'), ('CACHYMUSIC_CACHE_DIR', 'cachy_cache_dir')]:
            env[key] = subprocess.check_output([php, '-r', f'require "php/platform.php"; echo {function}();'], cwd=ROOT, env=env, timeout=10).decode('utf-8').strip()
        # Use PHP's authoritative bounded descriptor reader, not an independent
        # unbounded JSON decode in the supervisor. Never repair existing bytes.
        preflight = subprocess.run([php, '-r', 'require "php/storage.php"; exit(Storage::preflightLibrary()?0:1);'], cwd=ROOT, env=env, timeout=15, capture_output=True)
        if preflight.returncode != 0:
            raise RuntimeError('Existing library.json is unsafe, invalid or exceeds its configured limit. Back up the profile and inspect it before starting; it has not been changed.')
        node = shutil.which('node')
        # Optional service: do not start if dependencies are missing or the port is occupied.
        if node and (ROOT / 'server/soulseek-service.js').is_file() and subprocess.run([node, '-e', "require.resolve('slsk-client')"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            slsk_port = int(env.get('CACHYMUSIC_SOULSEEK_PORT', '12339'))
            try:
                require_free(slsk_port)
                env['CACHYMUSIC_SOULSEEK_PORT'] = str(slsk_port)
                env['CACHYMUSIC_SOULSEEK_TOKEN'] = secrets.token_hex(32)
                peer = launch([node, str(ROOT / 'server/soulseek-service.js')], env, 'soulseek')
                for _ in range(30):
                    if peer.poll() is not None: break
                    try:
                        req = urllib.request.Request(f'http://127.0.0.1:{slsk_port}/health', headers={'X-Cachy-Local':'1','X-Cachy-Token':env['CACHYMUSIC_SOULSEEK_TOKEN']})
                        with HTTP.open(req, timeout=.3) as reply:
                            if json.load(reply).get('ok') is True:
                                env['CACHYMUSIC_SOULSEEK_DISABLED'] = '0'; break
                    except (OSError, ValueError): pass
                    time.sleep(.1)
            except (OSError, ValueError): pass
        # Enable the bounded Windows helper only after a real Job Object probe.
        # No implicit runtime download or assumption about nested-job support.
        env.pop('CACHYMUSIC_WINDOWS_PYTHON', None)
        env.pop('CACHYMUSIC_WINDOWS_PROCESS_HELPER', None)
        env.pop('CACHYMUSIC_WINDOWS_REQUIRE_SUPERVISOR', None)
        if WINDOWS:
            env['CACHYMUSIC_WINDOWS_REQUIRE_SUPERVISOR']='1'
            helper=ROOT/'bin/cachymusic-process.py'
            try:
                probe=subprocess.run([sys.executable,str(helper),'--probe'],cwd=ROOT,env=env,capture_output=True,timeout=5)
                if probe.returncode!=0 or probe.stdout.strip()!=b'CMP1':
                    raise RuntimeError('Windows Job Object unavailable')
                env['CACHYMUSIC_WINDOWS_PYTHON']=sys.executable
                env['CACHYMUSIC_WINDOWS_PROCESS_HELPER']=str(helper)
            except (OSError,RuntimeError,subprocess.TimeoutExpired):
                print('Warning: Windows subprocess supervisor unavailable; external PHP tools are disabled for this launch. Core playback and supported PHP-only metadata remain available.',file=sys.stderr,flush=True)
        if WINDOWS: env['CACHYMUSIC_LOOKUP_KEY'] = secrets.token_hex(32)
        # The scan worker is a separate owned process, not a request-spawned daemon.
        if env.get('CACHYMUSIC_DB_ENABLED') != '1' and env.get('CACHYMUSIC_PLAYLIST_SQL') != '1':
            env['CACHYMUSIC_SCAN_SESSION'] = instance
            scan_worker = launch([php, str(ROOT/'php/scan_worker.php')], env, 'scan-worker')
        else:
            env.pop('CACHYMUSIC_SCAN_SESSION', None)
            scan_worker = None
        php_child = launch([php, '-S', f'127.0.0.1:{port}', 'index.php'], env, 'php-server')
        for _ in range(50):
            if php_child.poll() is not None: raise RuntimeError('PHP exited; inspect php-server.log')
            if health(port, instance): break
            time.sleep(.1)
        else: raise RuntimeError('PHP identity/readiness check failed')
        if use_mpris:
            launch([sys.executable, str(ROOT/'bin/cachymusic-mpris.py'), '--port', str(port)], env, 'mpris')
        tmp = SESSION.with_suffix('.tmp')
        tmp.write_text(json.dumps({'port':port, 'instance':instance, 'mpris':use_mpris, 'version':source_version(), 'root':str(ROOT), 'data':env['CACHYMUSIC_DATA_DIR'], 'cache':env['CACHYMUSIC_CACHE_DIR']}))
        tmp.replace(SESSION)
        (STATE / 'port').write_text(str(port))
        while not stopping and php_child.poll() is None:
            # Do not tear down playback if optional indexing has failed.
            # Its endpoint reports unavailable/uncertain until an explicit restart.
            try:
                if STOP.read_text() == instance: break
            except OSError: pass
            time.sleep(.25)
    finally:
        for child in reversed(children): terminate(child)
        for handle in handles: handle.close()
        recorded = read_session()
        if recorded and recorded['instance'] == instance: SESSION.unlink(missing_ok=True)
        lock.close()


def open_browser(url, mpris=False):
    candidates = ['chromium', 'google-chrome-stable', 'google-chrome', 'brave', 'brave-browser', 'microsoft-edge', 'msedge', 'chrome']
    paths = [shutil.which(name) for name in candidates]
    if WINDOWS:
        for base in [os.environ.get('PROGRAMFILES'), os.environ.get('PROGRAMFILES(X86)'), os.environ.get('LOCALAPPDATA')]:
            if base:
                paths.extend(str(Path(base)/sub) for sub in ['Microsoft/Edge/Application/msedge.exe','Google/Chrome/Application/chrome.exe','BraveSoftware/Brave-Browser/Application/brave.exe'])
    browser = next((p for p in paths if p and Path(p).is_file()), None)
    if browser:
        profile = Path(os.environ.get('LOCALAPPDATA', HOME / 'AppData/Local')) / 'CachyMusic' if WINDOWS else HOME / '.config/cachymusic'
        subprocess.Popen([browser, f'--app={url}', f'--user-data-dir={profile}'] + (['--disable-features=HardwareMediaKeyHandling'] if mpris else []), stdin=subprocess.DEVNULL)
    else:
        if not webbrowser.open(url): print(f'Open {url} manually.')


def main():
    parser = argparse.ArgumentParser(description='CachyMusic desktop launcher')
    parser.add_argument('--serve', type=int, help=argparse.SUPPRESS)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--background','-b',action='store_true')
    modes.add_argument('--status',action='store_true')
    modes.add_argument('--stop',action='store_true')
    modes.add_argument('--tray',action='store_true')
    args = parser.parse_args()
    if args.serve is not None: serve(args.serve); return
    for key in ('CACHYMUSIC_DATA_DIR', 'CACHYMUSIC_CACHE_DIR'):
        if os.environ.get(key):
            os.environ[key] = str(Path(os.environ[key]).resolve())
    active = active_session()
    if args.status:
        print(f'CachyMusic {active.get("version", "(legacy build)")} running at http://127.0.0.1:{active["port"]}' if active else 'No managed CachyMusic session.'); return
    if args.stop:
        recorded = read_session()
        if recorded:
            STOP.write_text(recorded['instance'])
            for _ in range(120):
                if not SESSION.exists(): break
                time.sleep(.1)
            else: raise RuntimeError('Shutdown not confirmed; inspect launcher log')
        print('Managed service stopped or not running.'); return
    if not active:
        port = choose_port()
        require_free(port)
        if not find_php(): raise RuntimeError('Install PHP 8.1+ or use the portable build route.')
        options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS} if WINDOWS else {'start_new_session':True}
        with (STATE/'launcher.log').open('wb') as log:
            child = subprocess.Popen([sys.executable, __file__, '--serve', str(port)], stdin=subprocess.DEVNULL, stdout=log, stderr=log, **options)
        for _ in range(100):
            active = active_session()
            if active: break
            if child.poll() is not None: break
            time.sleep(.1)
        if not active: raise RuntimeError(f'Server failed to start. See {STATE / "launcher.log"}')
    assert_matching_session(active)
    url = f'http://127.0.0.1:{active["port"]}'
    print(url)
    if args.tray:
        if WINDOWS: raise RuntimeError('The optional GTK tray is Linux-only.')
        subprocess.run([sys.executable, str(ROOT/'bin/cachymusic-tray.py'), '--port', str(active['port'])] + (['--media-controls'] if active.get('mpris') else []), check=True)
    elif not args.background: open_browser(url, active.get('mpris', False))

if __name__ == '__main__':
    try: main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'CachyMusic: {error}', file=sys.stderr); sys.exit(1)
