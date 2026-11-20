@echo off
cd /d "%~dp0"
echo === 1/3 current state ===
git status -sb
echo.
echo === 2/3 pull (bring in the exam-bank-bot commit from GitHub) ===
git pull --no-rebase --no-edit origin main
if errorlevel 1 goto fail
echo.
echo === 3/3 push ===
git push origin main
if errorlevel 1 goto fail
echo.
echo DONE: pushed. Vercel will deploy in a minute or two.
pause
exit /b 0
:fail
echo.
echo FAILED - read the message above. Nothing was forced or deleted.
pause
exit /b 1
