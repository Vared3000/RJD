@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\backup-now.ps1"
set "result=%ERRORLEVEL%"
pause
exit /b %result%
