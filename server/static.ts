// Static file serving for the exported client build (next build with
// output:"export"). Traversal-safe; long-cache for hashed /_next/static assets.

import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

export function createStaticHandler(rootDir: string) {
  const root = path.resolve(rootDir);

  /** Returns true when the request was served (or answered with an error). */
  return function serveStatic(pathname: string, res: ServerResponse): boolean {
    const rel = pathname === "/" ? "/index.html" : pathname;
    const filePath = path.resolve(root, "." + rel);

    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return true;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return false;
    }
    if (!stat.isFile()) return false;

    res.statusCode = 200;
    res.setHeader("content-type", MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("content-length", stat.size);
    res.setHeader(
      "cache-control",
      rel.startsWith("/_next/static/")
        ? "public, max-age=31536000, immutable"
        : "private, no-cache, max-age=0, must-revalidate",
    );
    fs.createReadStream(filePath).pipe(res);
    return true;
  };
}
