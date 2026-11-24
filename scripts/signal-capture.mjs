#!/usr/bin/env node
/**
 * signal-capture.mjs — local, append-only signal capture.
 * Theory fields remain optional for backward compatibility.
 */

import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const SIGNALS_DIR = join(HABIT_DIR, "signals");
const BUFFER_FILE = join(HABIT_DIR, ".signal_buffer.json");
const INDEX_FILE = join(HABIT_DIR, ".signals_index.json");

function ensureDirs() {
  for (const dir of [
    HABIT_DIR,
    SIGNALS_DIR,
    join(HABIT_DIR, "patterns", "active"),
    join(HABIT_DIR, "patterns", "archived"),
    join(HABIT_DIR, "profile"),
  ]) mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback, validate) {
  if (!existsSync(file)) return fallback;

  let value;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${file}; preserving the file for recovery: ${error.message}`);
  }

  if (!validate(value)) {
    throw new Error(`Invalid data in ${file}; preserving the file for recovery.`);
  }
  return value;
}

function atomicWriteJson(file, value) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2), { flag: "wx" });
    renameSync(temp, file);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function readBuffer() {
  return readJson(BUFFER_FILE, { signals: [] }, value =>
    value && Array.isArray(value.signals));
}

function writeBuffer(buffer) {
  atomicWriteJson(BUFFER_FILE, buffer);
}

function readIndex() {
  return readJson(INDEX_FILE, { signals: [], patterns: [] }, value =>
    value && Array.isArray(value.signals));
}

function writeIndex(index) {
  atomicWriteJson(INDEX_FILE, index);
}

function signalId(timestamp) {
  const date = new Date(timestamp);
  const day = (Number.isNaN(date.getTime()) ? new Date() : date)
    .toISOString().slice(0, 10).replaceAll("-", "");
  return `sig_${day}_${randomUUID()}`;
}

function indexEntry(sig) {
  return {
    id: sig.id,
    type: sig.type,
    category: sig.category,
    value: sig.value || "",
    timestamp: sig.timestamp,
    confidence: sig.confidence ?? 0.5,
    // Optional theory fields preserve provenance without asserting confirmation.
    order_of_worth: sig.order_of_worth ?? null,
    justification: sig.justification ?? null,
    test_count: sig.test_count ?? 0,
    test_survival_rate: sig.test_survival_rate ?? null,
    reflexive_effect: sig.reflexive_effect ?? null,
    context_label: sig.context_label ?? null,
    source: sig.source || "codex",
  };
}

function signalMarkdown(sig) {
  const meta = { ...sig };
  delete meta.evidence;
  delete meta.context;
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined && value !== null) {
      lines.push(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
    }
  }
  lines.push("---", "", `Evidence: ${sig.evidence || "(auto)"}`);
  return lines.join("\n");
}

function flushBuffer() {
  const buffer = readBuffer();
  if (buffer.signals.length === 0) {
    console.log(JSON.stringify({ status: "empty", flushed: 0 }));
    return;
  }

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const targetDir = join(SIGNALS_DIR, month);
  mkdirSync(targetDir, { recursive: true });

  // Persist IDs before writing signal files. A retry after interruption then
  // recognizes already-written records instead of overwriting or duplicating them.
  for (const sig of buffer.signals) {
    if (!sig.id) sig.id = signalId(sig.timestamp || now.toISOString());
    if (!sig.timestamp) sig.timestamp = now.toISOString();
  }
  writeBuffer(buffer);

  const index = readIndex();
  const indexedIds = new Set(index.signals.map(entry => entry.id).filter(Boolean));
  let flushed = 0;

  for (const sig of buffer.signals) {
    const path = join(targetDir, `${sig.id}.md`);
    if (!existsSync(path)) {
      let fd;
      try {
        fd = openSync(path, "wx");
        writeFileSync(fd, signalMarkdown(sig));
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    }

    if (!indexedIds.has(sig.id)) {
      index.signals.push(indexEntry(sig));
      indexedIds.add(sig.id);
    }
    flushed++;
  }

  writeIndex(index);
  writeBuffer({ signals: [] });
  console.log(JSON.stringify({ status: "flushed", count: flushed, theoryFields: true }));
}

function capture() {
  const buffer = readBuffer();
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { input += chunk; });
  process.stdin.on("end", () => {
    try {
      const sig = JSON.parse(input);
      sig.timestamp = new Date().toISOString();
      sig.id = signalId(sig.timestamp);
      buffer.signals.push(sig);
      writeBuffer(buffer);
      console.log(JSON.stringify({ status: "captured", bufferSize: buffer.signals.length }));
      if (buffer.signals.length >= 5) flushBuffer();
    } catch (error) {
      console.error(JSON.stringify({ error: error.message }));
      process.exitCode = 1;
    }
  });
}

ensureDirs();
switch (process.argv[2]) {
  case "--capture":
    capture();
    break;
  case "--flush":
    flushBuffer();
    break;
  case "--buffer": {
    const buffer = readBuffer();
    console.log(JSON.stringify({ status: "ok", bufferSize: buffer.signals.length }));
    break;
  }
  default:
    console.log(JSON.stringify({ usage: "node signal-capture.mjs [--capture | --flush | --buffer]" }));
}
