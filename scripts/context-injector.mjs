#!/usr/bin/env node
/**
 * context-injector.mjs — v0.3
 * Injects profile + top-3 active patterns + hub context preview
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const PROFILE_FILE = join(HABIT_DIR, "profile", "index.md");
const FORESIGHTS_FILE = join(HABIT_DIR, "profile", "foresights.md");
const PAT_ACTIVE = join(HABIT_DIR, "patterns", "active");

function parseFrontmatter(file) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf-8");
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(": ");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 2).trim();
  }
  return meta;
}

function injectProfile() {
  const p = parseFrontmatter(PROFILE_FILE);
  if (!p) return "No profile yet.";
  const lines = ["Your Habit Profile:"];
  const skip = new Set(["id", "created", "updated", "status", "session_count"]);
  for (const [k, v] of Object.entries(p)) {
    if (!skip.has(k) && v) {
      lines.push("  " + k.replace(/_/g, " ") + ": " + v);
    }
  }
  return lines.join("\n");
}

function topPatterns(n = 3) {
  if (!existsSync(PAT_ACTIVE)) return [];
  const pats = readdirSync(PAT_ACTIVE).filter(f => f.endsWith(".md")).slice(0, n).map(f => {
    try {
      const t = readFileSync(join(PAT_ACTIVE, f), "utf-8");
      const m = t.match(/^---\n([\s\S]*?)\n---/);
      if (!m) return null;
      const meta = {};
      for (const l of m[1].split("\n")) {
        const i = l.indexOf(": ");
        if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 2).trim();
      }
      return meta;
    } catch { return null; }
  }).filter(Boolean);
  return pats.slice(0, n);
}

function injectPatterns() {
  const pats = topPatterns(3);
  if (pats.length === 0) return null;
  const lines = ["Active Patterns:"];
  for (const p of pats) {
    const conf = Math.round((parseFloat(p.confidence || "0") || 0) * 100);
    lines.push("  \u2022 " + (p.trigger || "?") + " → " + (p.action || "?") + " (" + conf + "%)");
  }
  return lines.join("\n");
}

function injectForesights() {
  if (!existsSync(FORESIGHTS_FILE)) return null;
  const text = readFileSync(FORESIGHTS_FILE, "utf-8");
  const lines = text.split("\n").filter(l => l.startsWith("## ")).slice(0, 3);
  if (lines.length === 0) return null;
  return "Foresights (by value order):\n" + lines.map(l => "  " + l.replace("## ", "").slice(0, 50)).join("\n");
}

const arg = process.argv[2];
switch (arg) {
  case "--profile": console.log(injectProfile()); break;
  case "--patterns": console.log(injectPatterns() || "No patterns yet."); break;
  case "--all":
    console.log(injectProfile());
    console.log("");
    console.log(injectPatterns() || "");
    console.log("");
    console.log(injectForesights() || "");
    break;
  default:
    console.log(JSON.stringify({ usage: "node context-injector.mjs [--profile | --patterns | --all]" }));
}
