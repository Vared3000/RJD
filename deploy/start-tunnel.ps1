$ErrorActionPreference = 'Continue'
$logPath = "C:\Users\user\Desktop\2-этаж Ржд\deploy\tunnel.log"
while ($true) {
    & "C:\Users\user\bin\cloudflared.exe" tunnel --url http://localhost:4000 *>> $logPath
    Add-Content $logPath "--- tunnel exited, restarting in 5s ($(Get-Date)) ---"
    Start-Sleep -Seconds 5
}
