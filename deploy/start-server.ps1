$ErrorActionPreference = 'Continue'
Set-Location "C:\Users\user\Desktop\2-этаж Ржд\server"
while ($true) {
    node --env-file-if-exists=../.env src/server.js *>> "C:\Users\user\Desktop\2-этаж Ржд\deploy\server.log"
    Add-Content "C:\Users\user\Desktop\2-этаж Ржд\deploy\server.log" "--- server exited, restarting in 5s ($(Get-Date)) ---"
    Start-Sleep -Seconds 5
}
