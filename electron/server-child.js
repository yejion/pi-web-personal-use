"use strict";

// Pi Web Desktop — Next.js server child entry.
//
// Launched by electron/main.js as:
//   pi-web.exe(ELECTRON_RUN_AS_NODE) server-child.js <nextBin> <next args...>
//
// The Electron main process can die without running its before-quit handler
// (installer force-terminate, crash, kill). The server child has no window,
// so the NSIS installer's WM_CLOSE cannot reach it either — an orphaned
// server keeps locking files under the install directory and upgrades fail
// with "cannot close pi-web". This watchdog polls the parent and self-exits
// when it is gone.

const parentPid = Number(process.env.PI_WEB_PARENT_PID);
if (Number.isInteger(parentPid) && parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0); // signal 0: existence check only
    } catch {
      process.exit(0);
    }
  }, 1000).unref();
}

const [, , serverEntry, ...serverArgs] = process.argv;
if (!serverEntry) {
  console.error("server-child: missing server entry path");
  process.exit(1);
}

// Re-argv so the server parses as if it were launched directly.
process.argv = [process.execPath, serverEntry, ...serverArgs];
if (serverEntry.endsWith(".mjs")) {
  import(serverEntry);
} else {
  require(serverEntry);
}
