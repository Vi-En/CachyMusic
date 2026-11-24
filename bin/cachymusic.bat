@echo off
setlocal DisableDelayedExpansion
where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%~dp0desktop-launcher.py" %*
    exit /b
)
where python >nul 2>nul
if errorlevel 1 (
    echo CachyMusic requires Python 3 and PHP 8.1+ in source mode. 1>&2
    exit /b 1
)
python "%~dp0desktop-launcher.py" %*
exit /b %errorlevel%
