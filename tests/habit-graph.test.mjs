import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const graphScript = fileURLToPath(new URL("../scripts/habit-graph.mjs", import.meta.url));
const injectorScript = fileURLToPath(new URL("../scripts/context-injector.mjs", import.meta.url));

function withFixture(signals, run) {
  const root = mkdtempSync(join(tmpdir(), "codex-habit-graph-test-"));
  const home = join(root, "user-home");
  const habit = join(home, ".codex-habit");
  const active = join(habit, "patterns", "active");
  mkdirSync(active, { recursive: true });

  const activePath = join(active, "retained-active.md");
  const activeText = [
    "---",
    "id: retained-active",
    "status: active",
    "trigger: active-only-trigger",
    "action: preserve active record",
    "confidence: 0.9",
    "---",
    "",
    "Existing synthetic active record.",
  ].join("\n");
  writeFileSync(activePath, activeText);
  writeFileSync(join(habit, ".signals_index.json"), JSON.stringify({ signals }, null, 2));

  const invoke = (script, args = []) => spawnSync(process.execPath, [script, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });

  try {
    run({ root, home, habit, active, activePath, activeText, invoke });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function signal(id, category, value, session_id) {
  return {
    id,
    type: "decision",
    category,
    value,
    session_id,
    source: "synthetic-fixture",
    evidence_refs: [`fixture:${id}`],
  };
}

function build(invoke) {
  const result = invoke(graphScript, ["--build"]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function candidateFiles(dir) {
  return readdirSync(dir).filter(name => name.endsWith(".md")).sort();
}

test("single category has a stable threshold shape and unscoped signals stay unlinked", () => {
  withFixture([
    signal("u1", "decision", "alpha"),
    signal("u2", "decision", "beta"),
    signal("u3", "decision", "gamma"),
  ], ({ habit, activePath, activeText, invoke }) => {
    const result = build(invoke);
    assert.equal(result.status, "ok");
    assert.equal(result.patterns, 1);
    assert.equal(result.candidates, 0);
    assert.deepEqual(result.adaptiveThreshold.groups, 1);
    assert.equal(typeof result.adaptiveThreshold.threshold, "number");

    const graph = JSON.parse(readFileSync(join(habit, ".graph_state.json"), "utf8"));
    assert.deepEqual(graph.associations, []);
    assert.equal(graph.patternCount, 1);
    assert.equal(graph.candidateCount, 0);
    assert.equal(readFileSync(activePath, "utf8"), activeText);
    assert.deepEqual(candidateFiles(join(habit, "patterns", "candidates", "generated")), []);
  });
});

test("only explicit session co-occurrence creates stable, evidence-linked candidates", () => {
  const signals = [
    signal("a-1", "choice", "small-migration", "session-1"),
    signal("b-1", "reason", "simple-rollback", "session-1"),
    signal("a-2", "choice", "small-migration", "session-2"),
    signal("b-2", "reason", "simple-rollback", "session-2"),
    signal("a-3", "choice", "small-migration", "session-3"),
    signal("c-3", "outcome", "faster-review", "session-3"),
    signal("orphan-1", "orphan", "one"),
    signal("orphan-2", "orphan", "two"),
  ];

  withFixture(signals, ({ habit, activePath, activeText, invoke }) => {
    build(invoke);
    const graphPath = join(habit, ".graph_state.json");
    const firstGraph = JSON.parse(readFileSync(graphPath, "utf8"));
    assert.equal(firstGraph.patternCount, 1);
    assert.ok(firstGraph.candidateCount > 0);
    const pair = firstGraph.associations.find(item =>
      item.from === "choice:small-migration" && item.to === "reason:simple-rollback");
    assert.ok(pair);
    assert.equal(pair.support_count, 2);
    assert.deepEqual(pair.source_signal_ids, ["a-1", "a-2", "b-1", "b-2"]);
    assert.equal(pair.frequency, 4);
    assert.ok(firstGraph.associations.every(item =>
      !item.source_signal_ids.some(id => id.startsWith("orphan-"))));

    const candidateDir = join(habit, "patterns", "candidates", "generated");
    assert.equal(existsSync(candidateDir), true);
    const firstCandidateFiles = candidateFiles(candidateDir);
    assert.ok(firstCandidateFiles.length > 0);
    const firstCandidateContent = firstCandidateFiles.map(file =>
      readFileSync(join(candidateDir, file), "utf8"));
    assert.ok(firstCandidateContent.every(content => /^status: candidate$/m.test(content)));
    assert.ok(firstCandidateContent.every(content => /source_signal_ids: \[/.test(content)));
    assert.equal(existsSync(join(habit, "patterns", "active", firstCandidateFiles[0])), false);
    assert.equal(readFileSync(activePath, "utf8"), activeText);

    const injected = invoke(injectorScript, ["--patterns"]);
    assert.equal(injected.status, 0, injected.stderr);
    assert.match(injected.stdout, /active-only-trigger/);
    assert.doesNotMatch(injected.stdout, /small-migration|simple-rollback|faster-review/);

    build(invoke);
    assert.deepEqual(candidateFiles(candidateDir), firstCandidateFiles);
    assert.deepEqual(candidateFiles(candidateDir).map(file =>
      readFileSync(join(candidateDir, file), "utf8")), firstCandidateContent);

    const reordered = [...signals].reverse().map(item =>
      Object.fromEntries(Object.entries(item).reverse()));
    writeFileSync(join(habit, ".signals_index.json"), JSON.stringify({ signals: reordered }, null, 2));
    build(invoke);
    const reorderedGraph = JSON.parse(readFileSync(graphPath, "utf8"));
    assert.deepEqual(reorderedGraph.associations, firstGraph.associations);
    assert.deepEqual(candidateFiles(candidateDir), firstCandidateFiles);
    assert.equal(readFileSync(activePath, "utf8"), activeText);
  });
});

test("stale generated candidates are pruned by hash while review edits and legacy files stay intact", () => {
  const signals = [
    signal("a-1", "choice", "small-migration", "session-1"),
    signal("b-1", "reason", "simple-rollback", "session-1"),
    signal("a-2", "choice", "small-migration", "session-2"),
    signal("b-2", "reason", "simple-rollback", "session-2"),
    signal("a-3", "choice", "small-migration", "session-3"),
    signal("c-3", "outcome", "faster-review", "session-3"),
  ];

  withFixture(signals, ({ habit, invoke }) => {
    const candidateRoot = join(habit, "patterns", "candidates");
    const generatedDir = join(candidateRoot, "generated");
    const reviewedDir = join(candidateRoot, "reviewed");
    mkdirSync(reviewedDir, { recursive: true });
    const legacyPath = join(candidateRoot, "legacy-user-note.md");
    const reviewedPath = join(reviewedDir, "reviewed-by-user.md");
    writeFileSync(legacyPath, "Legacy candidate note; preserve without ownership metadata.");
    writeFileSync(reviewedPath, "Human reviewed candidate; graph builds must not rewrite it.");

    build(invoke);
    const firstFiles = candidateFiles(generatedDir);
    assert.ok(firstFiles.length >= 2);
    const editedName = firstFiles[0];
    const editedPath = join(generatedDir, editedName);
    const edited = readFileSync(editedPath, "utf8") + "\n\nManual review: keep this annotation.\n";
    writeFileSync(editedPath, edited);

    const unscoped = [signal("new-1", "choice", "a"), signal("new-2", "reason", "b")];
    const indexPath = join(habit, ".signals_index.json");
    writeFileSync(indexPath, JSON.stringify({ signals: unscoped }, null, 2));
    const insufficient = invoke(graphScript, ["--build"]);
    assert.equal(insufficient.status, 0, insufficient.stderr);
    assert.equal(JSON.parse(insufficient.stdout).status, "need_more");

    const state = JSON.parse(readFileSync(join(habit, ".graph_state.json"), "utf8"));
    assert.deepEqual(candidateFiles(generatedDir), [editedName]);
    assert.deepEqual(state.generatedCandidates, {});
    assert.deepEqual(Object.keys(state.candidateConflicts), [editedName.slice(0, -3)]);
    assert.equal(readFileSync(editedPath, "utf8"), edited);
    assert.equal(readFileSync(legacyPath, "utf8"), "Legacy candidate note; preserve without ownership metadata.");
    assert.equal(readFileSync(reviewedPath, "utf8"), "Human reviewed candidate; graph builds must not rewrite it.");

    const repeatedBuild = invoke(graphScript, ["--build"]);
    assert.equal(repeatedBuild.status, 0, repeatedBuild.stderr);
    assert.equal(JSON.parse(repeatedBuild.stdout).status, "need_more");
    const repeated = JSON.parse(readFileSync(join(habit, ".graph_state.json"), "utf8"));
    assert.deepEqual(Object.keys(repeated.candidateConflicts), [editedName.slice(0, -3)]);
    assert.equal(readFileSync(editedPath, "utf8"), edited);
  });
});
