#!/usr/bin/env node
/**
 * habit-graph.mjs — v0.3 (Adaptive Threshold)
 * Threshold adapts to signal distribution using coefficient of variation.
 * High dispersion (few dominant categories) → lower threshold
 * Low dispersion (evenly spread) → higher threshold
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const INDEX_FILE = join(HABIT_DIR, ".signals_index.json");
const PAT_ACTIVE = join(HABIT_DIR, "patterns", "active");
const GRAPH_FILE = join(HABIT_DIR, ".graph_state.json");
const EVENTS_DIR = join(HABIT_DIR, ".events");

function assure(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }
function readJSON(f, fb = {}) { try { return JSON.parse(readFileSync(f, "utf-8")); } catch { return fb; } }

/**
 * Calculate adaptive threshold using coefficient of variation
 * CV = σ/μ — measures how clustered signals are across categories
 */
function calcAdaptiveThreshold(signals) {
  // Group by category
  const groups = {};
  for (const s of signals) {
    const cat = s.category || "uncategorized";
    groups[cat] = (groups[cat] || 0) + 1;
  }

  const counts = Object.values(groups);
  const n = counts.length;
  if (n < 2) return 0.15; // not enough categories

  const mean = counts.reduce((a, b) => a + b, 0) / n;
  const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;

  // Base rate: scales with total signal count
  const baseRate = Math.max(0.10, Math.min(0.30, signals.length / 100));

  // Adaptive threshold: higher CV → lower threshold (more discovery)
  // Lower CV → higher threshold (more conservative)
  const threshold = baseRate / (1 + cv * 1.5);

  // Clamp to reasonable range
  const clamped = Math.max(0.08, Math.min(0.40, threshold));

  return { threshold: clamped, cv: Math.round(cv * 100) / 100, baseRate, groups: Object.keys(groups).length };
}

function buildAssociations(groups) {
  const keys = Object.keys(groups);
  const result = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const count = groups[keys[i]].length + groups[keys[j]].length;
      if (count >= 2) {
        result.push({ from: keys[i], to: keys[j], strength: Math.min(1, count / 5), frequency: count });
      }
    }
  }
  return result.sort((a, b) => b.strength - a.strength);
}

function extractPatterns(associations, threshold) {
  const seen = new Set();
  const patterns = [];
  for (const a of associations) {
    if (a.strength < threshold) continue;
    const key = `${a.from}__${a.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const f = a.from.split(":");
    const t = a.to.split(":");
    patterns.push({
      id: `pat_${f[0]}_${t[0]}`,
      trigger: (f.slice(1).join(":") || "?").slice(0, 40),
      action: (t.slice(1).join(":") || "?").slice(0, 40),
      confidence: a.strength,
      frequency: a.frequency,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });
  }
  return patterns;
}

function persistPatterns(patterns) {
  assure(PAT_ACTIVE);
  if (existsSync(PAT_ACTIVE)) {
    readdirSync(PAT_ACTIVE).filter(f => f.endsWith(".md")).forEach(f => unlinkSync(join(PAT_ACTIVE, f)));
  }
  for (const p of patterns) {
    const md = [
      "---",
      ...Object.entries(p).map(([k, v]) => `${k}: ${v}`),
      "---", "",
      `# Pattern: ${p.trigger}`,
      `**Confidence:** ${Math.round(p.confidence * 100)}%`,
      `**Frequency:** ${p.frequency} signals`,
    ].join("\n");
    writeFileSync(join(PAT_ACTIVE, `${p.id}.md`), md);
  }
}

const arg = process.argv[2];
assure(HABIT_DIR);

switch (arg) {
  case "--build": {
    const idx = readJSON(INDEX_FILE, { signals: [] });
    if (idx.signals.length < 3) {
      console.log(JSON.stringify({ status: "need_more", count: idx.signals.length }));
      process.exit(0);
    }

    // Adaptive threshold
    const { threshold, cv, baseRate, groups } = calcAdaptiveThreshold(idx.signals);

    // Build groups
    const g = {};
    for (const s of idx.signals) {
      const v = s.value || "?";
      const key = `${s.category}:${v}`;
      if (!g[key]) g[key] = [];
      g[key].push(s);
    }

    const assoc = buildAssociations(g);
    const patterns = extractPatterns(assoc, threshold);

    persistPatterns(patterns);

    const graph = readJSON(GRAPH_FILE);
    graph.associations = assoc;
    graph.lastBuilt = new Date().toISOString();
    graph.patternCount = patterns.length;
    graph.adaptiveThreshold = { value: threshold, cv, baseRate, numCategories: groups };
    writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2));

    console.log(JSON.stringify({
      status: "ok",
      signals: idx.signals.length,
      associations: assoc.length,
      patterns: patterns.length,
      adaptiveThreshold: { threshold: Math.round(threshold * 100) / 100, cv, baseRate, groups },
    }));
    break;
  }
  case "--stats": {
    const idx = readJSON(INDEX_FILE, { signals: [] });
    const active = existsSync(PAT_ACTIVE) ? readdirSync(PAT_ACTIVE).filter(f => f.endsWith(".md")).length : 0;
    const g = readJSON(GRAPH_FILE);
    const threshold = g.adaptiveThreshold || {};
    console.log(JSON.stringify({
      signals: idx.signals.length,
      patterns: active,
      adaptiveThreshold: threshold,
      lastBuilt: g.lastBuilt,
    }));
    break;
  }
  default:
    console.log(JSON.stringify({ usage: "node habit-graph.mjs [--build | --stats]" }));
}
