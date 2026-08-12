"use strict";

// Pi Web Desktop — Electron wrapper.
// Bundles the pi-web Next.js server and a browser window into a single
// distributable desktop app.

const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 30141;
const HOST = "127.0.0.1";
const URL = `http://${HOST}:${PORT}`;

let serverProcess = null;
let mainWindow = null;
let quitting = false;

function resolvePkgDir() {
  // Dev: project root. Packaged (asar:false): resources/app.
  return __dirname.replace(/[\\/]electron$/, "");
}

// Log server output to a file so failures can be diagnosed.
function logFile() {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "pi-web-server.log");
  } catch {
    return path.join(process.env.TEMP || "/tmp", "pi-web-server.log");
  }
}
const LOG = logFile();

function appendLog(text) {
  try {
    fs.appendFileSync(LOG, text);
  } catch { /* ignore */ }
}

function waitForServer(timeoutMs, onReady, onFail) {
  const started = Date.now();
  const net = require("net");
  const check = () => {
    if (quitting) return;
    const socket = net.connect(PORT, HOST);
    socket.on("connect", () => {
      socket.destroy();
      onReady();
    });
    socket.on("error", () => {
      socket.destroy();
      if (Date.now() - started > timeoutMs) {
        onFail(new Error(`Timed out waiting for ${URL}`));
      } else {
        setTimeout(check, 300);
      }
    });
  };
  check();
}

function isPortInUse() {
  return new Promise((resolve) => {
    const net = require("net");
    const socket = net.connect(PORT, HOST);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
  });
}

function startPiWebServer() {
  const pkgDir = resolvePkgDir();
  const nextDir = path.join(pkgDir, ".next");

  appendLog(`\n[${new Date().toISOString()}] starting pi-web server\n`);
  appendLog(`  pkgDir: ${pkgDir}\n`);
  appendLog(`  nextDir exists: ${fs.existsSync(nextDir)}\n`);

  if (!fs.existsSync(nextDir)) {
    appendLog("  FATAL: build artifacts not found\n");
    return null;
  }

  let nextBin;
  try {
    nextBin = require.resolve("next/dist/bin/next", { paths: [pkgDir] });
  } catch {
    try {
      const nextPkg = require.resolve("next/package.json", { paths: [pkgDir] });
      nextBin = path.join(path.dirname(nextPkg), "dist", "bin", "next");
    } catch {
      nextBin = path.join(pkgDir, "node_modules", "next", "dist", "bin", "next");
    }
  }
  appendLog(`  nextBin: ${nextBin}\n`);

  const args = [path.join(__dirname, "server-child.js"), nextBin, "start", "-p", String(PORT), "-H", HOST];

  const child = spawn(process.execPath, args, {
    cwd: pkgDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      // Lets the server child self-exit if this main process dies without a
      // graceful quit (installer force-kill, crash) — see server-child.js.
      PI_WEB_PARENT_PID: String(process.pid),
    },
    windowsHide: false,
  });

  child.stdout.on("data", (d) => appendLog(d.toString()));
  child.stderr.on("data", (d) => appendLog(d.toString()));

  child.on("error", (err) => {
    appendLog(`  spawn error: ${err.message}\n`);
  });
  child.on("exit", (code, signal) => {
    appendLog(`  server exited code=${code} signal=${signal}\n`);
    if (!quitting) {
      dialog.showErrorBox(
        "Pi Web 已退出",
        `内置服务器已退出（code=${code}）。\n\n日志: ${LOG}`,
      );
    }
  });

  return child;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Pi Web",
    autoHideMenuBar: true,
    backgroundColor: "#1a1a1a",
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(URL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}

app.whenReady().then(async () => {
  const inUse = await isPortInUse();
  if (inUse) {
    appendLog("port already in use, reusing existing server\n");
    createWindow().loadURL(URL);
    return;
  }
  serverProcess = startPiWebServer();

  waitForServer(
    40000,
    () => {
      if (quitting) return;
      const win = createWindow();
      win.loadURL(URL);
    },
    (err) => {
      appendLog(`  FATAL: ${err.message}\n`);
      dialog.showErrorBox(
        "Pi Web 启动失败",
        `${err.message}\n\n请查看日志: ${LOG}`,
      );
      app.quit();
    },
  );

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverProcess) {
      const win = createWindow();
      win.loadURL(URL);
    }
  });
});

app.on("before-quit", () => {
  quitting = true;
  killServerProcessTree();
});

// Kill the server AND its whole process tree (agent bash commands can leave
// grandchildren behind). serverProcess.kill() alone only signals the direct
// child, and on Windows there is no SIGTERM — TerminateProcess on the child
// would orphan anything it spawned.
// spawnSync, not fire-and-forget spawn: the main process exits right after
// before-quit, and the tree must be dead before that. An orphaned server
// child is windowless, so the NSIS installer's graceful WM_CLOSE can never
// reach it and the next install/uninstall gets stuck on "cannot close pi-web".
function killServerProcessTree() {
  if (!serverProcess || serverProcess.killed) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      serverProcess.kill("SIGKILL");
    }
  } catch { /* ignore */ }
}

app.on("window-all-closed", () => {
  app.quit();
});
