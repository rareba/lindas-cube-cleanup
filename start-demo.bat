@echo off
setlocal

echo ============================================
echo   LINDAS Cube Cleanup Demo Launcher
echo ============================================
echo.

set FUSEKI_DIR=%~dp0fuseki
set WEBAPP_DIR=%~dp0web-app
set FUSEKI_PID=
set WEBAPP_PID=
set STARTED_FUSEKI=0

:: Check if Fuseki is already running on port 3030
echo Checking if Fuseki is running...
netstat -ano | findstr ":3030.*LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Fuseki is already running on port 3030
) else (
    echo [..] Fuseki not running, starting it...

    :: Check if Fuseki directory exists
    if not exist "%FUSEKI_DIR%\fuseki-server.bat" (
        echo [ERROR] Fuseki not found at %FUSEKI_DIR%
        echo Please run scripts\setup-fuseki.ps1 first
        pause
        exit /b 1
    )

    :: Start Fuseki in background
    cd /d "%FUSEKI_DIR%"
    start "Fuseki Server" /min cmd /c "fuseki-server.bat"
    set STARTED_FUSEKI=1

    :: Wait for Fuseki to start
    echo [..] Waiting for Fuseki to start...
    timeout /t 5 /nobreak >nul

    :: Verify Fuseki started
    netstat -ano | findstr ":3030.*LISTENING" >nul 2>&1
    if %errorlevel%==0 (
        echo [OK] Fuseki started successfully
    ) else (
        echo [WARNING] Fuseki may still be starting...
    )
)

echo.

:: Check if web app is already running on port 3001
echo Checking if Web App is running...
netstat -ano | findstr ":3001.*LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Web App is already running on port 3001
) else (
    echo [..] Starting Web App...

    :: Check if web app directory exists
    if not exist "%WEBAPP_DIR%\server.js" (
        echo [ERROR] Web App not found at %WEBAPP_DIR%
        pause
        exit /b 1
    )

    :: Check if node_modules exists
    if not exist "%WEBAPP_DIR%\node_modules" (
        echo [..] Installing npm dependencies...
        cd /d "%WEBAPP_DIR%"
        call npm install
    )

    :: Start Web App in background
    cd /d "%WEBAPP_DIR%"
    start "LINDAS Web App" /min cmd /c "node server.js"

    :: Wait for Web App to start
    timeout /t 3 /nobreak >nul
    echo [OK] Web App started
)

echo.
echo ============================================
echo   Demo is ready!
echo ============================================
echo.
echo   Fuseki:   http://localhost:3030
echo   Web App:  http://localhost:3001
echo.
echo   Opening Web App in browser...
start http://localhost:3001
echo.
echo ============================================
echo   Press ENTER to shutdown both services
echo ============================================
pause >nul

echo.
echo Shutting down...

:: Kill Web App (node processes on port 3001)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001.*LISTENING"') do (
    echo Stopping Web App (PID: %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill Fuseki only if we started it
if %STARTED_FUSEKI%==1 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3030.*LISTENING"') do (
        echo Stopping Fuseki (PID: %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
    :: Also kill any Java processes that might be Fuseki
    taskkill /F /FI "WINDOWTITLE eq Fuseki Server" >nul 2>&1
)

echo.
echo [OK] Demo shutdown complete
timeout /t 2 >nul
