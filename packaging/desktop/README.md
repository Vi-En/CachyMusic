# Portable Desktop Packaging (Linux & Windows)

Stages a self-contained Electron desktop build with bundled local PHP, Node.js, `slsk-client`, and FFmpeg/ffprobe binaries. The desktop shell binds dedicated loopback ports (`18478`/`18479`) with per-launch tokens, renderer sandboxing, and context isolation, and terminates child processes on exit.

## Required Build Inputs

Prepare platform-matched inputs on the build machine:

```text
electron-dist/              # Electron distribution (electron[.exe], resources/, libraries, notices)
runtime/
  php/php[.exe]             # PHP CLI with curl, openssl, and sqlite3 extensions
  node/node[.exe]           # Node.js 22+
  tools/ffmpeg[.exe]        # FFmpeg binary
  tools/ffprobe[.exe]       # FFprobe binary
node_modules/slsk-client/   # Production slsk-client dependency tree
notices/
  DEPENDENCIES.json         # Dependency version/license/checksum manifest
  LICENSES/                 # Third-party license texts and notices
```

## Staging Command

```sh
python3 packaging/desktop/stage.py \
  --platform linux \
  --electron electron-dist \
  --runtime runtime \
  --node-modules node_modules \
  --notices notices \
  --output CachyMusic-linux
```

Use `--platform windows` with Windows runtime inputs. Launch the staged `electron` or `electron.exe` binary from the output directory.
