# One-command local launch on Windows (Docker Desktop required).
#
#   .\scripts\start.ps1           # http://localhost
#   .\scripts\start.ps1 -Share    # also prints a public https:// URL anyone can open
param([switch]$Share)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function New-Secret {
    -join ((1..64) | ForEach-Object { "{0:x}" -f (Get-Random -Max 16) })
}

if (-not (Test-Path .env)) {
    Write-Host "==> Generating .env with fresh secrets"
    (Get-Content .env.example) `
        -replace '^DB_PASSWORD=.*', "DB_PASSWORD=$(New-Secret)" `
        -replace '^SECRET_KEY=.*', "SECRET_KEY=$(New-Secret)" `
        -replace '^QR_HMAC_SECRET=.*', "QR_HMAC_SECRET=$(New-Secret)" |
        Set-Content .env
}

Write-Host "==> Building images (first run takes a few minutes)"
docker compose build

Write-Host "==> Starting services"
if ($Share) { docker compose --profile share up -d } else { docker compose up -d }

Write-Host "==> Waiting for the backend to become healthy"
foreach ($i in 1..60) {
    try {
        Invoke-WebRequest -Uri http://localhost:8000/live -TimeoutSec 5 -UseBasicParsing | Out-Null
        break
    } catch { Start-Sleep -Seconds 5 }
}

$userCount = (docker compose exec -T db psql -U postgres -d maranatha_risk -tAc "SELECT count(*) FROM users" 2>$null | Out-String).Trim()
if (-not $userCount -or $userCount -eq "0") {
    Write-Host "==> Seeding demo data (first run only)"
    docker compose exec -T backend python reset_db.py
}

$webPort = ((Get-Content .env | Select-String '^WEB_PORT=') -split '=')[1]
if (-not $webPort) { $webPort = "80" }
Write-Host ""
Write-Host "App:      http://localhost:$webPort"
Write-Host "API docs: http://localhost:8000/docs"
Write-Host "Admin:    ADMIN/001 / Admin@1234"

if ($Share) {
    Write-Host "==> Fetching public share URL"
    $url = $null
    foreach ($i in 1..30) {
        $url = (docker compose logs tunnel 2>&1 |
            Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' |
            ForEach-Object { $_.Matches[0].Value } | Select-Object -First 1)
        if ($url) { break }
        Start-Sleep -Seconds 2
    }
    if (-not $url) { $url = "<not ready - run: docker compose logs tunnel>" }
    Write-Host "Share:    $url"
}
