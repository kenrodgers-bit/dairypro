$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$envFile = Join-Path $root 'server\.env'
$offlineEnv = Join-Path $root 'server\.env.offline.example'

if (-not (Test-Path $envFile)) {
  Copy-Item $offlineEnv $envFile
  Write-Host 'Created server\.env from server\.env.offline.example.'
  Write-Host 'Edit JWT_SECRET, make sure MongoDB is running locally, then run this script again.'
  exit 1
}

npm run offline:build
npm run offline:start
