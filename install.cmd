@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install it, then run this file again.
  pause
  exit /b 1
)
node "%~dp0scripts\setup.mjs" --action install
set "ADDON_SETUP_EXIT=%errorlevel%"
pause
exit /b %ADDON_SETUP_EXIT%
