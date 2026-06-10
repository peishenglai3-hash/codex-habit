# Codex Habit Resonance Kernel

> **The memory layer that knows you, not just your code.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Codex](https://img.shields.io/badge/Codex-plugin-8B5CF6?logo=openai&logoColor=white)]()
[![Version](https://img.shields.io/badge/version-0.2.0--dev-22c55e)]()

A skill + plugin system for Codex that learns your working habits, builds a preference graph, and proactively suggests your next moves — the more you use it, the better it understands you.

## Why This Exists

Existing agent memory systems (claude-mem, EverOS) remember **what you did to the code**. This remembers **who you are as a coder**:

| Dimension | What it tracks |
|---|---|
| **Prefers** | tech stacks, patterns, paradigms you choose repeatedly |
| **Rejects** | approaches, libraries, architectures you declined |
| **Rhythm** | do you plan-first or build-first? test-after-each or batch-test? |
| **Style** | communicate in tradeoffs? code-first? options-first? |
| **Context** | project domains, task types, constraints you mention |

## How It Works

```
Your Interaction
      ↓
SKILL.md instructions → Codex captures signals
      ↓
signal-capture.mjs  →  ~/.codex-habit/signals/*.md
      ↓
habit-graph.mjs     →  builds association graph
      ↓
pattern-matcher.mjs →  finds recurring patterns
      ↓
foresight-engine.mjs → predicts next actions
      ↓
context-injector.mjs → injects profile into next session
      ↓
            🔄  Every session makes the next one better
```

## Quick Start

```bash
# 1. Install the skill
npx skills add https://github.com/<your-username>/codex-habit

# 2. Initialize data directory
.\install.ps1   # Windows
# OR: ./install.sh  # macOS/Linux (coming soon)

# 3. Start working — the system learns automatically
#    Ask Codex: "Show my habit profile"
```

## Project Structure

```
codex-habit/
├── .codex-plugin/
│   └── plugin.json              # Plugin manifest
├── .agents/skills/
│   └── codex-habit-skill/
│       └── SKILL.md             # 🧠 Core skill (the brain)
├── hooks/
│   └── codex-hooks.json         # Lifecycle hooks
├── scripts/
│   ├── signal-capture.mjs       # Signal capture
│   ├── habit-graph.mjs          # Graph builder
│   ├── pattern-matcher.mjs      # Pattern matching
│   ├── foresight-engine.mjs     # Foresight inference
│   ├── context-injector.mjs     # Context injection
│   └── graph-data.mjs           # Visualization data bridge
├── outputs/
│   └── visualize.html           # Interactive graph viewer
├── data/profile/
│   └── template.md              # Profile template
├── install.ps1                  # Windows installer
└── .gitignore
```

## Data Privacy

**All data stays local.** Your `~/.codex-habit/` directory never leaves your machine. No telemetry, no cloud sync. Your profile is plain Markdown — you can read, edit, or delete it anytime.

## Roadmap

- **v0.1** — Signal capture + plugin skeleton ✅
- **v0.2** — Auto pattern extraction + semantic naming ✅
- **v0.3** — Cross-session context injection + proactive suggestions
- **v0.4** — Pattern visualization + multi-user support
- **v1.0** — Full resonance (anticipates needs before you ask)

## Built With

Inspired by [EverOS](https://github.com/EverMind-AI/EverOS), [claude-mem](https://github.com/thedotmack/claude-mem), and [nocturne_memory](https://github.com/Dataojitori/nocturne_memory).

## License

MIT
