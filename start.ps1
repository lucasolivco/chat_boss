$root = $PSScriptRoot
$ngrok = "C:\Users\Canella e Santos\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\server'; node server.js"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\client'; npm run dev:host"

Write-Host "Aguardando o cliente subir..." -ForegroundColor Yellow
Start-Sleep 5

Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$ngrok' http 5173"

Write-Host ""
Write-Host "Pronto! Copie a URL 'Forwarding https://...' na janela do ngrok e mande pro colega." -ForegroundColor Green
