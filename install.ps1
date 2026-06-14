param([switch]$SkipBuild)

$HABIT_DIR = "$env:USERPROFILE\.codex-habit"
$PLUGIN_ROOT = Split-Path -Parent $PSScriptRoot

Write-Host "╔═══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Codex Habitat — Install v0.3             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n🔍 Checking dependencies..." -ForegroundColor Yellow
$nodeVer = node --version 2>$null
if (-not $nodeVer) { Write-Host "  ❌ Node.js not found" -ForegroundColor Red; exit 1 }
Write-Host "  ✅ Node.js $nodeVer"

Write-Host "`n📁 Creating data directory..." -ForegroundColor Yellow
@("$HABIT_DIR", "$HABIT_DIR\signals", "$HABIT_DIR\patterns\active",
  "$HABIT_DIR\patterns\archived", "$HABIT_DIR\profile") | ForEach-Object {
  if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}
Write-Host "  ✅ $HABIT_DIR"

Write-Host "`n📝 Initializing profile..." -ForegroundColor Yellow
$profileContent = @"
---
id: profile_default
created: $(Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
session_count: 0
status: bootstrapping
---

# User Profile

_This profile grows as we work together._
"@
Set-Content -Path "$HABIT_DIR\profile\index.md" -Value $profileContent -Encoding UTF8

$foresightsContent = @"
# Foresights — Multi-Valence Predictions

_No foresights yet. Start working to build patterns._
"@
Set-Content -Path "$HABIT_DIR\profile\foresights.md" -Value $foresightsContent -Encoding UTF8

Write-Host "  ✅ Profile initialized"

Write-Host "`n🔗 Installing skill..." -ForegroundColor Yellow
$skillDir = Join-Path $PLUGIN_ROOT ".agents\skills\codex-habit-skill"
if (Test-Path "$skillDir\SKILL.md") {
  Write-Host "  ✅ Skill found at $skillDir"
} else {
  Write-Host "  ⚠️  SKILL.md not found" -ForegroundColor Red
}

Write-Host "`n🧪 Verifying scripts..." -ForegroundColor Yellow
node (Join-Path $PLUGIN_ROOT "scripts\signal-capture.mjs") --buffer
node (Join-Path $PLUGIN_ROOT "scripts\habit-graph.mjs") --stats

Write-Host "`n═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ Installation Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "`n📂 Data: $HABIT_DIR"
Write-Host "📖 Skill: $PLUGIN_ROOT\.agents\skills\codex-habit-skill\SKILL.md"
Write-Host "🔄 Hub: $PLUGIN_ROOT\hub-manifest.json"
Write-Host "`n🚀 Try:"
Write-Host "  node `"$PLUGIN_ROOT\scripts\context-injector.mjs`" --all"
Write-Host "  node `"$PLUGIN_ROOT\scripts\foresight-engine.mjs`" --all"
Write-Host "  node `"$PLUGIN_ROOT\scripts\habit-graph.mjs`" --stats"
Write-Host "`n📖 Ask Codex: 'Show my habit profile'"
