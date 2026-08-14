#!/usr/bin/env node
"use strict";

 
const { getUnsupportedNodeVersionMessage, isNodeVersionSupported } = require("./node-version");

if (!isNodeVersionSupported(process.versions.node)) {
  console.error(getUnsupportedNodeVersionMessage(process.versions.node));
  process.exit(1);
}

 
const { spawn } = require("child_process");
 
const path = require("path");
 
const fs = require("fs");
 
const { parseLaunchOptions } = require("./pi-web-options");

const pkgDir = path.join(__dirname, "..");
// Embedded server bundle (phase-2 build: esbuild + nft trace, no Next
// runtime). Cold start parses far fewer files than the Next server did.
const serverEntry = path.join(pkgDir, "dist", "index.mjs");

const { port, hostname, openBrowser } = parseLaunchOptions();
const loopbackHostnames = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

if (!fs.existsSync(serverEntry)) {
  console.error("Build artifacts not found. Please report this issue.");
  process.exit(1);
}

if (!loopbackHostnames.has(hostname)) {
  console.warn(
    `Warning: pi-web is listening on ${hostname} without authentication. Only use this on a trusted network.`,
  );
}

// Always run the server entry with node directly — avoids .bin symlink
// issues and path-with-spaces problems on Windows when shell: true is used.
// The embedded server reads PORT/HOSTNAME from the environment.
const child = spawn(process.execPath, [serverEntry], {
  cwd: path.dirname(serverEntry),
  stdio: ["inherit", "pipe", "inherit"],
  env: { ...process.env, PORT: String(port), HOSTNAME: hostname },
});

let browserOpened = false;
const url = `http://${hostname}:${port}`;

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (openBrowser && !browserOpened && text.includes("Ready")) {
    browserOpened = true;
    const isWindows = process.platform === "win32";
    const isMac = process.platform === "darwin";
    const openCmd = isWindows ? "start" : isMac ? "open" : "xdg-open";
    const opener = spawn(openCmd, [url], {
      shell: isWindows,
      stdio: "ignore",
      detached: true,
    });

    opener.on("error", (error) => {
      console.warn(`Could not open browser automatically: ${error.message}`);
    });

    opener.unref();
  }
});

child.on("exit", (code) => process.exit(code ?? 0));
