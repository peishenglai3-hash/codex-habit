#!/usr/bin/env node
/**
 * graph-data.mjs — Generates JSON for visualize.html
 * Usage: node scripts/graph-data.mjs > outputs/graph.json
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT = join(homedir(), ".codex-habit");
const idx = tryRead(join(HABIT, ".signals_index.json"), {signals:[]});
const graph = tryRead(join(HABIT, ".graph_state.json"), {associations:[],patterns:[]});

function tryRead(f, fallback) {
  try { return JSON.parse(readFileSync(f, "utf-8")); } catch { return fallback; }
}

// Build category distribution
const cats = {};
for (const s of idx.signals) {
  cats[s.category] = (cats[s.category] || 0) + 1;
}

// Build pattern list
const patDir = join(HABIT, "patterns", "active");
const patList = [];
if (existsSync(patDir)) {
  for (const f of readdirSync(patDir).filter(f => f.endsWith(".md")).slice(0,20)) {
    const text = readFileSync(join(patDir, f), "utf-8");
    const m = text.match(/^---\n([\s\S]*?)\n---/);
    if (m) {
      const meta = {};
      for (const line of m[1].split("\n")) {
        const i = line.indexOf(": ");
        if (i > 0) meta[line.slice(0,i).trim()] = line.slice(i+2).trim();
      }
      patList.push(meta);
    }
  }
}

const catKeys = Object.keys(cats);
const assocList = (graph.associations || []).slice(0,50).map(a => {
  const fk = a.from.split(":")[0];
  const tk = a.to.split(":")[0];
  return { from: fk, to: tk, strength: a.strength };
});

const output = {
  signals: idx.signals.length,
  associations: (graph.associations || []).length,
  patterns: (graph.patterns || []).length,
  categories: cats,
  assocList,
  patternList: patList,
  lastBuilt: graph.lastBuilt
};

process.stdout.write(JSON.stringify(output, null, 2));
