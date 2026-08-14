// Bridges Node's http module to the Web Fetch API (Request/Response) that the
// route handlers are written against.

import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

export function toWebRequest(req: IncomingMessage, host: string, port: number): Request {
  const url = `http://${host}:${port}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = req.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(req) as ReadableStream;
    init.duplex = "half"; // required by undici when body is a stream
  }
  const request = new Request(url, init);
  // NextRequest compat: handlers read request.nextUrl.searchParams. Next's
  // nextUrl is a URL subclass — a plain URL covers every usage in app/api.
  (request as { nextUrl?: URL }).nextUrl = new URL(url);
  return request;
}

export async function sendWebResponse(res: ServerResponse, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-encoding") return; // identity only
    res.setHeader(key, value);
  });

  if (!webRes.body) {
    res.end();
    return;
  }

  const reader = webRes.body.getReader();
  // Client disconnected (tab closed, SSE aborted) — cancel upstream so the
  // stream's cleanup (unsubscribe, heartbeat clear) runs.
  res.on("close", () => {
    void reader.cancel().catch(() => {});
  });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && !res.write(value)) await once(res, "drain");
    }
    res.end();
  } catch {
    res.destroy();
  }
}
