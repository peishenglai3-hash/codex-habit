#!/usr/bin/env node
/**
 * foresight-engine.mjs — v0.3 (Theory Upgrade)
 * Time decay + multi-valence (multiple possible next moves by order_of_worth)
 * Reflexive tracking: knows its own output may change behavior
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const PAT_ACTIVE = join(HABIT_DIR, "patterns", "active");
const PROFILE_DIR = join(HABIT_DIR, "profile");
const FORESIGHTS_FILE = join(PROFILE_DIR, "foresights.md");
const DECAY_RATE = 0.99;

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
        if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 2).trim();
      }
      return meta;
    } catch { return null; }
  }).filter(Boolean);
}

function applyDecay(p) {
  const age = p.lastSeen ? (Date.now() - new Date(p.lastSeen).getTime()) / 86400000 : 30;
  const decay = Math.pow(DECAY_RATE, age);
  return { ...p, confidence: (parseFloat(p.confidence || "0") || 0) * decay, age: Math.round(age) };
}

/**
 * Multi-valence foresight: group predictions by order_of_worth,
 * so the user sees options aligned with different value systems
 */
function multiValenceForesights(patterns) {
  const groups = {};
  for (const p of patterns) {
    const order = p.order_of_worth || "industrial";
    const conf = parseFloat(p.confidence || "0");
    if (conf > 0.15) {
      if (!groups[order]) groups[order] = [];
      groups[order].push({ trigger: p.trigger, action: p.action, confidence: conf, id: p.id });
    }
  }

  // Pick top 2 per order, top 3 orders
  const results = [];
  const sortedOrders = Object.entries(groups)
    .map(([order, items]) => ({ order, avgConf: items.reduce((s, i) => s + i.confidence, 0) / items.length }))
    .sort((a, b) => b.avgConf - a.avgConf)
    .slice(0, 3);

  for (const { order } of sortedOrders) {
    const items = groups[order].sort((a, b) => b.confidence - a.confidence).slice(0, 2);
    results.push({ order, foresights: items });
  }
  return results;
}

function saveForesights(multiForesights) {
  if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });
  const now = new Date().toISOString();
  const lines = [
    "# Foresights — Multi-Valence Predictions",
    `> Generated: ${now}`,
    `> Based on ${multiForesights.reduce((s, g) => s + g.foresights.length, 0)} patterns across ${multiForesights.length} value orders`,
    "",
  ];
  for (const group of multiForesights) {
    lines.push(`## ${group.order.charAt(0).toUpperCase() + group.order.slice(1)} Order`);
    for (const f of group.foresights) {
      lines.push(`- **${f.trigger}** → ${f.action} (conf: ${Math.round(f.confidence * 100)}%)`);
    }
    lines.push("");
  }
  if (multiForesights.length === 0) lines.push("_No foresights yet._");
  writeFileSync(FORESIGHTS_FILE, lines.join("\n"));
}

const arg = process.argv[2];
switch (arg) {
  case "--all": {
    const pats = readPatterns().map(p => applyDecay(p));
    const fores = multiValenceForesights(pats);
    saveForesights(fores);
    console.log(JSON.stringify({ status: "ok", orders: fores.length, foresights: fores.reduce((s, g) => s + g.foresights.length, 0) }));
    break;
  }
  case "--stats": {
    const pats = readPatterns();
    const total = pats.length;
    const orders = {};
    for (const p of pats) { const o = p.order_of_worth || "unknown"; orders[o] = (orders[o] || 0) + 1; }
    console.log(JSON.stringify({ total, orderDistribution: orders }));
    break;
  }
  default: {
    let input = "";
    process.stdin.on("data", c => input += c);
    process.stdin.on("end", () => {
      try {
        const ctx = input ? JSON.parse(input).context || input : "general";
        const pats = readPatterns().map(p => applyDecay(p));
        // Match by keyword to current context, then group by order
        const ctxLower = ctx.toLowerCase();
        const relevant = pats.filter(p => {
          const t = (p.trigger || "").toLowerCase();
          return t.split(/\s+/).some(w => ctxLower.includes(w));
        });
        const fores = multiValenceForesights(relevant);
        saveForesights(fores);
        console.log(JSON.stringify({ status: "ok", ctxPatterns: relevant.length, orders: fores.length }));
      } catch (e) {
        console.error(JSON.stringify({ error: e.message }));
      }
    });
  }
}
