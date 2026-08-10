# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal fork of `agegr/pi-web` — a local web UI for the [pi coding agent](https://github.com/badlogic/pi-mono) — repackaged primarily as a Windows Electron desktop app (`pi-web-personal`). The pi SDK (`@earendil-works/pi-*`) runs **in-process** inside the Next.js server; there is no separate agent daemon.

`AGENTS.md` is the authoritative dev notebook with the full file map, design traps, and the pi `.jsonl` session file format — read it before touching session/agent logic. `docs/release.md` documents this fork's desktop release flow (GitHub Actions, no npm publishing); the `release` script in `package.json` is inherited from upstream and is not used by this fork.

## Commands

```bash
npm run dev                     # Next.js dev server on 127.0.0.1:30141
node_modules/.bin/tsc --noEmit  # typecheck
npm run lint                    # eslint
node --test                     # all tests (node:test, *.test.mjs colocated with source)
node --test lib/ansi.test.mjs   # single test file
```

- Tests import `.ts` via Node's native type stripping (requires Node ≥ 22.19, hence `engines`) and `.tsx` component tests via `jiti` (see `components/ChatInput.test.mjs`). There is no `npm test` script.
- **Never run `next build` / `npm run build` while developing** — it pollutes `.next/` and breaks `npm run dev`. Builds are release-only.
- Desktop: `npm run desktop` runs Electron against a previously built `.next/` (fails without one). `npm run desktop:build` = `next build` + electron-builder → Windows NSIS installer + portable exe in `release/`.
- Releases are built by `.github/workflows/build-desktop.yml` (manual `workflow_dispatch`, windows-latest): bumps a timestamped `*-build.yyyyMMddHHmm` version, builds, and creates a GitHub Release with the installers.

## Architecture

```
Browser                Next.js server                 AgentSession (in-process)
  │ GET /api/sessions ───▶ reads ~/.pi/agent/sessions/*.jsonl directly (no agent)
  │ POST /api/agent/[id] ─▶ startRpcSession() ───────▶ createAgentSession()
  │ GET  .../[id]/events ─▶ SSE ◀── session.onEvent() ◀── session.subscribe()
```

- **Two read paths**: session browsing parses `.jsonl` files via `lib/session-reader.ts`; sending messages goes through `lib/rpc-manager.ts`, which owns one `AgentSessionWrapper` per session id.
- **Wrappers live on `globalThis.__piSessions`** (plus `__piStartLocks`, `__piLoginCallbacks`) so they survive Next.js hot-reload — a module-level Map would leak/lose live agent sessions. Idle timeout is 10 min.
- **Fork destroys the wrapper immediately.** `AgentSession.fork()` mutates the wrapper's inner state to the *new* session id; `send("fork")` captures the new id then calls `destroy()` so the next request reloads a clean session from the original file. Leaving the old wrapper registered corrupts the `parentSession` chain.
- **Two kinds of branching**: Fork = new `.jsonl` file (sidebar child via `parentSession` header); in-session branch = `navigate_tree` within one file (`/api/sessions/[id]/context?leafId=`). Don't conflate them.
- **toolCall normalization**: pi stores `{id, name, arguments}` but our types use `{toolCallId, toolName, input}` — `lib/normalize.ts#normalizeToolCalls()` must be applied on both file load and streaming paths.
- **SSE + reconciliation**: per-session SSE is primary, but `useAgentSession` also polls `GET /api/agent/[id]` during runs and reconciles on `visibilitychange`/`online`; prompt runs carry a monotonic run id so late events from an old run are discarded. Compaction events come in both `compaction_*` and legacy `auto_compaction_*` forms — accept both.
- **Security boundaries**: `proxy.ts` (Next 16 middleware) rejects cross-origin `/api/*` mutations via `lib/request-security.ts`; `lib/file-access.ts` is an allow-list of browsable roots (session cwds, project roots, `~/pi-cwd-*`, explicit `allowFileRoot()`) guarding `/api/files`, `/api/git/*`, `/api/file-index`, `/api/worktrees`. There is no auth — keep the loopback default.
- **Session files can be fully rewritten** (`writeFileSync`) — `parentSession` in the header is display metadata only; used when cascade-reparenting children on delete.

## Electron packaging

- `electron/main.js` spawns `next start -p 30141 -H 127.0.0.1` using the Electron binary itself as Node (`ELECTRON_RUN_AS_NODE=1`), so the shipped app needs no system Node. Server output is logged to `<userData>/logs/pi-web-server.log`.
- electron-builder uses `asar: false`; packaged layout is `resources/app/` with `electron/`, `bin/`, `.next/`, `public/`.
- `bin/postinstall.js` (runs on `npm install`) copies `node_modules/<pkg>` to the hashed names (`<pkg>-<16hex>`) that the Next build's server chunks reference as externals — required for the packaged/CLI server to boot, harmless no-op in dev.
- `bin/pi-web.js` is the CLI launcher (`--port/-p`, `--hostname/-H`, `--no-open`; env `PORT`, `PI_WEB_HOSTNAME`, `PI_WEB_NO_OPEN`), resolving `next/dist/bin/next` directly to avoid `.bin` symlink issues under npx.
- `agegr-pi-web-0.8.1.tgz` in the repo root is the upstream npm tarball kept for reference; nothing in the build references it.

## Environment

- `PI_CODING_AGENT_DIR` — override the pi agent dir (default `~/.pi/agent`); sessions live in `<dir>/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`.
- `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` — picked up for server-side model/API requests via `lib/http-dispatcher.ts` (initialized in `instrumentation.ts`).
