#!/usr/bin/env node
/**
 * pattern-matcher.mjs — v0.3 (Theory Upgrade)
 * Time decay + context-indexed matching + order-of-worth grouping
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const PAT_ACTIVE = join(HABIT_DIR, "patterns", "active");
const GRAPH_FILE = join(HABIT_DIR, ".graph_state.json");

const DECAY_RATE = 0.99; // confidence *= 0.99 per day since lastSeen

function readPatterns() {
  if (!existsSync(PAT_ACTIVE)) return [];
  return readdirSync(PAT_ACTIVE).filter(f => f.endsWith(".md")).map(f => {
    try {
      const t = readFileSync(join(PAT_ACTIVE, f), "utf-8");
      const m = t.match(/^---\n([\s\S]*?)\n---/);
      if (!m) return null;
      const meta = {};
      for (const l of m[1].split("\n")) {
        const i = l.indexOf(": ");
        if (i > 0) {
          const k = l.slice(0, i).trim();
          const v = l.slice(i + 2).trim();
          meta[k] = v;
        }
      }
      return meta;
    } catch { return null; }
  }).filter(Boolean);
}

/** Apply time decay: older patterns lose confidence */
function applyDecay(pattern) {
  const age = pattern.lastSeen
    ? (Date.now() - new Date(pattern.lastSeen).getTime()) / 86400000
    : 999;
  const decay = Math.pow(DECAY_RATE, age);
  return {
    ...pattern,
    confidence: (parseFloat(pattern.confidence || "0") || 0) * decay,
    rawConfidence: parseFloat(pattern.confidence || "0"),
    age: Math.round(age),
  };
}

/**
 * Context-indexed matching (Indexicality)
 * Groups patterns by order_of_worth, then matches within the current order
 */
function matchByContext(context, patterns) {
  const ctx = (context || "").toLowerCase();
  const ctxWords = ctx.split(/\s+/);

  // Detect current order_of_worth from context keywords
  const orderSignals = {
    inspirational: ["creative", "elegant", "new", "novel", "breakthrough", "beautiful"],
    domestic: ["tradition", "established", "convention", "senior", "always"],
    fame: ["industry standard", "popular", "trending", "everyone", "best practice"],
    civic: ["accessible", "inclusive", "open", "community", "ethical"],
    market: ["fast", "ship", "cost", "efficient", "competitive", "value"],
    industrial: ["architecture", "scalable", "testable", "reliable", "systematic"],
  };

  let currentOrder = "industrial"; // default
  let maxScore = 0;
  for (const [order, signals] of Object.entries(orderSignals)) {
    const score = signals.filter(s => ctx.includes(s)).length;
    if (score > maxScore) { maxScore = score; currentOrder = order; }
  }

  // Score patterns by context match + order match + decayed confidence
  const scored = patterns.map(p => {
    const trigger = (p.trigger || "").toLowerCase();
    const action = (p.action || "").toLowerCase();
    const ctxMatch = trigger.split(/\s+/).filter(w => ctxWords.includes(w)).length / Math.max(trigger.split(/\s+/).length, 1);
    const orderBonus = (p.order_of_worth || "industrial") === currentOrder ? 0.2 : 0;
    const decayed = applyDecay(p);
    const combined = ctxMatch * 0.4 + decayed.confidence * 0.4 + orderBonus * 0.2;
    return { pattern: p, score: combined, currentOrder };
  });

  return {
    currentOrder,
    matches: scored.filter(s => s.score > 0.12).sort((a, b) => b.score - a.score).slice(0, 10),
  };
}

const arg = process.argv[2];
switch (arg) {
  case "--match": {
    let input = "";
    process.stdin.on("data", c => input += c);
    process.stdin.on("end", () => {
      try {
        const ctx = input ? JSON.parse(input).context || input : "general";
        const patterns = readPatterns().map(p => applyDecay(p));
        const result = matchByContext(ctx, patterns);
        console.log(JSON.stringify({
          status: "ok",
          totalPatterns: patterns.length,
          currentOrder: result.currentOrder,
          matches: result.matches.length,
          results: result.matches,
        }));
      } catch (e) {
        console.error(JSON.stringify({ error: e.message }));
      }
    });
    break;
  }
  case "--stats": {
    const patterns = readPatterns();
    const total = patterns.length;
    const stale = patterns.filter(p => {
      const age = p.lastSeen ? (Date.now() - new Date(p.lastSeen).getTime()) / 86400000 : 999;
      return age > 30;
    }).length;
    console.log(JSON.stringify({ total, stale, active: total - stale }));
    break;
  }
  default:
    console.log(JSON.stringify({ usage: "node pattern-matcher.mjs [--match | --stats]" }));
}
