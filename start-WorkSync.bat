@echo off
rem =====================================================================
rem  WorkSync - one-click Windows launcher
rem ---------------------------------------------------------------------
rem  1. Checks whether the local backend is already running.
rem  2. If not running, starts it (via start-backend.cmd).
rem  3. Polls http://localhost:3000/api/health until it responds.
rem  4. Launches the installed WorkSync.exe (falls back to the project's
rem     release\win-unpacked\WorkSync.exe for development/testing).
rem
rem  - Does NOT start a second backend if one is already healthy.
rem  - Does NOT modify or duplicate the PostgreSQL database.
rem  - Does NOT expose the backend/database to the internet.
rem  - Does NOT contain any PostgreSQL password, JWT secret, or DATABASE_URL.
rem =====================================================================

setlocal EnableExtensions
title WorkSync Launcher

set "ROOT=%~dp0"
set "HEALTH_URL=http://localhost:3000/api/health"
set "POLL_SECONDS=30"

echo.
echo  ============================================
echo   WorkSync Launcher
echo  ============================================
echo  Project root : %ROOT%

if not exist "%ROOT%backend\server.js" (
    echo  [ERROR] Backend entry point not found:
    echo          "%ROOT%backend\server.js"
    echo          Run this launcher from the WorkSync project folder.
    exit /b 1
)

rem ---------------- PostgreSQL check (informational only) ----------------
call :check_database

rem ------------ Is the backend already healthy? (no duplicate) ------------
call :check_health
if not errorlevel 1 goto :backend_ready

echo.
echo  Backend is not responding yet. Checking port 3000...
rem If something is already listening on 3000 but not healthy, we must NOT
rem start a second backend (that would cause a port clash).
netstat -ano | findstr /c:":3000 " | findstr /i "LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo  [ERROR] Port 3000 is already in use but %HEALTH_URL% is not
    echo          responding successfully.
    echo          Another process may occupy port 3000, or the backend is
    echo          still starting up. Close the other process, wait a few
    echo          seconds, and re-run this launcher.
    exit /b 1
)

rem ------------------------------- Start backend --------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js was not found on PATH. Install Node.js and retry.
    exit /b 1
)

echo  Starting the backend in its own window...
rem Launch detached so the backend keeps running after this launcher closes.
start "WorkSync Backend" /min "%ROOT%start-backend.cmd"

echo.
echo  Waiting for health endpoint: %HEALTH_URL%
set /a waited=0

:wait_loop
timeout /t 1 /nobreak >nul 2>&1
set /a waited+=1
call :check_health
if not errorlevel 1 goto :backend_ready
if %waited% LSS %POLL_SECONDS% goto :wait_loop

echo.
echo  [ERROR] The WorkSync backend did not become healthy within
echo          %POLL_SECONDS% seconds.
echo.
echo  Possible causes:
echo    - PostgreSQL is not running (start the "postgresql-x64-*" service).
echo    - Port 3000 is already used by another program.
echo    - Node.js/npm could not start the backend.
echo.
echo  Look at the "WorkSync Backend" window for any error messages.
exit /b 1

:backend_ready
echo.
echo  [OK] Backend is running and healthy.

rem --------------------------- Locate WorkSync.exe ------------------------
set "WS_EXE="
if exist "%LOCALAPPDATA%\Programs\WorkSync\WorkSync.exe" set "WS_EXE=%LOCALAPPDATA%\Programs\WorkSync\WorkSync.exe"
if not defined WS_EXE if exist "%ROOT%release\win-unpacked\WorkSync.exe" set "WS_EXE=%ROOT%release\win-unpacked\WorkSync.exe"
if not defined WS_EXE (
    echo  [ERROR] Could not locate WorkSync.exe.
    echo          Install WorkSync under "%%LOCALAPPDATA%%\Programs\WorkSync",
    echo          or build it with "npm run dist" so it appears in
    echo          release\win-unpacked\WorkSync.exe.
    exit /b 1
)

echo  Launching : %WS_EXE%
start "" "%WS_EXE%"
echo  [OK] WorkSync should now appear on your screen.
exit /b 0

rem =====================================================================
rem  :check_health  ->  exit 0 if /api/health returns HTTP 200, else 1
rem =====================================================================
:check_health
where curl >nul 2>&1
if errorlevel 1 goto :ch_pwsh
curl -s -o nul -w "%%{http_code}" -m 3 "%HEALTH_URL%" 2>nul | findstr /x "200" >nul
exit /b %errorlevel%
:ch_pwsh
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 3;if($r.StatusCode -eq 200){exit 0}else{exit 1}}catch{exit 1}"
exit /b %errorlevel%

rem =====================================================================
rem  :check_database  ->  warn (never modify) if nothing listens on :5432
rem =====================================================================
:check_database
netstat -ano | findstr /c:":5432 " | findstr /i "LISTENING" >nul
if not errorlevel 1 exit /b 0
echo.
echo  [WARNING] Nothing appears to be listening on PostgreSQL port 5432.
echo            WorkSync stores its data in a local PostgreSQL database.
echo            If the PostgreSQL service is not running, login will fail.
echo            Start the PostgreSQL service and re-run this launcher.
echo            (This launcher does not modify PostgreSQL configuration.)
echo.
exit /b 0