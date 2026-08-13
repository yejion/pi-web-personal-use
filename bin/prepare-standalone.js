#!/usr/bin/env node
"use strict";

// Next's standalone output intentionally excludes .next/static and public/ —
// copy them into the standalone tree so it is truly self-contained and can be
// packaged/shipped as a single directory.
//
// NOTE: fs.cpSync hard-crashes (silent exit 127) on some Windows setups, so
// this uses a hand-rolled recursive copy instead.

const fs = require("fs");
const path = require("path");

function copyTree(from, to) {
  const stat = fs.lstatSync(from);
  if (stat.isSymbolicLink()) {
    // Dereference: copy the link target's contents.
    copyTree(fs.realpathSync(from), to);
    return;
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyTree(path.join(from, entry), path.join(to, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("prepare-standalone: .next/standalone/server.js not found — run `next build` first.");
  process.exit(1);
}

const copies = [
  [path.join(root, ".next", "static"), path.join(standalone, ".next", "static")],
  [path.join(root, "public"), path.join(standalone, "public")],
];

for (const [from, to] of copies) {
  if (!fs.existsSync(from)) {
    console.warn(`prepare-standalone: skipping missing ${path.relative(root, from)}`);
    continue;
  }
  fs.rmSync(to, { recursive: true, force: true });
  copyTree(from, to);
  console.log(`prepare-standalone: ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}
