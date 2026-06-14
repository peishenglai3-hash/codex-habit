#!/usr/bin/env node
/**
 * hub-query.mjs — Hub Query Interface
 * Other skills call:  node scripts/hub-query.mjs --profile
 *                     node scripts/hub-query.mjs --context
 *                     node scripts/hub-query.mjs --signals
 * Returns structured JSON.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const PROFILE_FILE = join(HABIT_DIR, "profile", "index.md");
const INDEX_FILE = join(HABIT_DIR, ".signals_index.json");
const GRAPH_FILE = join(HABIT_DIR, ".graph_state.json");
const PAT_ACTIVE = join(HABIT_DIR, "patterns", "active");

function parseFrontmatter(file) {
  if (!existsSync(file)) return null;
  const t = readFileSync(file, "utf-8");
  const m = t.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const meta = {};
  for (const l of m[1].split("\n")) {
    const i = l.indexOf(": ");
    if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 2).trim();
  }
  return meta;
}

function queryProfile() {
  const p = parseFrontmatter(PROFILE_FILE);
  if (!p) return { status: "no_profile" };
  const skip = ["id", "created", "updated", "status"];
  const profile = {};
  for (const [k, v] of Object.entries(p)) {
    if (!skip.includes(k) && v) profile[k] = v;
  }
  return { status: "ok", profile };
}

function queryContext() {
  const idx = readJSON(INDEX_FILE, { signals: [] });
  const graph = readJSON(GRAPH_FILE, {});
  const recent = idx.signals.slice(-10).reverse();
  return {
    status: "ok",
    totalSignals: idx.signals.length,
    patterns: graph.patternCount || 0,
    adaptiveThreshold: graph.adaptiveThreshold || null,
    lastBuilt: graph.lastBuilt || null,
    recentSignals: recent.map(s => ({ type: s.type, category: s.category, value: s.value, timestamp: s.timestamp })),
  };
}

function queryRecentSignals(n = 10) {
  const idx = readJSON(INDEX_FILE, { signals: [] });
  const recent = idx.signals.slice(-n).reverse();
  return { status: "ok", count: recent.length, signals: recent };
}

function readJSON(f, fb) { try { return JSON.parse(readFileSync(f, "utf-8")); } catch { return fb; } }

const arg = process.argv[2];
switch (arg) {
  case "--profile": console.log(JSON.stringify(queryProfile(), null, 2)); break;
  case "--context": console.log(JSON.stringify(queryContext(), null, 2)); break;
  case "--signals": {
    const n = parseInt(process.argv[3] || "10", 10);
    console.log(JSON.stringify(queryRecentSignals(n), null, 2));
    break;
  }
  case "--manifest": {
    const manifest = readJSON("hub-manifest.json", {});
    console.log(JSON.stringify({ status: "ok", interfaces: Object.keys(manifest.interfaces || {}) }, null, 2));
    break;
  }
  default:
    console.log(JSON.stringify({
      usage: "node scripts/hub-query.mjs [--profile | --context | --signals <n> | --manifest]",
      example: "node scripts/hub-query.mjs --profile  # Get user profile",
    }));
}
