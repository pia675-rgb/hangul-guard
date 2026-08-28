@echo off
cd /d "%~dp0"
title English Guard
echo.
echo  English Guard  - local scanner
echo  Close this window when you are done.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 (
  echo.
  echo PowerShell failed. Trying Python...
  where py >nul 2>&1 && (
    start "" "http://127.0.0.1:8765/"
    py -m http.server 8765 --bind 127.0.0.1
    goto :eof
  )
  where python >nul 2>&1 && (
    start "" "http://127.0.0.1:8765/"
    python -m http.server 8765 --bind 127.0.0.1
    goto :eof
  )
  echo Could not start. Ask IT to allow PowerShell on this PC.
  pause
)
