import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "codex-habit-uninstall-test-"));
  const project = join(root, "project");
  const home = join(root, "home");
  const data = join(home, ".codex-habit");
  mkdirSync(home);
  mkdirSync(data);
  mkdirSync(join(project, ".agents", "skills", "codex-habit-skill"), { recursive: true });
  mkdirSync(join(project, "hooks"), { recursive: true });
  mkdirSync(join(project, ".codex-plugin"), { recursive: true });
  writeFileSync(join(data, "private-memory.txt"), "synthetic memory");
  writeFileSync(join(project, ".agents", "skills", "codex-habit-skill", "SKILL.md"), "test");
  writeFileSync(join(project, "hooks", "codex-hooks.json"), "{}");
  writeFileSync(join(project, ".codex-plugin", "plugin.json"), "{}");
  copyFileSync(join(repo, "uninstall.ps1"), join(project, "uninstall.ps1"));
  return { root, project, home, data };
}

function uninstall(target, args = []) {
  return spawnSync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(target.project, "uninstall.ps1"), ...args,
  ], {
    encoding: "utf8",
    env: { ...process.env, HOME: target.home, USERPROFILE: target.home },
  });
}

test("uninstall preserves memory unless deletion is explicitly requested", { skip: process.platform !== "win32" }, () => {
  const target = fixture();
  try {
    const result = uninstall(target);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(target.data, "private-memory.txt")), true);
    assert.equal(existsSync(join(target.project, ".agents", "skills", "codex-habit-skill")), false);
  } finally {
    rmSync(target.root, { recursive: true, force: true });
  }
});

test("explicit DeleteData removes only the isolated habit data path", { skip: process.platform !== "win32" }, () => {
  const target = fixture();
  try {
    const result = uninstall(target, ["-DeleteData"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(target.data), false);
    assert.equal(existsSync(join(target.project, ".agents", "skills", "codex-habit-skill")), false);
  } finally {
    rmSync(target.root, { recursive: true, force: true });
  }
});
