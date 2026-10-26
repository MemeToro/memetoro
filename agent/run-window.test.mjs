import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const RUNNER = fileURLToPath(new URL("./run-window.mjs", import.meta.url));

function runWindow(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER, ...args], {
      cwd: REPOSITORY_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `run-window exited ${code}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

test("a dry-run window writes the committed files and a latest pointer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "memetoro-window-"));
  try {
    const summary = await runWindow([
      "--dry-run",
      "--policy",
      "testnet",
      "--publish-dir",
      directory,
      "--public-base-url",
      "https://example.org/published",
    ]);

    assert.equal(summary.kind, "memetoro.launch-manifest");
    assert.equal(summary.status, "dry-run");
    assert.equal(summary.policy, "testnet");
    assert.match(summary.hash, /^0x[0-9a-f]{64}$/);
    assert.equal(summary.publicUri, `https://example.org/published/${summary.documentPath}`);

    const document = JSON.parse(await readFile(join(directory, summary.documentPath), "utf8"));
    assert.equal(document.commitment.hash, summary.hash);
    assert.equal(document.funding.walletCap, "0.01");

    const image = await readFile(join(directory, summary.imagePath));
    assert.equal(image.length, document.visual.image.byteLength);

    const latest = JSON.parse(await readFile(join(directory, "latest.json"), "utf8"));
    assert.equal(latest.hash, summary.hash);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a dry-run with --fresh-clock opens after now", async () => {
  const directory = await mkdtemp(join(tmpdir(), "memetoro-window-"));
  try {
    const before = Math.floor(Date.now() / 1000);
    const summary = await runWindow([
      "--dry-run",
      "--fresh-clock",
      "--policy",
      "testnet",
      "--publish-dir",
      directory,
    ]);
    const document = JSON.parse(await readFile(join(directory, summary.documentPath), "utf8"));
    assert.ok(document.chainTerms.startTime > before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a dry-run decline writes a record and no image", async () => {
  const directory = await mkdtemp(join(tmpdir(), "memetoro-window-"));
  try {
    const summary = await runWindow([
      "--dry-run",
      "--scenario",
      "decline",
      "--publish-dir",
      directory,
    ]);

    assert.equal(summary.kind, "memetoro.no-proposal");
    assert.equal(summary.imagePath, null);
    assert.equal(summary.publicUri, null);

    const record = JSON.parse(await readFile(join(directory, summary.documentPath), "utf8"));
    assert.equal(record.kind, "memetoro.no-proposal");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
