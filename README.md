<p align="center">
  <img src="https://img.shields.io/badge/Codex_Habitat-v0.2.0--dev-8B5CF6?style=for-the-badge&logo=openai&logoColor=white" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Status-Alpha-f97316?style=for-the-badge" alt="Status" />
</p>

<h1 align="center">Codex Habitat</h1>
<h3 align="center"><em>The memory layer that knows <strong>you</strong>, not just your code.</em></h3>

<p align="center">
  <code>npx skills add https://github.com/peishenglai3-hash/codex-habit</code>
</p>

---

## Why This Exists

Existing agent memory systems remember **what you did to the code**.  
Codex Habitat remembers **who you are as a developer**.

| Existing tools | Codex Habitat |
|---|---|
| Remember file paths and diff hunks | Remember **your preferred stack and why** |
| Log terminal commands you ran | Log **patterns you rejected and why** |
| Store session transcripts | Store **your rhythm: plan-first? test-after-each?** |
| Need you to search | **Infer what you will do next** |

Every time you tell Codex "I prefer React over Vue", "I hate Redux", or "let me draft the structure first" — that is a **signal**. Codex Habitat captures it, connects it to other signals, builds a **habit graph**, and uses it to anticipate your next move.

---

## How It Works

```
  Your conversation with Codex
          │
          ▼
  SKILL.md ─── captures signals (preferences, rejections, workflow style)
          │
          ▼
  signal-capture.mjs  ─── writes to  ~/.codex-habit/signals/*.md
          │
          ▼
  habit-graph.mjs     ─── builds association graph
          │
          ▼
  pattern-matcher.mjs ─── extracts recurring patterns
          │
          ▼
  foresight-engine.mjs ─── predicts your next action
          │
          ▼
  context-injector.mjs ─── loads profile into next Codex session
          │
          ▼
    🔄 Every session makes the next one better
```

### Data Pipeline (Detailed)

```
  RAW SIGNALS                    PATTERNS                      FORESIGHTS
  ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
  │ preference:      │           │ When working on  │           │ "You started a   │
  │   react: 0.95    │ ────────► │ a frontend,     │ ────────► │  new frontend —  │
  │ rejection:       │   build   │ user reaches    │   infer   │  want me to      │
  │   redux: 0.85    │   graph   │ for React       │           │  scaffold it?"   │
  │ workflow:        │           │ + Tailwind      │           └─────────────────┘
  │   plan-first     │           └─────────────────┘
  └─────────────────┘
```

---

## Installation

### Prerequisites

- **Codex** desktop app
- **Node.js** 18+
- **Windows** (macOS/Linux support in development)

### Install

```powershell
# 1. Add the skill to Codex
npx skills add https://github.com/peishenglai3-hash/codex-habit

# 2. Initialize data directory
.\install.ps1
```

That is it. The skill activates automatically on your next Codex session.

### What Gets Installed

```
~/.codex-habit/                 ←  All your habit data (local, private)
├── signals/                    ←  Raw interaction signals
├── patterns/                   ←  Extracted recurring patterns
└── profile/                    ←  Your user profile + foresights

~/.agents/skills/codex-habit-skill/  ←  Core skill instructions
```

---

## Usage

### Built-in Commands

Talk to Codex naturally:

| You say | Codex Habitat does |
|---|---|
| "Show my habit profile" | Displays your full profile: preferences, working style, active patterns |
| "What patterns have you seen?" | Lists extracted patterns with confidence scores |
| "What should I do next?" | Runs foresight engine against current context |
| "That is wrong" | Records a correction, adjusts pattern confidence |
| "Forget that preference" | Archives the specific signal |
| "What do you know about me?" | Full transparency report |

### Detecting Signals

Habitat watches for these patterns automatically:

```yaml
# Explicit preferences
"I prefer React over Vue"
        ↓  captured as:  preference:tech_stack → react (confidence: 0.92)

# Rejections
"I hate Redux, too heavy"
        ↓  captured as:  rejection:library → redux (confidence: 0.88)

# Workflow signals
"Let me draft the structure first"
        ↓  captured as:  workflow:approach → plan_first (confidence: 0.85)
```

### Foresight Example

```
You: "I want to start a new API module"
        ↓
🔮 Habitat: "Based on your pattern when starting new modules:
    1. You define the data model first (100% of 4 occurrences)
    2. Then write the service layer (100%)
    3. Then add validation (75%)
    → Should I prepare the data model schema?"
```

---

## Project Structure

```
codex-habit/
│
├── .codex-plugin/
│   └── plugin.json                 # Plugin manifest (name, version, hooks)
│
├── .agents/skills/
│   └── codex-habit-skill/
│       └── SKILL.md                # 🧠 Core skill — the brain
│
├── hooks/
│   └── codex-hooks.json            # Lifecycle: SessionStart, PostToolUse, Stop
│
├── scripts/                        # Backend engines
│   ├── signal-capture.mjs          # Captures interaction signals
│   ├── habit-graph.mjs             # Builds association graph
│   ├── pattern-matcher.mjs         # Matches current context to patterns
│   ├── foresight-engine.mjs        # Generates predictions
│   ├── context-injector.mjs        # Injects profile into sessions
│   └── graph-data.mjs              # Visualization data bridge
│
├── outputs/
│   └── visualize.html              # Interactive graph viewer (open in browser)
│
├── data/profile/
│   └── template.md                 # Profile template for new users
│
├── install.ps1                     # Windows installer
├── .gitignore
├── LICENSE
└── README.md
```

---

## Data Privacy

**Everything stays on your machine.**

| Concern | How it is handled |
|---|---|
| **Where data lives** | `~/.codex-habit/` — local only |
| **Cloud sync** | Never. No telemetry, no analytics |
| **Format** | Plain Markdown — read, edit, delete freely |
| **Git** | `.gitignore` excludes `~/.codex-habit/` entirely |
| **Transparency** | Ask "What do you know about me?" for a complete dump |

Your profile is yours. It never leaves your home directory.

---

## Adaptability (Beyond Codex)

Codex Habitat is built natively for **Codex**, but its core — the SKILL.md instructions and signal-capture pipeline — is portable:

| Platform | Status | How |
|---|---|---|
| **Codex** | ✅ Native | Uses `.codex-plugin/` hooks + `.agents/skills/` |
| **Claude Code** | ⏳ Adaptable | SKILL.md works as a skill; hooks need `.claude-plugin/` conversion |
| **OpenClaw** | ⏳ Possible | SKILL.md content is readable; plugin format differs |
| **Cursor** | 🔄 Needs work | Rules system is `.cursorrules`; no lifecycle hooks |
| **Gemini CLI** | 🔄 Needs work | Different instruction format entirely |

**The core value is in the SKILL.md.** The signal taxonomy, pattern extraction logic, and foresight inference are all defined there. Porting to another platform means:
1. Translating the hooks config (PostToolUse → platform-equivalent callback)
2. Adapting the script paths to the platform's plugin directory

If you want to use Habitat on Claude Code or OpenClaw, the SKILL.md can be loaded directly as a skill on most platforms. The hooks (auto-capture) will need platform-specific shims.

---

## Roadmap

```
v0.1  ─── Signal capture + plugin skeleton                    ✅
v0.2  ─── Auto pattern extraction + semantic naming            ✅
v0.3  ─── Cross-session injection + proactive suggestions      🔜
v0.4  ─── Pattern visualization + confidence decay             🔜
v0.5  ─── Multi-platform hooks (Claude Code, OpenClaw)        🔜
v1.0  ─── Full resonance — anticipates needs before you ask   🎯
```

---

## Built With

Inspired by and learning from:
- [EverOS](https://github.com/EverMind-AI/EverOS) — self-evolving memory architecture
- [claude-mem](https://github.com/thedotmack/claude-mem) — session hooks and observation model
- [nocturne_memory](https://github.com/Dataojitori/nocturne_memory) — identity persistence across agents

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <sub>Codex Habitat · Built one conversation at a time</sub>
</p>
