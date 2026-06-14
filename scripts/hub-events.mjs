#!/usr/bin/env node
/**
 * hub-events.mjs — File-based Event Bus
 * Skills write events to ~/.codex-habit/.events/
 * Other scripts read events to react to user state changes.
 *
 * Usage:
 *   node hub-events.mjs emit <type> <source> '<json-data>'   # Emit an event
 *   node hub-events.mjs read [--last <n>]                      # Read recent events
 *   node hub-events.mjs watch                                  # Watch for new events
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const HABIT_DIR = join(homedir(), ".codex-habit");
const EVENTS_DIR = join(HABIT_DIR, ".events");
const EVENTS_FILE = join(EVENTS_DIR, "event.log");
const SUBSCRIPTIONS_FILE = join(EVENTS_DIR, ".subscriptions.json");

function assure() {
  if (!existsSync(EVENTS_DIR)) mkdirSync(EVENTS_DIR, { recursive: true });
}

function readSubscriptions() {
  try { return JSON.parse(readFileSync(SUBSCRIPTIONS_FILE, "utf-8")); }
  catch { return { subscribers: [] }; }
}

/**
 * Emit an event.
 * Other skills call: node hub-events.mjs emit order_of_worth_shift taste-skill '{"order":"inspirational"}'
 */
function emitEvent(type, source, data) {
  assure();
  const event = {
    type,
    source,
    data: typeof data === "string" ? JSON.parse(data) : data,
    timestamp: new Date().toISOString(),
    id: `evt_${Date.now()}`,
  };

  // Append to log
  const line = JSON.stringify(event) + "\n";
  appendFileSync(EVENTS_FILE, line);

  // Also write individual event file
  writeFileSync(join(EVENTS_DIR, `${event.id}.json`), JSON.stringify(event, null, 2));

  return event;
}

function readEvents(lastN = 10) {
  assure();
  if (!existsSync(EVENTS_FILE)) return [];
  const lines = readFileSync(EVENTS_FILE, "utf-8").trim().split("\n").filter(Boolean);
  return lines.slice(-lastN).map(l => JSON.parse(l)).reverse();
}

const arg = process.argv[2];
assure();

switch (arg) {
  case "emit": {
    const type = process.argv[3] || "unknown";
    const source = process.argv[4] || "codex-habit";
    let data = process.argv[5] || "{}";
    try { data = JSON.parse(data); } catch { /* keep as string */ }
    const event = emitEvent(type, source, data);
    console.log(JSON.stringify({ status: "emitted", event }));
    break;
  }
  case "read": {
    const n = process.argv[3] === "--last" ? parseInt(process.argv[4] || "10", 10) : 10;
    const events = readEvents(n);
    console.log(JSON.stringify({ status: "ok", count: events.length, events }, null, 2));
    break;
  }
  case "subscribe": {
    const subs = readSubscriptions();
    const skill = process.argv[3];
    const eventType = process.argv[4];
    if (skill && eventType) {
      subs.subscribers.push({ skill, eventType, subscribedAt: new Date().toISOString() });
      writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2));
      console.log(JSON.stringify({ status: "subscribed", skill, eventType }));
    } else {
      console.log(JSON.stringify({ status: "error", message: "Usage: hub-events.mjs subscribe <skill> <event_type>" }));
    }
    break;
  }
  default:
    console.log(JSON.stringify({
      usage: [
        "node hub-events.mjs emit <type> <source> '<json-data>'    # Emit event",
        "node hub-events.mjs read --last <n>                        # Read events",
        "node hub-events.mjs subscribe <skill> <event_type>         # Subscribe",
      ],
    }));
}
