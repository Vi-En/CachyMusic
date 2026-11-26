# Portable Windows/Linux packaging (development foundation)

The desired full edition is one self-contained package, not a browser shortcut to an external daemon. The staging script creates an Electron portable directory with integrated local PHP and Node services, the existing `slsk-client` module, and audio tools. The shell uses dedicated loopback ports 18478/18479, a private per-launch token for each service, renderer sandboxing, context isolation, no Node access or remote navigation, and an outgoing renderer origin allowlist. It shuts down its own child processes when closed. Fixed ports preserve the browser storage origin; conflicts cause startup failure rather than connecting to an existing untrusted service.

Build machine inputs (same OS/architecture as target):

```
electron-dist/          # official, reviewed Electron distribution; electron[.exe], resources/, DLLs, libraries, notices
runtime/
  php/php[.exe]          # include required PHP config/extensions and dependent libraries, notably curl, openssl, SQLite
  node/node[.exe]        # Node 22+, include all required runtime libraries
  tools/ffmpeg[.exe]     # reviewed license-compatible build
  tools/ffprobe[.exe]
node_modules/slsk-client/ ... # audited locked production dependency tree (build-time installation only)
notices/
  DEPENDENCIES.json      # list of actual dependency/version/license/source/checksum records, reviewed by packager
  LICENSES/              # all required license texts, notices and corresponding-source materials/offers as applicable
```

On the build machine:

```
python3 packaging/desktop/stage.py --platform linux --electron electron-dist --runtime runtime --node-modules node_modules --notices notices --output CachyMusic-linux
```

Use `--platform windows` with corresponding Windows inputs. The portable output is a whole directory; launch its `electron` or `electron.exe`. Future release packaging should brand the binary and installer, sign it, verify hashes and publish complete matching source. No component download is performed by the staging script or app shell. OS-provided libraries still apply. The build must not depend on the target machine's system-installed PHP, Node, specific browser or FFmpeg.

**Not a finished package:** Native binary inputs are not present in this archive. Staging and launcher syntax were checked, but Electron startup, PHP extension resolution, bundled tools, native streaming, actual Soulseek search/download/upload, sharing, Linux OS-library dependencies, Windows library paths and UI integration require clean-system tests. The legacy Node client has not been fully audited and upload functionality is not validated. Do not publish this as a production-ready release or claim complete standalone operation. A smaller native core and new streaming audio engine remain future milestones. No external Nicotine+ daemon is launched by this new shell.

### Core-only distribution

Use `--core-only` and omit `--node-modules` to stage local playback without the optional Soulseek runtime. The supplied PHP, FFmpeg/FFprobe and Electron inputs still require provenance review, notices, actual builds and target-system acceptance. An optional peer-service startup or exit failure must not stop the core playback shell. The full edition still needs an audited, locked dependency tree; staging does not certify that tree.

### Required manifest format (dev.6.55)

`DEPENDENCIES.json` is a list of reviewed component entries containing `name`, `version`, `license`, public HTTPS `source`, `tree`, `notices` and a `files` object mapping every relative input path to its SHA-256 digest. Use trees `electron`, `runtime`, and `node-modules` (or `runtime-core` instead of `runtime` for core-only). Every runtime file must be covered exactly once, notices must be referenced under `LICENSES/`, and symlinks must be resolved in the supplied reviewed input tree. Unreviewed files, stale digests and a pre-existing Electron application payload are rejected before copying. See `THIRD-PARTY-NOTICES.md`. This is integrity validation, not a certification of a supplied license or publisher.

### Managed Windows external tools and lookup (dev.6.74)

For full Windows metadata/artwork/tag support, provide an audited Python runtime at `runtime/python/python.exe` with its required standard library, DLLs, notices and every runtime file covered by the existing input manifest. The shell stages its own supervisor source and probes the supplied interpreter before enabling external PHP tools. Without a successful probe, the portable shell refuses external PHP tool execution; basic playback remains available. It never silently uses system Python or downloads a runtime. PHP sodium support enables the optional encrypted content-bound lookup; missing sodium retains the authoritative full-read route. The staging test uses inert inputs, not actual Windows binaries.
