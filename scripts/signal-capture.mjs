#!/usr/bin/env node
/**
 * signal-capture.mjs — Habit Resonance Signal Capture Engine (v0.2)
 *
 * Fixed: now includes `value` in the index for pattern extraction.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";

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

function writeBuffer(buf) { writeFileSync(BUFFER_FILE, JSON.stringify(buf, null, 2)); }

function readIndex() {
  try { return JSON.parse(readFileSync(INDEX_FILE, "utf-8")); }
  catch { return { signals: [], patterns: [] }; }
}

function writeIndex(idx) { writeFileSync(INDEX_FILE, JSON.stringify(idx, null, 2)); }

function flushBuffer() {
  const buf = readBuffer();
  if (buf.signals.length === 0) {
    console.log(JSON.stringify({ status: "empty", flushed: 0 }));
    return;
  }

  const now = new Date();
  const monthDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const targetDir = join(SIGNALS_DIR, monthDir);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  let flushed = 0;
  const index = readIndex();
  for (const sig of buf.signals) {
    const id = `sig_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(flushed + 1).padStart(3, "0")}`;
    sig.id = id;
    sig.timestamp = now.toISOString();

    const meta = { ...sig };
    delete meta.evidence;
    delete meta.context;
    const frontmatter = [
      "---",
      ...Object.entries(meta).map(([k, v]) =>
        typeof v === "object" ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`
      ),
      "---",
      "",
      `**Evidence:** ${sig.evidence || "(auto-captured)"}`,
      `**Context:** ${sig.context || "(general)"}`,
    ].join("\n");

    const filePath = join(targetDir, `${id}.md`);
    writeFileSync(filePath, frontmatter);

    // ✅ FIX: store `value` in index for pattern extraction
    index.signals.push({
      id, type: sig.type, category: sig.category,
      value: sig.value || "", // <-- was missing, now fixed
      timestamp: sig.timestamp, filePath
    });
    flushed++;
  }

  writeIndex(index);
  writeBuffer({ signals: [] });
  console.log(JSON.stringify({ status: "flushed", count: flushed }));
}

function capture() {
  ensureDirs();
  const buf = readBuffer();
  let input = "";
  process.stdin.on("data", chunk => (input += chunk));
  process.stdin.on("end", () => {
    try {
      const sig = JSON.parse(input);
      sig.timestamp = new Date().toISOString();
      buf.signals.push(sig);
      writeBuffer(buf);
      const bufSize = buf.signals.length;
      console.log(JSON.stringify({ status: "captured", bufferSize: bufSize }));
      if (bufSize >= 5) flushBuffer();
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
