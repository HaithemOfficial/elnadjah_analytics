param(
  [Parameter(Mandatory = $true)]
  [string]$Host,

  [Parameter(Mandatory = $true)]
  [string]$User,

  [Parameter(Mandatory = $true)]
  [string]$AppPath,

  [string]$Pm2AppName = "elnadjah-backend"
)

$ErrorActionPreference = "Stop"

$localEnv = Join-Path $PSScriptRoot "..\backend\.env"
if (-not (Test-Path $localEnv)) {
  throw "Local backend/.env not found at $localEnv"
}

$remoteEnv = "$User@${Host}:$AppPath/backend/.env"
$remoteCmd = "cd $AppPath/backend && npm ci --omit=dev && pm2 restart $Pm2AppName && pm2 save"

Write-Host "Uploading backend/.env to $remoteEnv ..."
scp "$localEnv" "$remoteEnv"

Write-Host "Pulling latest code and restarting PM2 app on VPS ..."
ssh "$User@$Host" "cd $AppPath && git pull origin main && $remoteCmd"

Write-Host "Done. VPS env synced and backend restarted."
