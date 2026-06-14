param([switch]$KeepData)

$HABIT_DIR = "$env:USERPROFILE\.codex-habit"
$PLUGIN_ROOT = Split-Path -Parent $PSScriptRoot

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

if (-not $KeepData) {
  Write-Host "`n🗑️  Removing habit data (use -KeepData to preserve)..." -ForegroundColor Yellow
  if (Test-Path $HABIT_DIR) {
    Remove-Item -Recurse -Force $HABIT_DIR -ErrorAction SilentlyContinue
    Write-Host "  ✅ Removed: $HABIT_DIR"
  }
} else {
  Write-Host "`n📦  Keeping habit data at $HABIT_DIR" -ForegroundColor Yellow
}

Write-Host "`n✅ Uninstall complete." -ForegroundColor Green
