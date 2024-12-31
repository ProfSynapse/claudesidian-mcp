# postbuild.ps1

$SRC_PATH = ".\main.js"
$TARGET_PATH = "C:\Users\Joseph\Documents\Plugin_Tester\.obsidian\plugins\bridge-mcp\main.js"

Write-Host "Copying $SRC_PATH to $TARGET_PATH"
Copy-Item $SRC_PATH $TARGET_PATH -Force

Write-Host "`nStopping Obsidian (if running)..."
Stop-Process -Name "Obsidian" -ErrorAction SilentlyContinue

Start-Sleep -Seconds 1

Write-Host "Starting Obsidian..."
Start-Process "C:\Users\Joseph\AppData\Local\Obsidian\Obsidian.exe" `
  -ArgumentList "--vault", "C:\Users\Joseph\Documents\Plugin_Tester"

Write-Host "`nDone!"
