@echo off
rem =====================================================================
rem  WorkSync - detached backend starter
rem ---------------------------------------------------------------------
rem  This is a companion helper for start-WorkSync.bat. It runs `npm start`
rem  for the WorkSync backend in its own (minimized) window so the backend
rem  keeps running independently of the launcher and of WorkSync.exe.
rem
rem  It sets NODE_ENV=development only for the backend process it spawns
rem  (via the Windows `set` command). It does not contain or need any
rem  PostgreSQL password, JWT secret, or DATABASE_URL - the backend keeps
rem  loading those from the project's .env file.
rem =====================================================================

setlocal
set "NODE_ENV=development"

rem  %~dp0 is this script's own folder (project root), so this works even
rem  when the project folder path contains spaces.
cd /d "%~dp0backend"

echo.
echo  ============================================
echo  WorkSync Backend
echo  ============================================
echo  NODE_ENV           = %NODE_ENV%
echo  Working directory  = %CD%
echo.

where npm >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] npm was not found on PATH.
    echo          Install Node.js from https://nodejs.org and try again.
    pause
    exit /b 1
)

rem `npm start` == `node server.js` (see backend/package.json).
call npm start

echo.
echo  The WorkSync backend has stopped. Closing this window.
pause
exit /b 0