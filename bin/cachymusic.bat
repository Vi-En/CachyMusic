@echo off
REM ==============================================================================
REM CachyMusic Windows Standalone Launcher
REM ==============================================================================
setlocal enabledelayedexpansion

set "APP_DIR=%~dp0.."
cd /d "%APP_DIR%"

echo ========================================================
echo          CachyMusic Audio Workstation (Windows)          
echo ========================================================

REM 1. Verify PHP availability
where php >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] PHP is required but not found in PATH.
    echo Please install PHP (e.g. via 'winget install PHP.PHP' or https://windows.php.net)
    echo and ensure it is added to your system PATH.
    pause
    exit /b 1
)

set "PORT=8000"

REM 2. Check if PHP server is already running on port 8000
powershell -Command "try { $client = New-Object System.Net.Sockets.TcpClient('127.0.0.1', %PORT%); $client.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if %errorlevel% neq 0 (
    echo Starting CachyMusic backend on port %PORT%...
    start /b "" php -S 127.0.0.1:%PORT% index.php >nul 2>nul
    timeout /t 1 /nobreak >nul
)

REM 3. Launch UI in dedicated window using Edge or Chrome
set "URL=http://127.0.0.1:%PORT%"
where msedge >nul 2>nul
if %errorlevel% equ 0 (
    start msedge --app="%URL%" --user-data-dir="%LOCALAPPDATA%\CachyMusic"
    goto :done
)

where chrome >nul 2>nul
if %errorlevel% equ 0 (
    start chrome --app="%URL%" --user-data-dir="%LOCALAPPDATA%\CachyMusic"
    goto :done
)

REM Fallback to default browser
start "" "%URL%"

:done
echo CachyMusic is running at %URL%
exit /b 0

