@echo off
chcp 65001 >nul
title auto-status 자동 적용

echo ============================================
echo   1단계: 모든 index.html에 auto-status.js 적용 중...
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0add-auto-status.ps1"

echo.
echo ============================================
echo   2단계: GitHub에 자동 업로드 시도 중...
echo ============================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [알림] Git 명령어를 이 컴퓨터에서 바로 찾지 못했습니다.
    echo 대신 GitHub Desktop 프로그램을 열어서
    echo Changes 탭 확인 -^> Commit -^> Push origin 버튼을 눌러주세요.
    echo.
    pause
    exit /b
)

cd /d "%~dp0"
git add -A
git commit -m "자동 상태(GO/준비중) 표시 스크립트 전체 적용"
git push

echo.
echo ============================================
echo   완료! 잠시 후 Vercel이 자동으로 새 사이트를 배포합니다.
echo   1~2분 뒤 사이트를 새로고침해서 확인해보세요.
echo ============================================
echo.
pause
