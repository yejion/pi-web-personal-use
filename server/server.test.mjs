import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Integration test for the embedded production server (dist/index.mjs).
// Requires a prior `npm run build`; skips cleanly when dist/ is absent.

const DIST_ENTRY = new URL("../dist/index.mjs", import.meta.url);
const hasBuild = existsSync(DIST_ENTRY);

const PORT = 30_991 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;

async function waitReady(proc, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(BASE + "/");
      if (res.status) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server did not become ready");
}

test("embedded server serves static client, APIs, and the origin guard", { skip: !hasBuild && "dist/ not built" }, async (t) => {
  const proc = spawn(process.execPath, [fileURLToPath(DIST_ENTRY)], {
    env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { proc.kill("SIGKILL"); });

  await waitReady(proc);

  // Static client HTML
  const home = await fetch(BASE + "/");
  assert.equal(home.status, 200);
  assert.match(await home.text(), /<html/);

  // Hashed static asset caching
  const html = await (await fetch(BASE + "/")).text();
  const chunkPath = /(\/_next\/static\/[^"]+?\.js)/.exec(html)?.[1];
  if (chunkPath) {
    const chunk = await fetch(BASE + chunkPath);
    assert.equal(chunk.status, 200);
    assert.match(chunk.headers.get("cache-control") ?? "", /immutable/);
  }

  // JSON API that needs no pi data dir
  const modes = await fetch(BASE + "/api/modes");
  assert.equal(modes.status, 200);
  const modesBody = await modes.json();
  assert.ok(modesBody.modes || modesBody.defaultMode, "modes payload shape");

  // SSE route shape (empty registry — no pi dir needed)
  const sse = await fetch(BASE + "/api/agent/running/events");
  assert.equal(sse.status, 200);
  assert.match(sse.headers.get("content-type") ?? "", /text\/event-stream/);
  const reader = sse.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /^data: /);
  await reader.cancel();

  // Cross-origin guard (same as proxy.ts enforced under Next)
  const evil = await fetch(BASE + "/api/sessions", {
    method: "POST",
    headers: { Origin: "http://evil.example", "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(evil.status, 403);

  // Unknown API + unknown static path
  assert.equal((await fetch(BASE + "/api/nope")).status, 404);
  assert.equal((await fetch(BASE + "/nope.txt")).status, 404);

  // Path traversal must not escape the static root
  assert.notEqual((await fetch(BASE + "/../../package.json")).status, 200);
});
