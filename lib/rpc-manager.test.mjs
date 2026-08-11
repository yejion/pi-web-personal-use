import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("RPC session startup preloads extension-registered providers before restoring models", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startupSource = source.slice(source.indexOf("export async function startRpcSession"));

  assert.match(startupSource, /createAgentSessionServices\(/);
  assert.match(startupSource, /createAgentSessionFromServices\(/);
  assert.doesNotMatch(startupSource, /await createAgentSession\(/);
});

test("custom extension UI receives the fixed headless terminal facade", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const customUiSource = source.slice(
    source.indexOf("private requestExtensionCustomUi"),
    source.indexOf("private requestExtensionUi"),
  );

  assert.match(customUiSource, /createHeadlessCustomUiTui\(/);
  assert.match(customUiSource, /width,/);
});

test("fork captures the new session id, then destroys the wrapper before returning", async () => {
  // AgentSession.fork() mutates the wrapper's inner state in place. If the
  // wrapper survived in the registry under the old session id, later requests
  // for the original session would be served the already-forked state and
  // subsequent forks would corrupt the parentSession chain.
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const forkSource = source.slice(source.indexOf('case "fork"'), source.indexOf('case "navigate_tree"'));

  const captureIdx = forkSource.indexOf("const newSessionId");
  const destroyIdx = forkSource.indexOf("this.destroy()");
  const returnIdx = forkSource.indexOf("return { cancelled: false, newSessionId }");

  assert.ok(captureIdx !== -1, "fork must capture the new session id");
  assert.ok(destroyIdx !== -1, "fork must destroy the wrapper");
  assert.ok(returnIdx !== -1, "fork must return the new session id");
  assert.ok(captureIdx < destroyIdx, "new session id must be captured before destroy");
  assert.ok(destroyIdx < returnIdx, "wrapper must be destroyed before returning");
});

test("destroyed wrappers are evicted from the registry and never reused", async () => {
  const source = await readFile(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startupSource = source.slice(source.indexOf("export async function startRpcSession"));

  assert.match(startupSource, /existing\?\.isAlive\(\)/);
  assert.match(startupSource, /wrapper\.onDestroy\(\(\) => registry\.delete\(realSessionId\)\)/);
});
