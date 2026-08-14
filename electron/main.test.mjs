import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Startup-performance guards: the window must appear immediately (splash),
// not after the server is ready, and boot milestones must be logged.

test("window with splash is created before waiting for the server", async () => {
  const source = await readFile(new URL("./main.js", import.meta.url), "utf8");
  const boot = source.slice(source.indexOf("app.whenReady()"));

  const createIdx = boot.indexOf("createWindow()");
  const splashIdx = boot.indexOf("loadFile(SPLASH_FILE)");
  const waitIdx = boot.indexOf("waitForServer(");

  assert.ok(createIdx !== -1, "window must be created during boot");
  assert.ok(splashIdx !== -1, "splash page must be loaded");
  assert.ok(waitIdx !== -1, "server wait must exist");
  assert.ok(createIdx < waitIdx, "window must be created BEFORE waitForServer");
  assert.ok(splashIdx < waitIdx, "splash must load BEFORE waitForServer");
});

test("boot milestones are timestamped in the server log", async () => {
  const source = await readFile(new URL("./main.js", import.meta.url), "utf8");

  assert.match(source, /mark\("window created"\)/);
  assert.match(source, /mark\("server process spawned"\)/);
  assert.match(source, /mark\("port ready"\)/);
  assert.match(source, /mark\("loadURL called"\)/);
});

test("startup failure shows the error page with the message", async () => {
  const source = await readFile(new URL("./main.js", import.meta.url), "utf8");

  assert.match(source, /loadFile\(ERROR_FILE, \{ query: \{ message: err\.message \} \}\)/);
});

test("desktop spawns the embedded server bundle, not the next CLI", async () => {
  const source = await readFile(new URL("./main.js", import.meta.url), "utf8");

  assert.match(source, /"dist", "index\.mjs"/);
  assert.doesNotMatch(source, /next\/dist\/bin\/next/);
  // The embedded server reads PORT/HOSTNAME from the environment.
  assert.match(source, /PORT: String\(PORT\)/);
  assert.match(source, /HOSTNAME: HOST/);
});

test("instrumentation warms the session-list cache in the background", async () => {
  const source = await readFile(new URL("../instrumentation.ts", import.meta.url), "utf8");

  assert.match(source, /import\("@\/lib\/session-reader"\)/);
  assert.match(source, /listAllSessions\(\)/);
  // Fire-and-forget: must not block register() on the scan.
  assert.match(source, /void import/);
});
