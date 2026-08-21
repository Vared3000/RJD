@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\disaster-drill.ps1"
set "exitCode=%ERRORLEVEL%"
pause
exit /b %exitCode%
