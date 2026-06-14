#!/usr/bin/env node
/**
 * signal-capture.mjs — v0.3 (Theory Upgrade)
 * Adds: order_of_worth, justification, test_count, reflexive_effect
 * All new fields are optional — backward compatible.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const SIGNALS_DIR = join(HABIT_DIR, "signals");
const BUFFER_FILE = join(HABIT_DIR, ".signal_buffer.json");
const INDEX_FILE = join(HABIT_DIR, ".signals_index.json");

function ensureDirs() {
  [HABIT_DIR, SIGNALS_DIR, join(HABIT_DIR, "patterns", "active"),
   join(HABIT_DIR, "patterns", "archived"), join(HABIT_DIR, "profile")
  ].forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });
}

function readBuffer() {
  try { return JSON.parse(readFileSync(BUFFER_FILE, "utf-8")); }
  catch { return { signals: [] }; }
}
function writeBuffer(b) { writeFileSync(BUFFER_FILE, JSON.stringify(b, null, 2)); }
function readIndex() {
  try { return JSON.parse(readFileSync(INDEX_FILE, "utf-8")); }
  catch { return { signals: [], patterns: [] }; }
}
function writeIndex(i) { writeFileSync(INDEX_FILE, JSON.stringify(i, null, 2)); }

function flushBuffer() {
  const buf = readBuffer();
  if (buf.signals.length === 0) return console.log(JSON.stringify({ status: "empty", flushed: 0 }));

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const targetDir = join(SIGNALS_DIR, month);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  let flushed = 0;
  const index = readIndex();
  for (const sig of buf.signals) {
    const id = `sig_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(flushed + 1).padStart(3, "0")}`;
    sig.id = id;
    sig.timestamp = now.toISOString();

    // Build markdown with optional theory fields
    const meta = { ...sig };
    delete meta.evidence;
    delete meta.context;
    const lines = ["---"];
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined && v !== null) lines.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
    lines.push("---", "", `Evidence: ${sig.evidence || "(auto)"}`);

    writeFileSync(join(targetDir, `${id}.md`), lines.join("\n"));

    // Store in index — include all theory fields
    index.signals.push({
      id, type: sig.type, category: sig.category,
      value: sig.value || "", timestamp: sig.timestamp,
      confidence: sig.confidence || 0.5,
      // Theory-grounded fields (optional)
      order_of_worth: sig.order_of_worth || null,
      justification: sig.justification || null,
      test_count: sig.test_count || 0,
      test_survival_rate: sig.test_survival_rate || null,
      reflexive_effect: sig.reflexive_effect || null,
      context_label: sig.context_label || null,
      source: sig.source || "codex",
    });
    flushed++;
  }

  writeIndex(index);
  writeBuffer({ signals: [] });
  console.log(JSON.stringify({ status: "flushed", count: flushed, theoryFields: true }));
}

function capture() {
  ensureDirs();
  const buf = readBuffer();
  let input = "";
  process.stdin.on("data", c => input += c);
  process.stdin.on("end", () => {
    try {
      const sig = JSON.parse(input);
      sig.timestamp = new Date().toISOString();
      buf.signals.push(sig);
      writeBuffer(buf);
      const s = buf.signals.length;
      console.log(JSON.stringify({ status: "captured", bufferSize: s }));
      if (s >= 5) flushBuffer();
    } catch (e) {
      console.error(JSON.stringify({ error: e.message }));
      process.exit(1);
    }
  });
}

const arg = process.argv[2];
ensureDirs();
switch (arg) {
  case "--capture": capture(); break;
  case "--flush": flushBuffer(); break;
  case "--buffer":
    const b = readBuffer();
    console.log(JSON.stringify({ status: "ok", bufferSize: b.signals.length }));
    break;
  default:
    console.log(JSON.stringify({ usage: "node signal-capture.mjs [--capture | --flush | --buffer]" }));
}
