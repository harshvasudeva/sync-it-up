@echo off
REM Pack Chrome extension into .crx format
REM
REM Usage: pack-extension.bat
REM
REM Requirements:
REM - extension.pem (your private key, stored locally)
REM - Chrome/Chromium installed
REM
REM Note: This is primarily for development/distribution.
REM       For Chrome Web Store, submit the extension\ folder directly.

setlocal enabledelayedexpansion

set "EXTENSION_DIR=%CD%\extension"
set "PEM_FILE=%CD%\extension.pem"
set "DIST_DIR=%CD%\dist"
set "OUTPUT_CRX=%DIST_DIR%\synctabs-extension.crx"

echo.
echo 🔨 Packing SyncTabs Extension...
echo.

REM Check for .pem file
if not exist "%PEM_FILE%" (
    echo ❌ Error: extension.pem not found!
    echo    Expected at: %PEM_FILE%
    echo.
    echo The .pem file is your private extension signing key.
    echo Keep it safe and NEVER commit to git.
    echo.
    echo To generate a new key:
    echo   1. Open chrome://extensions/
    echo   2. Enable Developer mode ^(top-right^)
    echo   3. Click "Pack extension"
    echo   4. Select the extension\ folder
    echo   5. Save the generated key as extension.pem
    echo.
    pause
    exit /b 1
)

echo ✓ Found extension.pem
echo.

REM Ensure dist directory exists
if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"

REM Find Chrome executable
set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Users\%USERNAME%\AppData\Local\Google\Chrome\Application\chrome.exe" (
    set "CHROME=C:\Users\%USERNAME%\AppData\Local\Google\Chrome\Application\chrome.exe"
)

if "!CHROME!"=="" (
    echo ⚠️  Chrome not found in standard locations
    echo.
    echo Option 1: Use Chrome's built-in packing
    echo   1. Open chrome://extensions/
    echo   2. Enable Developer mode
    echo   3. Click "Pack extension"
    echo   4. Select: extension\
    echo   5. Select key file: extension.pem
    echo.
    echo Option 2: Install Chrome
    echo   Download from https://www.google.com/chrome/
    echo.
    pause
    exit /b 1
)

echo 📦 Using Chrome at: !CHROME!
echo.
echo Packing extension...
echo.

REM Pack extension
"!CHROME!" ^
    --pack-extension="%EXTENSION_DIR%" ^
    --pack-extension-key="%PEM_FILE%" ^
    --no-message-box

REM Check if packing succeeded
REM Chrome outputs to extension.crx in the parent directory
if exist "%CD%\extension.crx" (
    move "%CD%\extension.crx" "%OUTPUT_CRX%"
    echo.
    echo ✨ Successfully packed extension!
    echo    Output: %OUTPUT_CRX%
    echo.
    echo 📦 Installation options:
    echo    1. Drag ^& drop: %OUTPUT_CRX% into chrome://extensions/
    echo    2. Sideload: chrome://extensions/ ^→ Load unpacked ^→ extension\ folder
    echo    3. Chrome Web Store: Submit extension\ folder directly
    echo.
    pause
) else (
    echo ⚠️  Chrome packing may have failed.
    echo    Try the manual method above.
    pause
    exit /b 1
)
