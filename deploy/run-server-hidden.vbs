Set objShell = CreateObject("WScript.Shell")
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\user\Desktop\2-этаж Ржд\deploy\start-server.ps1""", 0, False
