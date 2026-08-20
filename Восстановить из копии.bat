@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0deploy\windows\restore-ui.ps1"
set "result=%ERRORLEVEL%"
pause
exit /b %result%
