#!/usr/bin/env python3
"""Maintainer acceptance runner for a disposable checkout. Never certifies hardware.

Run on a Linux host with test dependencies already installed. It does not install
packages, upload results, use a real music library or request service credentials.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
from source_tree import fingerprint, sha256

ROOT = Path(__file__).resolve().parents[1]


def classify(code, log):
    if code == 0:
        return 'pass'
    if 'net::ERR_BLOCKED_BY_ADMINISTRATOR' in log or (code==2 and ('BLOCKED_DEPENDENCY_AUDIT:' in log or 'BLOCKED: dpkg-deb unavailable' in log)):
        return 'blocked'
    return 'fail'


def source_fingerprint():
    return fingerprint(ROOT)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New, empty output directory outside the checkout')
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    parser.add_argument('--android', action='store_true', help='Also require native APK compilation, lint and host tests')
    parser.add_argument('--endurance', action='store_true', help='Also run both viewports beyond the playlist history cap')
    parser.add_argument('--peer-lock',type=Path,help='Declare optional Soulseek scope and audit a reviewed npm package-lock.json')
    parser.add_argument('--source-kit',type=Path,help='Exact distributed source ZIP for release inventory and content checks')
    parser.add_argument('--previous-kit',type=Path,help='Verified prior source archive for actual backend upgrade/rollback')
    parser.add_argument('--debian',action='store_true',help='Build, extract and smoke-test the Debian package')
    parser.add_argument('--previous-sha256', help='Independently verified SHA-256 of the prior source kit')
    args = parser.parse_args()
    if not __debug__:
        parser.error('Python optimization disables required test assertions')
    if bool(args.previous_kit) != bool(args.previous_sha256):
        parser.error('--previous-kit and --previous-sha256 must be supplied together')
    if args.previous_kit and sha256(args.previous_kit) != args.previous_sha256:
        parser.error('Prior source kit SHA-256 mismatch')
    out = args.output.resolve()
    if out == ROOT or ROOT in out.parents:
        parser.error('Output must be outside the checkout')
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        parser.error('Output directory must be empty')
    version = json.loads((ROOT / 'package.json').read_text())['version']
    report = {'version': version, 'source_fingerprint_before': source_fingerprint(), 'gates': {}, 'android_requested': args.android, 'release_scope': 'optional-peer' if args.peer_lock else 'local-only', 'endurance_requested': args.endurance, 'manual_gates': ['physical audio, fresh and migrated profile', 'target OS installation and rollback', 'keyboard, touch and screen reader', 'native Android background and OEM notification (if included)', 'live MySQL and Soulseek (if advertised)']}
    def save():
        (out / 'acceptance.json').write_text(json.dumps(report, indent=2) + '\n')
    env = os.environ.copy()
    # Regression tests create their own disposable stores. Do not inherit a
    # maintainer's real library or SQL credentials/opt-in configuration.
    for name in list(env):
        if name.startswith(('DB_', 'MYSQL_', 'CACHYMUSIC_', 'CACHY_')) or name == 'PYTHONOPTIMIZE':
            env.pop(name, None)
    def run(name, command, cwd=ROOT, timeout=900):
        begin = time.monotonic()
        path = out / (name + '.log')
        try:
            with path.open('w', encoding='utf-8') as log:
                with subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True) as process:
                    try:
                        code = process.wait(timeout=timeout)
                    except (subprocess.TimeoutExpired, KeyboardInterrupt):
                        # Browser/test children belong to this run's process group.
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        process.wait()
                        raise
            status = classify(code, path.read_text(errors='replace'))
        except FileNotFoundError:
            code, status = None, 'blocked'
            path.write_text('Required executable unavailable.\n')
        except subprocess.TimeoutExpired:
            code, status = None, 'fail'
            with path.open('a') as log:
                log.write('\nAcceptance test timed out.\n')
        report['gates'][name] = {'status': status, 'exit_code': code, 'seconds': round(time.monotonic() - begin, 2), 'log': path.name}
        save()
        print(f'{name}: {status}', flush=True)
    run('source-regression', ['bash', 'tests/run-all.sh'])
    if args.source_kit:run('source-inventory',[sys.executable,'tests/release-inventory.py',str(args.source_kit.resolve()),'--output',str(out/'source-inventory.json')])
    else:report['gates']['source-inventory']={'status':'not_run'}
    if args.previous_kit:run('backend-upgrade-rollback',[sys.executable,'tests/upgrade-rollback.py',str(args.previous_kit.resolve()),'--sha256',args.previous_sha256])
    else:report['gates']['backend-upgrade-rollback']={'status':'not_run'}
    if args.debian:run('debian-package',[sys.executable,'tests/debian-package.py','--output',str(out/'debian-package')])
    else:report['gates']['debian-package']={'status':'not_applicable','reason':'Debian distribution not requested'}
    browser_path = shutil.which(args.chromium) or args.chromium
    browser = ['--chromium', browser_path]
    for name, script in [('default-audio', 'default-audio-browser.py'), ('indexing-import', 'indexing-import-browser.py'), ('audio-transport', 'audio-transport-browser.py'), ('media-recovery','media-recovery-browser.py'), ('audio-comparison', 'audio-comparison-browser.py'), ('audio-output', 'audio-output-browser.py'), ('player', 'player-browser.py'), ('interaction', 'interaction-refinement-browser.py'), ('design', 'design-browser.py'), ('accessibility', 'workspace-accessibility-browser.py'), ('playlist-layout', 'playlist-browser.py'), ('layout', 'preview-layouts.py'), ('settings-interaction','settings-interaction-browser.py'), ('settings-navigation','settings-navigation-browser.py'), ('metadata-editor','metadata-editor-browser.py'), ('playlist-repair','playlist-repair-browser.py'), ('ux-shapes','ux-shapes-browser.py'), ('library-profile','library-render-profile.py'), ('listening-idb', 'listening-history-real-idb.py'), ('playlist-idb', 'playlist-real-idb.py'), ('audio-worklet', 'audio-worklet-acceptance.py'), ('production-audio-origin', 'audio-production-origin.py'), ('pwa-offline', 'pwa-offline-acceptance.py')]:
        extra = ['--output', str(out / (name + '-previews'))] if name in {'interaction','design','playlist-layout','layout','settings-interaction','settings-navigation','metadata-editor','playlist-repair','ux-shapes','library-profile'} else []
        if not Path(browser_path).is_file():
            report['gates'][name] = {'status': 'blocked', 'reason': 'Chromium unavailable'}
            save()
            continue
        run(name, [sys.executable, 'tests/' + script, *browser, *extra])
    if Path(browser_path).is_file():
        run('audio-clock-probe',[sys.executable,'tests/default-audio-browser.py',*browser,'--suspend-probe'])
        run('audio-under-load',[sys.executable,'tests/default-audio-browser.py',*browser,'--load-workers','4','--main-thread-busy-ms','25'])
    else:
        for name in ('audio-clock-probe','audio-under-load'):report['gates'][name]={'status':'blocked','reason':'Chromium unavailable'}
    if args.endurance:
        for viewport in ('mobile', 'desktop'):
            run('endurance-' + viewport, [sys.executable, 'tests/mixed-workload-browser.py', *browser, '--viewport', viewport, '--cycle-targets', '520,80,80', '--require-saturation'], timeout=1200)
    else:
        report['gates']['endurance'] = {'status': 'not_run'}
    if args.android:
        run('android-build', ['gradle', '--no-daemon', 'lintDebug', 'testDebugUnitTest', 'assembleDebug'], ROOT / 'tools/packager/android', timeout=2100)
    else:
        report['gates']['android-build'] = {'status': 'not_run'}
    if args.peer_lock:
        run('peer-dependency-audit',[sys.executable,'tests/dependency-audit.py',str(args.peer_lock.resolve())],timeout=90)
    report['source_fingerprint_after'] = source_fingerprint()
    required = [g for name, g in report['gates'].items() if name not in (({'android-build'} if not args.android else set())|({'debian-package'} if not args.debian else set()))]
    # Endurance is required for automated beta qualification; omission remains explicit.
    report['automated_gates_passed'] = all(g['status'] == 'pass' for g in required) and report['source_fingerprint_before'] == report['source_fingerprint_after']
    report['manual_acceptance_confirmed'] = False
    report['release_certified'] = False
    save()
    print('Automated gates:', 'PASS' if report['automated_gates_passed'] else 'NOT COMPLETE', '\nManual acceptance remains required.', flush=True)
    return 0 if report['automated_gates_passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
