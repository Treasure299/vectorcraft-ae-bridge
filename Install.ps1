param(
    [string]$AfterEffectsRoot = 'D:\Adobe files\Adobe After Effects 2026\Support Files',
    [int]$VectorCraftPort = 7979
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $projectRoot 'dist\VectorCraft Bridge.jsx'
$panelFolder = Join-Path $AfterEffectsRoot 'Scripts\ScriptUI Panels'
$target = Join-Path $panelFolder 'VectorCraft Bridge.jsx'
if (-not (Test-Path -LiteralPath $source)) { throw 'Build first with: npm run build' }
if (-not (Test-Path -LiteralPath $panelFolder)) { throw "After Effects ScriptUI Panels folder not found: $panelFolder" }
Copy-Item -LiteralPath $source -Destination $target -Force
[Environment]::SetEnvironmentVariable('VECTORCRAFT_CONTROL_PORT', [string]$VectorCraftPort, 'User')
Write-Output "Installed panel: $target"
Write-Output "Set VECTORCRAFT_CONTROL_PORT=$VectorCraftPort for your user account."
Write-Output 'Restart VectorCraft and After Effects, then open Window > VectorCraft Bridge.jsx.'
