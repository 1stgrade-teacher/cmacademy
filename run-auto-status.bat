@echo off
title Auto-Status Setup

cd /d "%~dp0"

echo ============================================
echo   Working folder: %cd%
echo ============================================
echo.

echo ============================================
echo   Applying auto-status.js to all index.html files...
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0add-auto-status.ps1"

echo.
echo ============================================
echo   Done!
echo   Now open GitHub Desktop:
echo     1. Check the Changes tab
echo     2. Write a commit message
echo     3. Click Commit to main
echo     4. Click Push origin
echo ============================================
echo.
pause
