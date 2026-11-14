@echo off
REM ==============================================================================
REM CachyMusic Windows Standalone Workstation Launcher (v2.0.0)
REM ==============================================================================
setlocal enabledelayedexpansion

set "APP_DIR=%~dp0.."
cd /d "%APP_DIR%"

echo ========================================================
echo      CachyMusic Audio Workstation v2.0.0 (Windows)
echo ========================================================

REM 1. Prefer bundled portable PHP before falling back to system PATH PHP
set "PHP_BIN="
if exist "%APP_DIR%\php-win\php.exe" (
    set "PHP_BIN=%APP_DIR%\php-win\php.exe"
) else if exist "%APP_DIR%\php\php.exe" (
    set "PHP_BIN=%APP_DIR%\php\php.exe"
) else (
    for /f "delims=" %%I in ('where php 2^>nul') do (
        if "!PHP_BIN!"=="" set "PHP_BIN=%%I"
    )
)

set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%"

if "%PHP_BIN%"=="" (
    echo [WARN] PHP not found locally; launching Standalone Browser PWA fallback...
    set "URL=http://127.0.0.1:%PORT%/index.html"
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        start /b "" python -m http.server %PORT% --bind 127.0.0.1 >nul 2>nul
        timeout /t 1 /nobreak >nul
    )
    goto :launch_ui
)

REM 2. Check if PHP workstation backend is already listening on port 8000
powershell -Command "try { $client = New-Object System.Net.Sockets.TcpClient('127.0.0.1', %PORT%); $client.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if %errorlevel% neq 0 (
    echo Starting CachyMusic PHP workstation server on port %PORT%...
    start /b "" "%PHP_BIN%" -S 127.0.0.1:%PORT% index.php >nul 2>nul
    timeout /t 1 /nobreak >nul
)

:launch_ui
REM 3. Launch dedicated App window via Edge or Chrome (SMTC MediaSession enabled, clean Chromium flags)
where msedge >nul 2>nul
if %errorlevel% equ 0 (
    start msedge --app="%URL%" --user-data-dir="%LOCALAPPDATA%\CachyMusic" --disable-features=HardwareMediaKeyHandling,MediaSessionService
    goto :done
)

where chrome >nul 2>nul
if %errorlevel% equ 0 (
    start chrome --app="%URL%" --user-data-dir="%LOCALAPPDATA%\CachyMusic" --disable-features=HardwareMediaKeyHandling,MediaSessionService
    goto :done
)

start "" "%URL%"

:done
echo CachyMusic is running at %URL%
exit /b 0
