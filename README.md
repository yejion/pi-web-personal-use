# Pi Web — Personal Desktop

[中文文档](./README.zh-CN.md)

Personal fork of [pi-web](https://github.com/agegr/pi-web), a local web UI for the [pi coding agent](https://github.com/badlogic/pi-mono), repackaged as a Windows desktop app. Pi Web reads your local pi session files and gives you a browser-style workspace for session browsing, real-time chat, model configuration, skill/plugin management, Git worktrees, and project file preview.

![Pi Web shows the same pi session with structured Markdown, tool calls, and project navigation beside the CLI](./docs/screenshot2.png)

## Quick Start (Desktop App — recommended)

Download the latest build from [GitHub Releases](https://github.com/yejion/pi-web-personal-use/releases):

- **`Pi-Web-Setup-*.exe`** — installer (recommended, creates a desktop shortcut)
- **`Pi-Web-Setup-*-portable.exe`** — portable build (no install, just run)

The desktop app bundles its own runtime — **no Node.js installation required**. It starts the Pi Web server locally (`127.0.0.1:30141`) and opens the workspace in a desktop window.

## Run from Source

Requires Node.js **22.19.0 or newer** (`node --version` to check).

```bash
npm install
npm run build
npm start          # serve on http://127.0.0.1:30141
```

Or launch the desktop window from source (needs a prior `npm run build`):

```bash
npm run desktop
```

For development, use `npm run dev` instead of building — see [Development](#development).

**CLI options** (when started via `npm start` / the `pi-web` launcher):

```bash
pi-web --port 8080              # custom port
pi-web --hostname 0.0.0.0       # expose on a trusted network
pi-web -p 8080 -H 0.0.0.0       # combine options
pi-web --no-open                # do not open the browser automatically

PORT=8080 pi-web                # environment variable is also supported
PI_WEB_HOSTNAME=0.0.0.0 pi-web  # explicit network exposure
PI_WEB_NO_OPEN=1 pi-web         # useful when running as a background service
```

> [!WARNING]
> Pi Web has no application-level authentication and can invoke a high-privilege agent. Do not expose it to the internet; only use non-loopback bindings on a trusted network.

## HTTP Proxy

Pi Web reads the standard `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` environment variables for server-side model and API requests.

On macOS or Linux:

```bash
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
NO_PROXY=localhost,127.0.0.1 \
npm start
```

On Windows PowerShell:

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:NO_PROXY = "localhost,127.0.0.1"
npm start
```

## Features

- **Pick work back up**: browse previous pi conversations by project without digging through terminal history or session paths.
- **Try different directions safely**: continue from an earlier message (in-session branch) or fork a session into a separate route.
- **Work across branches**: switch Git worktrees from the sidebar so new sessions and the Explorer follow the checkout you choose.
- **Chat beside the project**: browse files on the left and preview source, diffs, docs, images, audio, PDFs, and DOCX on the right while the agent works.
- **Git integration**: see working-tree status per project and inspect per-file diffs from the UI.
- **Fast file references**: fuzzy file search across the project (git-aware, respects `.gitignore`) for quickly pointing the agent at files.
- **Bottom status bar**: real-time session cost (calculated from model pricing) and context usage shown below the input, updated during runs and persisted across restarts.
- **See session state clearly**: context usage, cost, compaction state, and system prompt details are visible from the top bar.
- **Configure less from the terminal**: manage models, login/API keys, model tests, plugins, and skill switches from the web UI.
- **Rich rendering**: Markdown with GFM, KaTeX math, Mermaid diagrams, and syntax-highlighted code; export any session as standalone HTML.

## Notes

- **Data directory**: Pi Web reads `~/.pi/agent/sessions` by default. Set `PI_CODING_AGENT_DIR` to point at another pi agent directory.
- **Session files**: files are stored as `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`.
- **Model config**: the Models panel reads and writes `models.json` in the pi agent directory. Model lists and defaults come from pi's config.
- **File access**: file browsing and preview are scoped to the selected project directory and working directories that appear in sessions.
- **Git worktrees**: see [Worktrees in Pi Web](./docs/worktrees.md) for when the switcher appears, how new worktrees are created, and what removal does.
- **Forks vs in-session branches**: Fork creates a new `.jsonl` file. "Edit from here" creates another branch inside the same session file.
- **Desktop logs**: if the desktop app fails to start, check `pi-web-server.log` under the app's `logs` directory (path shown in the error dialog).

## Development

```bash
npm install
npm run dev        # http://127.0.0.1:30141
```

Common checks:

```bash
node_modules/.bin/tsc --noEmit   # typecheck
npm run lint                     # eslint
node --test                      # all tests (node:test, *.test.mjs colocated with source)
node --test lib/ansi.test.mjs    # single test file
```

Tests import `.ts` sources via Node's native type stripping (hence the Node ≥ 22.19 requirement) and `.tsx` components via `jiti`.

Avoid running `next build` / `npm run build` during local development. It writes to `.next/` and can interfere with the dev server; leave builds for release work.

### Desktop build

```bash
npm run build
npm run desktop        # smoke-test the Electron shell locally
npm run desktop:build  # produce Windows NSIS + portable installers in release/
```

Releases are built by GitHub Actions: manually dispatch the **Build and Release Pi Web Desktop** workflow (`.github/workflows/build-desktop.yml`). It stamps a unique `*-build.<timestamp>` version, builds the installers, and publishes a GitHub Release automatically.

## Project Structure

```text
app/
  api/
    agent/          # creates/drives AgentSession, SSE events, bash output
    auth/           # OAuth and API key management
    cwd/            # directory browsing and working-directory validation
    default-cwd/    # default working directory (~/pi-cwd-*)
    file-index/     # project-wide fuzzy file index/search
    files/          # file reading and preview (allow-list guarded)
    git/            # working-tree status and per-file diffs
    home/           # current user home directory
    models/         # available models, default model
    models-config/  # read/write models.json and test models
    plugins/        # package plugin management
    sessions/       # session reads, rename, delete, context, state, export, auto-name
    skills/         # skill listing, search, install, update, enable/disable
    worktrees/      # git worktree list/create/remove
components/
  AppShell.tsx        # main layout, URL state, tab management
  SessionSidebar.tsx  # project selector, session tree, Explorer
  DirectoryPicker.tsx # working directory picker (browse, type path, switch drives)
  ChatWindow.tsx      # messages, SSE, drag/drop, minimap
  ChatInput.tsx       # input bar, model/tools/thinking/compact controls, cost/context display
  MessageView.tsx     # message, thinking, tool call/result rendering
  MarkdownBody.tsx    # Markdown renderer (GFM, KaTeX, Mermaid via MermaidBlock)
  ModelsConfig.tsx    # model and auth configuration panel
  PluginsConfig.tsx   # installed package plugins panel
  SkillsConfig.tsx    # skill management panel
  FileExplorer.tsx    # file tree
  FileViewer.tsx      # source, diff, image, audio, PDF, DOCX preview
  TabBar.tsx          # chat + open file tabs
  BranchNavigator.tsx # in-session branch switcher
  ChatMinimap.tsx     # scroll minimap
electron/
  main.js             # desktop shell: instant splash window, spawns the embedded server
  server-child.js     # server entry wrapper: parent-death watchdog, then requires server.js
lib/
  rpc-manager.ts      # AgentSessionWrapper lifecycle and global registry
  session-reader.ts   # parses .jsonl session files and branch contexts
  normalize.ts        # normalizes toolCall field names
  file-access.ts      # file access allow-list (security boundary)
  request-security.ts # cross-origin API request guard (used by proxy.ts)
  git-changes.ts      # git status/diff helpers
  file-fuzzy.ts       # fuzzy file index/search
  worktree.ts         # project/worktree resolution and git worktree operations
  http-dispatcher.ts  # HTTP(S) proxy setup for server-side fetch
hooks/
  useAgentSession.ts  # session loading, command sending, SSE state machine
  useAudio.ts         # completion sound
  useKeyboardShortcuts.ts
  useTheme.ts         # theme switching
bin/
  pi-web.js           # CLI entrypoint (runs dist/index.mjs)
  build-route-manifest.js # generates server/routes.generated.ts from app/api
  build-all.js          # phase-2 build: static client export + esbuild server bundle + nft trace
proxy.ts              # Next.js middleware guarding /api/* against cross-origin requests
instrumentation.ts    # initializes the server HTTP dispatcher
```

`AGENTS.md` contains the full developer notebook: architecture diagrams, design traps (fork semantics, SSE reconciliation, session file format), and the complete API route map.

## Credits

Based on [agegr/pi-web](https://github.com/agegr/pi-web) by its original authors. This fork is maintained for personal use; upstream credit and license (MIT) are retained in [LICENSE](./LICENSE).
