#!/usr/bin/env node
/**
 * context-injector.mjs — v0.2
 * Reads any frontmatter from profile/index.md — no hardcoded field names.
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
      const label = k.replace(/_/g, " ");
      lines.push("  " + label + ": " + v);
    }
  }
  const active = existsSync(PAT_ACTIVE) ? readdirSync(PAT_ACTIVE).filter(f => f.endsWith(".md")).length : 0;
  lines.push("  active patterns: " + active);
  return lines.join("\n");
}

function injectForesights() {
  if (!existsSync(FORESIGHTS_FILE)) return null;
  const text = readFileSync(FORESIGHTS_FILE, "utf-8");
  const lines = text.split("\n").filter(l => l.startsWith("## Foresight:")).slice(0, 3);
  if (lines.length === 0) return null;
  return "Foresights:\n" + lines.map(l => "  " + l.replace("## Foresight: ", "").slice(0, 60) + "...").join("\n");
}

const arg = process.argv[2];
switch (arg) {
  case "--profile": console.log(injectProfile()); break;
  case "--foresight": console.log(injectForesights() || "No foresights yet."); break;
  case "--all":
    console.log(injectProfile());
    console.log("");
    console.log(injectForesights() || "");
    break;
  default:
    console.log(JSON.stringify({ usage: "node context-injector.mjs [--profile | --foresight | --all]" }));
}
