// Embedded pi-web server — replaces the Next.js runtime in production.
//
//   Node http server
//     ├─ /api/*  → cross-origin guard (lib/request-security) → route adapter
//     └─ *       → static files from the exported client build
//
// Used by bin/pi-web.js (npm CLI) and electron/main.js (desktop, via
// server-child.js). Dev mode still runs `next dev` — this server never sees it.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configureHttpDispatcher } from "@/lib/http-dispatcher";
import { isApiRequestOriginAllowed, shouldCheckApiRequestOrigin } from "@/lib/request-security";
import { dispatchApi } from "./adapter";
import { sendWebResponse, toWebRequest } from "./node-web";
import { createStaticHandler } from "./static";

const DEFAULT_PORT = 30141;
const DEFAULT_HOSTNAME = "127.0.0.1";

export interface EmbeddedServerOptions {
  port?: number;
  hostname?: string;
  staticDir?: string;
}

// Works in both the CJS bundle (__dirname) and direct TS execution (import.meta).
const HERE = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

export function createEmbeddedServer(options: EmbeddedServerOptions = {}): {
  server: http.Server;
  listen: () => Promise<void>;
  close: () => Promise<void>;
  url: string;
} {
  const port = options.port ?? Number(process.env.PORT ?? DEFAULT_PORT);
  const hostname = options.hostname ?? (process.env.HOSTNAME ?? DEFAULT_HOSTNAME);
  const staticDir = options.staticDir
    ?? process.env.PI_WEB_STATIC_DIR
    ?? path.join(HERE, "client");

  configureHttpDispatcher();

  // Warm the session-list cache in the background (same as instrumentation.ts
  // did under the Next runtime).
  void import("@/lib/session-reader")
    .then(({ listAllSessions }) => listAllSessions())
    .catch(() => { /* warm-up is best-effort */ });

  const serveStatic = createStaticHandler(staticDir);
  const url = `http://${hostname}:${port}`;

  const server = http.createServer((req, res) => {
    void (async () => {
      const webReq = toWebRequest(req, hostname, port);
      const pathname = new URL(webReq.url).pathname;

      if (pathname.startsWith("/api/")) {
        // Same cross-origin guard proxy.ts enforced under Next middleware.
        if (shouldCheckApiRequestOrigin(webReq) && !isApiRequestOriginAllowed(webReq)) {
          res.statusCode = 403;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "Cross-origin API requests are not allowed" }));
          return;
        }
        const webRes = await dispatchApi(webReq, pathname);
        await sendWebResponse(res, webRes);
        return;
      }

      if (!serveStatic(pathname, res)) {
        res.statusCode = 404;
        res.end("Not found");
      }
    })().catch((error) => {
      try {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
        }
        res.end(JSON.stringify({ error: String(error) }));
      } catch { /* socket already gone */ }
    });
  });

  const listen = () =>
    new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, hostname, () => {
        server.off("error", reject);
        resolve();
      });
    });

  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return { server, listen, close, url };
}

// Auto-start when executed directly (bundled dist/server.cjs or node --experimental-strip-types).
const isDirectRun = (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module)
  || (() => {
    try {
      return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
    } catch {
      return false;
    }
  })();

if (isDirectRun) {
  const { listen, url } = createEmbeddedServer();
  listen()
    .then(() => console.log(`pi-web ready on ${url}`))
    .catch((error) => {
      console.error(`pi-web failed to start: ${error}`);
      process.exit(1);
    });
}
