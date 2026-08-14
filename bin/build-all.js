#!/usr/bin/env node
"use strict";

// Phase-2 build pipeline: Next is a build-time-only tool now.
//
//   1. stash app/api + proxy.ts (static export rejects route handlers/middleware)
//   2. next build (PI_WEB_EXPORT=1, output:"export")   → out/           (client)
//   3. restore stashed files
//   4. generate the route manifest                     → server/routes.generated.ts
//   5. esbuild server/index.ts (packages external)     → dist/server.cjs
//   6. @vercel/nft trace dist/server.cjs               → dist/node_modules (only used files)
//   7. copy out/                                       → dist/client/
//
// Result: dist/ is the complete production runtime — no Next server involved.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const stashDir = path.join(root, ".build-stash");
const distDir = path.join(root, "dist");

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited with ${result.status}`);
}

function stash() {
  fs.mkdirSync(stashDir, { recursive: true });
  fs.renameSync(path.join(root, "app", "api"), path.join(stashDir, "api"));
  fs.renameSync(path.join(root, "proxy.ts"), path.join(stashDir, "proxy.ts"));
}

function restore() {
  const stashedApi = path.join(stashDir, "api");
  const stashedProxy = path.join(stashDir, "proxy.ts");
  if (fs.existsSync(stashedApi)) fs.renameSync(stashedApi, path.join(root, "app", "api"));
  if (fs.existsSync(stashedProxy)) fs.renameSync(stashedProxy, path.join(root, "proxy.ts"));
  fs.rmSync(stashDir, { recursive: true, force: true });
}

async function main() {
  const isWin = process.platform === "win32";
  void isWin;
  const nextBin = require.resolve("next/dist/bin/next", { paths: [root] });

  // 1. Route manifest while app/api is still in place.
  console.log("==> route manifest");
  run(process.execPath, [path.join(root, "bin", "build-route-manifest.js")], { cwd: root });

  // 2-4. Static client build with api/middleware stashed away.
  console.log("==> next build (static export)");
  // Stale dev-mode generated types reference app/api routes; with api stashed
  // they fail type-checking. next dev regenerates them on demand.
  fs.rmSync(path.join(root, ".next", "dev"), { recursive: true, force: true });
  stash();
  try {
    run(process.execPath, [nextBin, "build"], {
      cwd: root,
      env: { ...process.env, PI_WEB_EXPORT: "1", NODE_ENV: "production" },
    });
  } finally {
    restore();
  }

  // 5. Bundle OUR code (server/, lib/, app/api/) into one ESM entry; packages
  // stay external and load natively (Node's own CJS/ESM interop — bundling
  // the SDK graph breaks dynamic requires all over it). Route modules are
  // code-split but imported eagerly at boot: measured spawn→ready ≈ 2.3s.
  console.log("==> esbuild server bundle");
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  const esbuild = require("esbuild");
  await esbuild.build({
    entryPoints: [path.join(root, "server", "index.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    splitting: true,
    alias: { "next/server": path.join(root, "server", "next-shim.ts") },
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
  });

  // 6. Trace runtime dependencies into dist/node_modules. emitGlobs off:
  // directory-glob asset emission wanders into unrelated user dirs (and
  // locked files); exact file references (WASM, workers) are still traced.
  console.log("==> nft trace");
  const { nodeFileTrace } = require("@vercel/nft");
  const { fileList } = await nodeFileTrace([path.join(distDir, "index.mjs")], {
    base: root + path.sep,
    analysis: { emitGlobs: false },
    ignore: (p) => p.startsWith(".."),
  });
  let copied = 0;
  for (const rel of fileList) {
    if (rel.startsWith("dist" + path.sep) || rel === "dist") continue;
    const from = path.join(root, rel);
    const to = path.join(distDir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied += 1;
  }
  console.log(`nft trace: ${copied} files -> dist/`);

  // 7. Mirror runtime assets that must exist as real files at their original
  // package-relative locations (pi SDK themes/WASM/workers/extension deps).
  console.log("==> asset mirror");
  const mirrored = mirrorPackageAssets();
  console.log(`asset mirror: ${mirrored} files`);

  // 8. Client assets.
  console.log("==> copy client");
  const outDir = path.join(root, "out");
  copyTree(outDir, path.join(distDir, "client"));

  const size = dirSize(distDir);
  console.log(`build complete: dist/ = ${(size / 1024 / 1024).toFixed(1)} MB`);
}

// pi SDK + its createRequire-resolved extension deps need real files on
// disk (workers, WASM, theme JSONs, typebox for extension compilation).
// Mirrors those into dist/node_modules; JS stays bundled except the entries
// listed in WHOLE_PACKAGES (resolved dynamically, so bundling them breaks
// require.resolve at runtime).
function mirrorPackageAssets() {
  const ASSET_EXTS = new Set([".json", ".wasm", ".node"]);
  const WHOLE_PACKAGES = ["typebox", "undici"];
  let copied = 0;

  const mirror = (pkgDir, destDir, { includeJs }) => {
    if (!fs.existsSync(pkgDir)) return;
    walkFiles(pkgDir, (file) => {
      const ext = path.extname(file).toLowerCase();
      const base = path.basename(file);
      const wanted = includeJs || (ASSET_EXTS.has(ext) && base !== "package.json");
      if (!wanted) return;
      const to = path.join(destDir, path.relative(pkgDir, file));
      if (fs.existsSync(to)) return;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(file, to);
      copied += 1;
    });
  };

  const piPkgsDir = path.join(root, "node_modules", "@earendil-works");
  for (const pkg of fs.readdirSync(piPkgsDir)) {
    const pkgDir = path.join(piPkgsDir, pkg);
    if (!fs.statSync(pkgDir).isDirectory()) continue;
    mirror(pkgDir, path.join(distDir, "node_modules", "@earendil-works", pkg), { includeJs: false });
  }
  for (const pkgName of WHOLE_PACKAGES) {
    mirror(path.join(root, "node_modules", pkgName), path.join(distDir, "node_modules", pkgName), { includeJs: true });
  }
  return copied;
}

function walkFiles(dir, fn) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, fn);
    else fn(full);
  }
}

// Hand-rolled copy — fs.cpSync hard-crashes on some Windows setups.
function copyTree(from, to) {
  const stat = fs.lstatSync(from);
  if (stat.isSymbolicLink()) return copyTree(fs.realpathSync(from), to);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) copyTree(path.join(from, entry), path.join(to, entry));
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

main().catch((error) => {
  restore();
  console.error(error);
  process.exit(1);
});
