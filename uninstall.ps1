param(
  [switch]$DeleteData,
  [switch]$KeepData
)

if ($DeleteData -and $KeepData) {
  throw "Use either -DeleteData or -KeepData, not both."
}

$HABIT_DIR = "$env:USERPROFILE\.codex-habit"
$PLUGIN_ROOT = $PSScriptRoot

Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Codex Habitat — Uninstall                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n🗑️  Removing plugin files..." -ForegroundColor Yellow
$filesToRemove = @(
  "$PLUGIN_ROOT\.agents\skills\codex-habit-skill",
  "$PLUGIN_ROOT\hooks\codex-hooks.json",
  "$PLUGIN_ROOT\.codex-plugin\plugin.json"
)

foreach ($f in $filesToRemove) {
  if (Test-Path $f) {
    Remove-Item -Recurse -Force $f -ErrorAction SilentlyContinue
    Write-Host "  ✅ Removed: $f"
  }
}

if ($DeleteData) {
  Write-Host "`n🗑️  Removing habit data by explicit request..." -ForegroundColor Yellow
  if (Test-Path $HABIT_DIR) {
    Remove-Item -Recurse -Force $HABIT_DIR -ErrorAction SilentlyContinue
    Write-Host "  ✅ Removed: $HABIT_DIR"
  }
} else {
  Write-Host "`n📦  Keeping habit data at $HABIT_DIR (pass -DeleteData to remove it)" -ForegroundColor Yellow
}

Write-Host "`n✅ Uninstall complete." -ForegroundColor Green
