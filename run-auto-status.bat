@echo off
title Auto-Status Setup

echo ============================================
echo   Step 1: Applying auto-status.js to all index.html files...
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0add-auto-status.ps1"

echo.
echo ============================================
echo   Step 2: Uploading changes to GitHub...
echo ============================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [Notice] Git command was not found on this computer.
    echo Please open GitHub Desktop instead, then click Commit and Push origin.
    echo.
    pause
    exit /b
)

cd /d "%~dp0"
git add -A
git commit -m "Apply auto-status GO/pending display script to all pages"
git push

echo.
echo ============================================
echo   Done! Vercel will automatically redeploy in a minute or two.
echo   Refresh the site after that to check the result.
echo ============================================
echo.
pause
