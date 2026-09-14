@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ is required. Install it and reopen your terminal.
  pause
  exit /b 1
)
node "%~dp0scripts\services.mjs"
set "result=%errorlevel%"
if not "%result%"=="0" pause
exit /b %result%
