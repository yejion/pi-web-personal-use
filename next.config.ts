import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  const piPkgPath = join(__dirname, "node_modules/@earendil-works/pi-coding-agent/package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

const nextConfig: NextConfig = {
  // PI_WEB_EXPORT=1: static client build for the embedded production server
  // (server/ + dist/server.cjs serve it). Otherwise: standalone bundle.
  // app/api and proxy.ts are stashed away by bin/build-all.js during export.
  output: process.env.PI_WEB_EXPORT === "1" ? "export" : "standalone",
  serverExternalPackages: [
    "undici",
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
  ],
  allowedDevOrigins: ['192.168.*.*'],
  // Static export does not support headers(); the embedded server sets the
  // same Cache-Control itself (see server/static.ts).
  ...(process.env.PI_WEB_EXPORT === "1" ? {} : {
    async headers() {
      return [
        {
          source: "/",
          headers: [
            { key: "Cache-Control", value: "private, no-cache, max-age=0, must-revalidate" },
          ],
        },
      ];
    },
  }),
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
};

export default nextConfig;
