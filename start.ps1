$ErrorActionPreference = "Stop"

function Start-Backend {
  $backendPath = Join-Path $PSScriptRoot "backend"
  if (-not (Test-Path $backendPath)) { throw "Backend folder not found: $backendPath" }

  Start-Process -FilePath "cmd.exe" -ArgumentList @(
    "/k",
    "cd /d `"$backendPath`" && go mod tidy && go run ./cmd/atlas"
  )
}

function Start-Frontend {
  $frontendPath = Join-Path $PSScriptRoot "frontend"
  if (-not (Test-Path $frontendPath)) { throw "Frontend folder not found: $frontendPath" }

  Start-Process -FilePath "cmd.exe" -ArgumentList @(
    "/k",
    "cd /d `"$frontendPath`" && npm install && npm run dev"
  )
}

function Open-InVSCode {
  $rootPath = $PSScriptRoot
  Write-Host "Opening project in VS Code..." -ForegroundColor Cyan
  Start-Process -FilePath "code" -ArgumentList "." -WorkingDirectory $rootPath
}

Write-Host "Starting Atlas DB backend + frontend (CMD windows)..." -ForegroundColor Cyan
Open-InVSCode
Start-Backend
Start-Frontend
Write-Host "Done. Two CMD windows opened (backend + frontend)." -ForegroundColor Green
