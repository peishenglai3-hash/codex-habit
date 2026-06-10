#!/usr/bin/env node
/**
 * habit-graph.mjs — v0.2
 * Builds associations from signals, extracts patterns with semantic names.
 * Uses adaptive threshold based on signal count.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const INDEX_FILE = join(HABIT_DIR, ".signals_index.json");
const PAT_ACTIVE = join(HABIT_DIR, "patterns", "active");
const GRAPH_FILE = join(HABIT_DIR, ".graph_state.json");

function assure(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

function readJSON(f, fallback = {}) {
  try { return JSON.parse(readFileSync(f, "utf-8")); } catch { return fallback; }
}

function buildSignals() {
  const idx = readJSON(INDEX_FILE, { signals: [] });
  const groups = {};
  for (const s of idx.signals) {
    const v = s.value || "unknown";
    const key = s.category + ":" + v;
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  return { signals: idx.signals, groups };
}

function buildAssociations(groups) {
  const keys = Object.keys(groups);
  const result = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const count = groups[keys[i]].length + groups[keys[j]].length;
      if (count >= 2) {
        result.push({
          from: keys[i], to: keys[j],
          strength: Math.min(1, count / 5),
          frequency: count
        });
      }
    }
  }
  return result.sort((a, b) => b.strength - a.strength);
}

function extractPatterns(associations, signalCount) {
  const threshold = Math.max(0.15, signalCount > 30 ? 0.25 : 0.15);
  const seen = new Set();
  const patterns = [];
  for (const a of associations) {
    if (a.strength < threshold) continue;
    const key = a.from + "__" + a.to;
    if (seen.has(key)) continue;
    seen.add(key);
    const f = a.from.split(":");
    const t = a.to.split(":");
    const catA = f[0], valA = f.slice(1).join(":") || "?";
    const catB = t[0], valB = t.slice(1).join(":") || "?";
    patterns.push({
      id: "pat_" + catA + "_" + catB,
      trigger: valA.slice(0, 40),
      action: valB.slice(0, 40),
      category: catA + " <-> " + catB,
      confidence: a.strength,
      frequency: a.frequency,
      createdAt: new Date().toISOString()
    });
  }
  return patterns;
}

function persistPatterns(patterns) {
  assure(PAT_ACTIVE);
  const existing = existsSync(PAT_ACTIVE) ? readdirSync(PAT_ACTIVE).filter(f => f.endsWith(".md")) : [];
  existing.forEach(f => unlinkSync(join(PAT_ACTIVE, f)));
  for (const p of patterns) {
    const md = [
      "---",
      "id: " + p.id,
      "trigger: " + p.trigger,
      "action: " + p.action,
      "confidence: " + p.confidence,
      "frequency: " + p.frequency,
      "createdAt: " + p.createdAt,
      "---",
      "",
      "# Pattern: " + p.trigger,
      "**Category:** " + p.category,
      "**Action:** " + p.action,
      "**Confidence:** " + Math.round(p.confidence * 100) + "%",
      "**Frequency:** " + p.frequency + " signals"
    ].join("\n");
    writeFileSync(join(PAT_ACTIVE, p.id + ".md"), md);
  }
}

const arg = process.argv[2];
assure(HABIT_DIR);

switch (arg) {
  case "--build": {
    const { signals, groups } = buildSignals();
    if (signals.length < 3) {
      console.log(JSON.stringify({ status: "need_more_signals", count: signals.length }));
      process.exit(0);
    }
    const assoc = buildAssociations(groups);
    const patterns = extractPatterns(assoc, signals.length);
    persistPatterns(patterns);
    const graph = readJSON(GRAPH_FILE);
    graph.associations = assoc;
    graph.lastBuilt = new Date().toISOString();
    graph.patternCount = patterns.length;
    writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2));
    console.log(JSON.stringify({ status: "ok", signals: signals.length, associations: assoc.length, patterns: patterns.length }));
    break;
  }
  case "--stats": {
    const idx = readJSON(INDEX_FILE, { signals: [] });
    const active = existsSync(PAT_ACTIVE) ? readdirSync(PAT_ACTIVE).filter(f => f.endsWith(".md")).length : 0;
    const g = readJSON(GRAPH_FILE);
    console.log(JSON.stringify({ signals: idx.signals.length, patterns: active, lastBuilt: g.lastBuilt }));
    break;
  }
  default:
    console.log(JSON.stringify({ usage: "node habit-graph.mjs [--build | --stats]" }));
}
