#!/usr/bin/env node
/** Build evidence-linked pattern candidates from signals in explicit sessions. */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const INDEX_FILE = join(HABIT_DIR, ".signals_index.json");
const PAT_ACTIVE = join(HABIT_DIR, "patterns", "active");
const PAT_CANDIDATES = join(HABIT_DIR, "patterns", "candidates");
const PAT_GENERATED = join(PAT_CANDIDATES, "generated");
const GRAPH_FILE = join(HABIT_DIR, ".graph_state.json");

function assure(path) {
  mkdirSync(path, { recursive: true });
}

function readJSON(file, fallback = {}) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function calcAdaptiveThreshold(signals) {
  const groups = {};
  for (const signal of signals) {
    const category = signal.category || "uncategorized";
    groups[category] = (groups[category] || 0) + 1;
  }

  const counts = Object.values(groups);
  const baseRate = Math.max(0.10, Math.min(0.30, signals.length / 100));
  const clamp = value => Math.max(0.08, Math.min(0.40, value));
  if (counts.length < 2) {
    return {
      threshold: clamp(baseRate),
      cv: 0,
      baseRate,
      groups: counts.length,
    };
  }

  const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
  const variance = counts.reduce((sum, count) => sum + (count - mean) ** 2, 0) / counts.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  return {
    threshold: clamp(baseRate / (1 + cv * 1.5)),
    cv: Math.round(cv * 100) / 100,
    baseRate,
    groups: counts.length,
  };
}

function stablePairId(from, to) {
  const identity = JSON.stringify([from, to]);
  return `assoc_${createHash("sha256").update(identity).digest("hex").slice(0, 20)}`;
}

function buildAssociations(signals) {
  const sessions = new Map();
  for (const signal of signals) {
    if (typeof signal.session_id !== "string" || !signal.session_id.trim()) continue;
    if (typeof signal.id !== "string" || !signal.id.trim()) continue;

    const category = signal.category || "uncategorized";
    const value = signal.value || "?";
    const group = JSON.stringify([category, value]);
    let signalGroups = sessions.get(signal.session_id);
    if (!signalGroups) sessions.set(signal.session_id, signalGroups = new Map());
    let sourceIds = signalGroups.get(group);
    if (!sourceIds) signalGroups.set(group, sourceIds = new Set());
    sourceIds.add(signal.id);
  }

  const eligibleSessions = [...sessions.values()].filter(groups => groups.size > 1);
  const pairs = new Map();
  for (const groups of eligibleSessions) {
    const keys = [...groups.keys()].sort();
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const [fromKey, toKey] = [keys[i], keys[j]];
        const id = stablePairId(fromKey, toKey);
        let pair = pairs.get(id);
        if (!pair) {
          const [fromCategory, fromValue] = JSON.parse(fromKey);
          const [toCategory, toValue] = JSON.parse(toKey);
          pair = {
            id,
            from: `${fromCategory}:${fromValue}`,
            to: `${toCategory}:${toValue}`,
            sessions: 0,
            sourceIds: new Set(),
          };
          pairs.set(id, pair);
        }
        pair.sessions++;
        for (const sourceId of groups.get(fromKey)) pair.sourceIds.add(sourceId);
        for (const sourceId of groups.get(toKey)) pair.sourceIds.add(sourceId);
      }
    }
  }

  const total = eligibleSessions.length;
  return [...pairs.values()]
    .map(pair => {
      const sourceSignalIds = [...pair.sourceIds].sort();
      return {
        id: pair.id,
        from: pair.from,
        to: pair.to,
        strength: pair.sessions / total,
        support_count: pair.sessions,
        frequency: sourceSignalIds.length,
        source_signal_ids: sourceSignalIds,
      };
    })
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function extractCandidates(associations, threshold) {
  return associations
    .filter(association => association.strength >= threshold)
    .map(association => ({
      id: association.id.replace(/^assoc_/, "pat_"),
      status: "candidate",
      signal_groups: [association.from, association.to],
      support_rate: association.strength,
      support_count: association.support_count,
      frequency: association.frequency,
      source_signal_ids: association.source_signal_ids,
    }));
}

function formatValue(value) {
  return Array.isArray(value) || (value && typeof value === "object")
    ? JSON.stringify(value)
    : String(value);
}

function candidateContent(pattern) {
  const metadata = Object.entries(pattern).map(([key, value]) => `${key}: ${formatValue(value)}`);
  return [
    "---",
    "generated_by: habit-graph",
    ...metadata,
    "---",
    "",
    `# Candidate co-occurrence: ${pattern.signal_groups.join(" + ")}`,
    `**Status:** candidate`,
    `**Observed session support:** ${Math.round(pattern.support_rate * 100)}%`,
    `**Support:** ${pattern.support_count} explicit session(s)`,
    `**Source signals:** ${pattern.source_signal_ids.join(", ")}`,
  ].join("\n");
}

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

function persistCandidates(candidates, previousManifest = {}, previousConflicts = {}) {
  assure(PAT_GENERATED);
  const previous = previousManifest && typeof previousManifest === "object" && !Array.isArray(previousManifest)
    ? previousManifest
    : {};
  const current = new Map(candidates.map(pattern => [pattern.id, candidateContent(pattern)]));
  const manifest = {};
  const priorConflicts = previousConflicts && typeof previousConflicts === "object" && !Array.isArray(previousConflicts)
    ? previousConflicts
    : {};
  const conflicts = new Map(
    Object.entries(priorConflicts)
      .filter(([id]) => /^pat_[a-f0-9]{20}$/u.test(id) && existsSync(join(PAT_GENERATED, `${id}.md`))),
  );

  for (const [id, expectedHash] of Object.entries(previous)) {
    if (!/^pat_[a-f0-9]{20}$/u.test(id) || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/u.test(expectedHash)) continue;
    if (current.has(id)) continue;
    const path = join(PAT_GENERATED, `${id}.md`);
    if (!existsSync(path)) continue;
    if (!lstatSync(path).isFile() || hashContent(readFileSync(path, "utf8")) !== expectedHash) {
      conflicts.set(id, expectedHash);
      continue;
    }
    unlinkSync(path);
  }

  for (const [id, content] of current) {
    const path = join(PAT_GENERATED, `${id}.md`);
    const expectedHash = previous[id];
    const nextHash = hashContent(content);
    if (existsSync(path)) {
      if (!lstatSync(path).isFile()) {
        conflicts.set(id, typeof expectedHash === "string" ? expectedHash : null);
        continue;
      }
      const existingHash = hashContent(readFileSync(path, "utf8"));
      if (conflicts.has(id)) {
        if (existingHash === nextHash) {
          manifest[id] = nextHash;
          conflicts.delete(id);
        }
        continue;
      }
      if (typeof expectedHash === "string" && existingHash === expectedHash) {
        if (existingHash !== nextHash) writeFileSync(path, content);
        manifest[id] = nextHash;
      } else if (existingHash === nextHash) {
        manifest[id] = nextHash;
      } else {
        conflicts.set(id, typeof expectedHash === "string" ? expectedHash : null);
      }
      continue;
    }
    try {
      writeFileSync(path, content, { flag: "wx" });
      manifest[id] = nextHash;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      conflicts.set(id, typeof expectedHash === "string" ? expectedHash : null);
    }
  }

  return { manifest, conflicts: Object.fromEntries([...conflicts.entries()].sort(([left], [right]) => left.localeCompare(right))) };
}

function activePatternCount() {
  return existsSync(PAT_ACTIVE)
    ? readdirSync(PAT_ACTIVE).filter(file => file.endsWith(".md")).length
    : 0;
}

assure(HABIT_DIR);
switch (process.argv[2]) {
  case "--build": {
    const index = readJSON(INDEX_FILE, { signals: [] });
    if (index.signals.length < 3) {
      const graph = readJSON(GRAPH_FILE);
      const persisted = persistCandidates([], graph.generatedCandidates, graph.candidateConflicts);
      graph.generatedCandidates = persisted.manifest;
      graph.candidateConflicts = persisted.conflicts;
      graph.candidateCount = 0;
      graph.associations = [];
      graph.lastBuilt = new Date().toISOString();
      graph.patternCount = activePatternCount();
      graph.adaptiveThreshold = {};
      writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2));
      console.log(JSON.stringify({ status: "need_more", count: index.signals.length }));
      process.exit(0);
    }

    const adaptive = calcAdaptiveThreshold(index.signals);
    const associations = buildAssociations(index.signals);
    const candidates = extractCandidates(associations, adaptive.threshold);
    const graph = readJSON(GRAPH_FILE);
    const persisted = persistCandidates(candidates, graph.generatedCandidates, graph.candidateConflicts);
    graph.associations = associations;
    graph.generatedCandidates = persisted.manifest;
    graph.candidateConflicts = persisted.conflicts;
    graph.lastBuilt = new Date().toISOString();
    graph.patternCount = activePatternCount();
    graph.candidateCount = candidates.length;
    graph.adaptiveThreshold = {
      value: adaptive.threshold,
      cv: adaptive.cv,
      baseRate: adaptive.baseRate,
      numCategories: adaptive.groups,
    };
    writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2));

    console.log(JSON.stringify({
      status: "ok",
      signals: index.signals.length,
      associations: associations.length,
      patterns: graph.patternCount,
      candidates: candidates.length,
      candidateConflicts: persisted.conflicts.length,
      adaptiveThreshold: {
        threshold: Math.round(adaptive.threshold * 100) / 100,
        cv: adaptive.cv,
        baseRate: adaptive.baseRate,
        groups: adaptive.groups,
      },
    }));
    break;
  }
  case "--stats": {
    const index = readJSON(INDEX_FILE, { signals: [] });
    const graph = readJSON(GRAPH_FILE);
    console.log(JSON.stringify({
      signals: index.signals.length,
      patterns: activePatternCount(),
      candidates: graph.candidateCount || 0,
      candidateConflicts: Object.keys(graph.candidateConflicts || {}).length,
      adaptiveThreshold: graph.adaptiveThreshold || {},
      lastBuilt: graph.lastBuilt,
    }));
    break;
  }
  default:
    console.log(JSON.stringify({ usage: "node habit-graph.mjs [--build | --stats]" }));
}
