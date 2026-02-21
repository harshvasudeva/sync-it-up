@echo off
echo ================================================
echo   SyncTabs Server - Setup ^& Start
echo ================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [OK] Node.js found: 
node --version

:: Install dependencies
echo.
echo [*] Installing server dependencies...
cd /d "%~dp0server"
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo [OK] Dependencies installed.
echo.
echo ================================================
echo   Starting SyncTabs Server...
echo   Press Ctrl+C to stop.
echo ================================================
echo.

node server.js

pause
