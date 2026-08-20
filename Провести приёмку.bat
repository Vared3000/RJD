@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\acceptance.ps1"
set "result=%ERRORLEVEL%"
pause
exit /b %result%
