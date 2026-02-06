@echo off
REM
REM Generic Build Script for Foundry VTT Modules
REM Creates a distributable ZIP package in the releases\ folder
REM Auto-detects module ID, version, and GitHub URL from module.json
REM

setlocal EnableDelayedExpansion

REM Change to script directory (allows running from anywhere)
cd /d "%~dp0"

REM ─── Read module.json ──────────────────────────────────────────────

if not exist "module.json" (
    echo [ERROR] module.json not found!
    exit /b 1
)

REM Extract fields from module.json using PowerShell
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content 'module.json' | ConvertFrom-Json).id"`) do set "MODULE_ID=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content 'module.json' | ConvertFrom-Json).version"`) do set "VERSION=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$m = Get-Content 'module.json' | ConvertFrom-Json; if ($m.url) { $m.url }"`) do set "GITHUB_URL=%%i"

if "%MODULE_ID%"=="" (
    echo [ERROR] Could not extract module id from module.json
    exit /b 1
)

if "%VERSION%"=="" (
    echo [ERROR] Could not extract version from module.json
    exit /b 1
)

REM Output file name
set "OUTPUT_FILE=%MODULE_ID%-v%VERSION%.zip"

echo ========================================
echo   Foundry VTT Module - Build Script
echo ========================================
echo.
echo   Module:  %MODULE_ID%
echo   Version: %VERSION%
echo.

REM ─── Check project files ───────────────────────────────────────────

echo [1/6] Checking project files...

REM Required files
set "INCLUDE_FILES=module.json"

REM Optional files
for %%f in (README.md LICENSE CHANGELOG.md) do (
    if exist "%%f" (
        set "INCLUDE_FILES=!INCLUDE_FILES! %%f"
    )
)

REM Detect existing directories
set "INCLUDE_DIRS="
for %%d in (scripts lang styles templates assets packs icons images fonts) do (
    if exist "%%d\" (
        if "!INCLUDE_DIRS!"=="" (
            set "INCLUDE_DIRS=%%d"
        ) else (
            set "INCLUDE_DIRS=!INCLUDE_DIRS! %%d"
        )
    )
)

echo   Files: %INCLUDE_FILES%
echo   Dirs:  %INCLUDE_DIRS%
echo   OK

REM ─── Create releases directory ─────────────────────────────────────

echo [2/6] Creating releases directory...
if not exist "releases\" mkdir releases
echo   OK

REM ─── Create temporary staging directory ────────────────────────────

echo [3/6] Creating temporary staging directory...
set "TEMP_DIR=%TEMP%\fvtt-build-%MODULE_ID%-%RANDOM%"
mkdir "%TEMP_DIR%"
if errorlevel 1 (
    echo [ERROR] Failed to create temp directory
    exit /b 1
)
echo   OK

REM ─── Stage files ───────────────────────────────────────────────────

echo [4/6] Staging files for packaging...

REM Copy files
for %%f in (%INCLUDE_FILES%) do (
    if exist "%%f" (
        copy /y "%%f" "%TEMP_DIR%\" >nul
        echo   Copied: %%f
    )
)

REM Copy directories
for %%d in (%INCLUDE_DIRS%) do (
    if exist "%%d\" (
        xcopy /e /i /q /y "%%d" "%TEMP_DIR%\%%d" >nul
        echo   Copied: %%d\
    )
)

REM ─── Update download URL in staged module.json ────────────────────

echo [5/6] Updating module.json download URL...

if not "%GITHUB_URL%"=="" (
    REM Use PowerShell to update the download URL
    powershell -NoProfile -Command ^
        "$json = Get-Content '%TEMP_DIR%\module.json' -Raw | ConvertFrom-Json; " ^
        "$ghPath = '%GITHUB_URL%' -replace 'https://github.com/', ''; " ^
        "$json.download = 'https://github.com/' + $ghPath + '/releases/download/v%VERSION%/%OUTPUT_FILE%'; " ^
        "$json | ConvertTo-Json -Depth 10 | Set-Content '%TEMP_DIR%\module.json' -Encoding UTF8"
    echo   Download URL updated
) else (
    echo   Skipped ^(no GitHub url in module.json^)
)

REM ─── Create ZIP archive ───────────────────────────────────────────

echo [6/6] Creating ZIP archive...

REM Remove existing release file if it exists
if exist "releases\%OUTPUT_FILE%" (
    del /f "releases\%OUTPUT_FILE%"
)

REM Get absolute path for output
set "OUTPUT_PATH=%~dp0releases\%OUTPUT_FILE%"

REM Create ZIP using PowerShell Compress-Archive
powershell -NoProfile -Command "Compress-Archive -Path '%TEMP_DIR%\*' -DestinationPath '%OUTPUT_PATH%' -Force"

if errorlevel 1 (
    echo [ERROR] Failed to create ZIP file
    rd /s /q "%TEMP_DIR%" 2>nul
    exit /b 1
)
echo   OK

REM Clean up temp directory
rd /s /q "%TEMP_DIR%" 2>nul

REM ─── Verify and report ────────────────────────────────────────────

if not exist "releases\%OUTPUT_FILE%" (
    echo [ERROR] Failed to create ZIP file
    exit /b 1
)

REM Get file size
for /f "usebackq delims=" %%s in (`powershell -NoProfile -Command "(Get-Item 'releases\%OUTPUT_FILE%').Length / 1KB | ForEach-Object { '{0:N1} KB' -f $_ }"`) do set "ZIP_SIZE=%%s"

echo.
echo ========================================
echo   Build Successful!
echo ========================================
echo.
echo   Output:  releases\%OUTPUT_FILE%
echo   Size:    !ZIP_SIZE!
echo.
echo   ZIP Contents:
powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::OpenRead('releases\%OUTPUT_FILE%').Entries | ForEach-Object { '    ' + $_.FullName + ' (' + $_.Length + ' bytes)' }"
echo.
echo   GitHub release command:
echo     gh release create v%VERSION% releases\%OUTPUT_FILE% module.json --title "v%VERSION%"
echo.

endlocal
