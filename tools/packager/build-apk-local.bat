@echo off
setlocal DisableDelayedExpansion
where java >nul 2>nul || (echo JDK 17 required. & exit /b 1)
if not defined ANDROID_HOME if not defined ANDROID_SDK_ROOT (echo Android SDK 34 required. & exit /b 1)
pushd "%~dp0android" || exit /b 1
if exist gradlew.bat (
    call gradlew.bat --no-daemon lintDebug testDebugUnitTest assembleDebug
) else (
    call gradle --no-daemon lintDebug testDebugUnitTest assembleDebug
)
set "RESULT=%errorlevel%"
popd
if not "%RESULT%"=="0" exit /b %RESULT%
if not exist "%~dp0android\app\build\outputs\apk\debug\app-debug.apk" exit /b 1
echo Built: "%~dp0android\app\build\outputs\apk\debug\app-debug.apk"
