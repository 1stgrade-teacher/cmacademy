@echo off
chcp 65001 >nul
cd /d "%~dp0"
python "정리실행.py" || py "정리실행.py"
pause
