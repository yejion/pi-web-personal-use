import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression: pi's SessionManager only creates the .jsonl once the first
// assistant message lands, so a session on its first run is invisible to the
// disk scan in listAllSessions(). The session list must merge live,
// not-yet-flushed in-memory sessions, and the detail route must serve them.

test("session list merges live sessions whose files are not flushed yet", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

  assert.match(source, /getAliveRpcSessions/);
  // Sessions with no message entries (ensure_session runtimes) stay hidden.
  assert.match(source, /messageEntries\.length === 0/);
  // Already-listed files must not be duplicated.
  assert.match(source, /alreadyListed\.has\(sessionPathKey\(file\)\)/);
});

test("rpc-manager exposes getAliveRpcSessions filtered by isAlive()", async () => {
  const source = await readFile(new URL("../../../lib/rpc-manager.ts", import.meta.url), "utf8");

  assert.match(source, /export function getAliveRpcSessions\(\)/);
  assert.match(source, /getRegistry\(\)\.values\(\)\].filter\(\(s\) => s\.isAlive\(\)\)/);
});

test("session detail falls back to the live in-memory manager when the file is missing", async () => {
  const source = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8");
  const getSource = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function PATCH"));

  // Must never SessionManager.open() a missing path — that would fabricate an
  // empty session with a fresh random id.
  assert.match(getSource, /existsSync\(filePath\) \? SessionManager\.open\(filePath\) : liveManager/);
  assert.match(getSource, /!existsSync\(filePath\) && !liveManager/);
});

test("deleting an unflushed session destroys the runtime instead of touching disk", async () => {
  const source = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8");
  const deleteSource = source.slice(source.indexOf("export async function DELETE"));

  const guardIdx = deleteSource.indexOf("if (!existsSync(filePath))");
  const destroyIdx = deleteSource.indexOf("live.destroy()");
  const unlinkIdx = deleteSource.indexOf("unlinkSync(filePath)");

  assert.ok(guardIdx !== -1, "DELETE must guard on missing session file");
  assert.ok(destroyIdx !== -1, "DELETE must destroy the live wrapper");
  assert.ok(destroyIdx < unlinkIdx, "unflushed path must return before unlinkSync");
});
