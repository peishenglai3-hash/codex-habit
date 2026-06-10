#!/usr/bin/env node
/**
 * pattern-matcher.mjs — Habit Resonance Pattern Matcher
 *
 * Given current context, finds matching patterns from the habit graph.
 * Returns ranked foresight candidates.
 *
 * Usage:
 *   node pattern-matcher.mjs --match <context-json>
 *   node pattern-matcher.mjs --search <query>
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const PATTERNS_ACTIVE = join(HABIT_DIR, "patterns", "active");
const GRAPH_FILE = join(HABIT_DIR, ".graph_state.json");

function readPatterns() {
  const patterns = [];
  if (!existsSync(PATTERNS_ACTIVE)) return patterns;

  const files = readdirSync(PATTERNS_ACTIVE).filter(f => f.endsWith(".md"));
  for (const f of files) {
    const content = readFileSync(join(PATTERNS_ACTIVE, f), "utf-8");
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      try {
        const meta = {};
        match[1].split("\n").forEach(line => {
          const idx = line.indexOf(": ");
          if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 2).trim();
        });
        patterns.push({ id: f.replace(".md", ""), ...meta });
      } catch {}
    }
  }
  return patterns;
}

function matchPatterns(context, patterns) {
  const ctx = context.toLowerCase();
  const scored = patterns.map(p => {
    const trigger = (p.trigger || "").toLowerCase();
    const action = (p.action || "").toLowerCase();

    // Simple keyword matching
    const ctxWords = ctx.split(/\s+/);
    const triggerWords = trigger.split(/\s+/);
    const matches = triggerWords.filter(w => ctxWords.includes(w)).length;
    const score = triggerWords.length > 0 ? matches / triggerWords.length : 0;

    return {
      pattern: p,
      matchScore: score,
      confidence: parseFloat(p.confidence || "0"),
      combinedScore: score * 0.6 + parseFloat(p.confidence || "0") * 0.4,
    };
  });

  return scored
    .filter(s => s.combinedScore > 0.15)
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 5);
}

const arg = process.argv[2];

switch (arg) {
  case "--match": {
    let input = "";
    process.stdin.on("data", chunk => (input += chunk));
    process.stdin.on("end", () => {
      try {
        const context = JSON.parse(input).context || input;
        const patterns = readPatterns();
        const matches = matchPatterns(context, patterns);
        console.log(JSON.stringify({
          status: "ok",
          totalPatterns: patterns.length,
          matches: matches.length,
          results: matches,
        }));
      } catch (e) {
        console.error(JSON.stringify({ error: e.message }));
      }
    });
    break;
  }
  case "--search": {
    const query = process.argv[3] || "";
    const patterns = readPatterns();
    const results = patterns.filter(p => {
      const searchText = `${p.trigger || ""} ${p.action || ""} ${p.contexts || ""}`.toLowerCase();
      return searchText.includes(query.toLowerCase());
    });
    console.log(JSON.stringify({ status: "ok", query, count: results.length, results }));
    break;
  }
  default:
    console.log(JSON.stringify({ usage: "node pattern-matcher.mjs [--match | --search]" }));
}
