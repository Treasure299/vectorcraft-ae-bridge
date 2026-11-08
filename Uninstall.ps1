param([string]$AfterEffectsRoot = 'D:\Adobe files\Adobe After Effects 2026\Support Files')
$ErrorActionPreference = 'Stop'
$target = Join-Path $AfterEffectsRoot 'Scripts\ScriptUI Panels\VectorCraft Bridge.jsx'
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force; Write-Output "Removed: $target" }
else { Write-Output 'The VectorCraft Bridge panel was not installed in that After Effects folder.' }
Write-Output 'The VectorCraft control-port setting was left in place because another integration may use it.'
