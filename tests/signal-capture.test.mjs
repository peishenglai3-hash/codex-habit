import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(new URL("../scripts/signal-capture.mjs", import.meta.url));

function withIsolatedHome(run) {
  const root = mkdtempSync(join(tmpdir(), "codex-habit-test-"));
  const home = join(root, "user-home");
  mkdirSync(home);
  mkdirSync(join(home, ".codex-habit"));
  try {
    run({
      root,
      home,
      habit: join(home, ".codex-habit"),
      invoke(args, input) {
        return spawnSync(process.execPath, [script, ...args], {
          cwd: repo,
          encoding: "utf8",
          input,
          env: { ...process.env, HOME: home, USERPROFILE: home },
        });
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("separate flushes preserve every signal and are idempotent", () => {
  withIsolatedHome(({ habit, invoke }) => {
    for (let index = 0; index < 5; index++) {
      const result = invoke(["--capture"], JSON.stringify({
        type: "preference",
        category: "test",
        value: `value-${index}`,
        evidence: `synthetic-${index}`,
      }));
      assert.equal(result.status, 0, result.stderr);
    }

    const next = invoke(["--capture"], JSON.stringify({
      type: "self_reflection",
      category: "decision",
      value: "revise after counterexample",
      evidence: "synthetic-second-flush",
    }));
    assert.equal(next.status, 0, next.stderr);
    assert.equal(JSON.parse(next.stdout).bufferSize, 1);

    const flushed = invoke(["--flush"]);
    assert.equal(flushed.status, 0, flushed.stderr);
    assert.equal(JSON.parse(flushed.stdout).count, 1);

    const index = JSON.parse(readFileSync(join(habit, ".signals_index.json"), "utf8"));
    const monthDir = readdirSync(join(habit, "signals"))[0];
    const files = readdirSync(join(habit, "signals", monthDir)).filter(name => name.endsWith(".md"));
    const ids = index.signals.map(signal => signal.id);
    assert.equal(index.signals.length, 6);
    assert.equal(new Set(ids).size, 6);
    assert.equal(files.length, 6);
    assert.deepEqual(new Set(files.map(file => file.slice(0, -3))), new Set(ids));
    assert.ok(ids.every(id => /^sig_\d{8}_[0-9a-f-]{36}$/.test(id)));

    const before = readFileSync(join(habit, ".signals_index.json"), "utf8");
    const repeatedFlush = invoke(["--flush"]);
    assert.equal(repeatedFlush.status, 0, repeatedFlush.stderr);
    assert.equal(JSON.parse(repeatedFlush.stdout).status, "empty");
    assert.equal(readFileSync(join(habit, ".signals_index.json"), "utf8"), before);
  });
});

test("a malformed buffer is retained instead of silently replaced", () => {
  withIsolatedHome(({ habit, invoke }) => {
    const bufferPath = join(habit, ".signal_buffer.json");
    const malformed = '{"signals":[{"value":"keep me"}';
    writeFileSync(bufferPath, malformed);

    const result = invoke(["--capture"], JSON.stringify({ value: "new" }));
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(bufferPath, "utf8"), malformed);
    assert.equal(existsSync(join(habit, ".signals_index.json")), false);
  });
});

test("a bad derived index leaves the buffered signal available for recovery", () => {
  withIsolatedHome(({ habit, invoke }) => {
    const captured = invoke(["--capture"], JSON.stringify({
      type: "self_reflection",
      category: "decision",
      value: "consider counterevidence",
      evidence: "synthetic-recovery-check",
    }));
    assert.equal(captured.status, 0, captured.stderr);

    const bufferPath = join(habit, ".signal_buffer.json");
    const originalBuffer = readFileSync(bufferPath, "utf8");
    const indexPath = join(habit, ".signals_index.json");
    const malformedIndex = "{invalid index";
    writeFileSync(indexPath, malformedIndex);

    const result = invoke(["--flush"]);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(bufferPath, "utf8"), originalBuffer);
    assert.equal(readFileSync(indexPath, "utf8"), malformedIndex);
  });
});

test("generic decision capture retains provenance and leaves confirmation unknown", () => {
  withIsolatedHome(({ habit, invoke }) => {
    const signal = {
      type: "decision",
      category: "architecture",
      value: "choose the smaller migration",
      session_id: "synthetic-session-01",
      source: "user_utterance",
      evidence: "Synthetic evidence text.",
      evidence_refs: ["event:turn-02", "file:decision-note"],
      decision: { selected: "smaller migration", alternative: "full rewrite" },
    };
    const captured = invoke(["--capture"], JSON.stringify(signal));
    assert.equal(captured.status, 0, captured.stderr);
    const flushed = invoke(["--flush"]);
    assert.equal(flushed.status, 0, flushed.stderr);

    const index = JSON.parse(readFileSync(join(habit, ".signals_index.json"), "utf8"));
    const [stored] = index.signals;
    assert.match(stored.id, /^sig_\d{8}_[0-9a-f-]{36}$/);
    assert.equal(stored.session_id, signal.session_id);
    assert.equal(stored.source, signal.source);
    assert.equal(stored.evidence, signal.evidence);
    assert.deepEqual(stored.evidence_refs, signal.evidence_refs);
    assert.deepEqual(stored.decision, signal.decision);
    assert.equal(stored.decision_confirmation, null);

    const month = readdirSync(join(habit, "signals"))[0];
    const markdown = readFileSync(join(habit, "signals", month, `${stored.id}.md`), "utf8");
    assert.match(markdown, /^session_id: synthetic-session-01$/m);
    assert.match(markdown, /^source: user_utterance$/m);
    assert.match(markdown, /^evidence_refs: \["event:turn-02","file:decision-note"\]$/m);
    assert.match(markdown, /Evidence: Synthetic evidence text\./);
  });
});
