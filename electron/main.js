"use strict";

// Pi Web Desktop — Electron wrapper.
// Bundles the pi-web Next.js server and a browser window into a single
// distributable desktop app. Double-click the exe → pi agent starts →
// the pi-web interface opens in its own window.

const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = 30141;
const HOST = "127.0.0.1";
const URL = `http://${HOST}:${PORT}`;

let serverProcess = null;
let mainWindow = null;
let quitting = false;

function resolvePkgDir() {
  // In dev: project root. In packaged asar: app.asar.
  return __dirname.replace(/[\\/]electron$/, "");
}

function waitForServer(url, timeoutMs, onReady, onFail) {
  const started = Date.now();
  const check = () => {
    if (quitting) return;
    const net = require("net");
    const [host, port] = [HOST, PORT];
    const socket = net.connect(port, host);
    socket.on("connect", () => {
      socket.destroy();
      onReady();
    });
    socket.on("error", () => {
      socket.destroy();
      if (Date.now() - started > timeoutMs) {
        onFail(new Error(`Timed out waiting for ${url}`));
      } else {
        setTimeout(check, 250);
      }
    });
  };
  check();
}

function startPiWebServer() {
  const pkgDir = resolvePkgDir();
  const nextDir = path.join(pkgDir, ".next");

  if (!fs.existsSync(nextDir)) {
    console.error("Build artifacts not found:", nextDir);
    return null;
  }

  // Resolve next's CLI entry.
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

  const args = ["start", "-p", String(PORT), "-H", HOST];

  // ELECTRON_RUN_AS_NODE makes the Electron executable act as plain Node so it
  // can run Next.js server code directly — no separate Node install needed.
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: pkgDir,
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
    windowsHide: false,
  });

  child.on("error", (err) => {
    console.error("Failed to start pi-web server:", err);
  });
  child.on("exit", (code, signal) => {
    if (!quitting) {
      console.error(`pi-web server exited (code=${code}, signal=${signal})`);
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
    webPreferences: {
      // Keep sandbox default; the window only talks to the local server.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links (non-local) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(URL)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(() => {
  serverProcess = startPiWebServer();

  waitForServer(
    URL,
    30000,
    () => {
      if (quitting) return;
      const win = createWindow();
      win.loadURL(URL);
    },
    (err) => {
      console.error(err);
      if (!quitting) {
        const win = createWindow();
        win.loadFile(path.join(__dirname, "start-error.html"), {
          query: { message: encodeURIComponent(err.message) },
        });
      }
    },
  );

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      win.loadURL(URL);
    }
  });
});

app.on("before-quit", () => {
  quitting = true;
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill();
    } catch { /* ignore */ }
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
