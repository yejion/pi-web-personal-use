// Dispatches /api/* requests to the route handlers generated from app/api.
// Reimplements just the slice of Next's file-system routing this app uses:
// [param] = one segment, [...param] = remaining path.

import { routes } from "./routes.generated";

// Matches the Next route-handler contract: [param] → string, [...param] → string[].
type RouteParams = Record<string, string | string[]>;
type Handler = (req: Request, ctx: { params: Promise<RouteParams> }) => unknown;

interface CompiledRoute {
  regex: RegExp;
  paramNames: string[];
  catchAll: boolean[]; // parallel to paramNames
  module: Record<string, unknown>;
  score: number;
}

function compile(pattern: string): CompiledRoute {
  const paramNames: string[] = [];
  const catchAllFlags: boolean[] = [];
  let catchAll = false;
  const score = pattern
    .split("/")
    .map((seg) => {
      const catchAllMatch = /^\[\.\.\.([^\]]+)\]$/.exec(seg);
      if (catchAllMatch) {
        paramNames.push(catchAllMatch[1]);
        catchAllFlags.push(true);
        catchAll = true;
        return "(.+)";
      }
      const paramMatch = /^\[([^\]]+)\]$/.exec(seg);
      if (paramMatch) {
        paramNames.push(paramMatch[1]);
        catchAllFlags.push(false);
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  // Prefer more segments, fewer dynamic params, no catch-all.
  const segments = pattern.split("/").length;
  const dynamicCount = paramNames.length;
  const scoreValue = segments * 100 - dynamicCount * 10 - (catchAll ? 50 : 0);
  return { regex: new RegExp(`^${score}$`), paramNames, catchAll: catchAllFlags, module: {}, score: scoreValue };
}

const compiled: CompiledRoute[] = routes
  .map((r) => ({ ...compile(r.pattern), module: r.module }))
  .sort((a, b) => b.score - a.score);

export function matchApiRoute(pathname: string): { module: Record<string, unknown>; params: RouteParams } | null {
  for (const route of compiled) {
    const m = route.regex.exec(pathname);
    if (!m) continue;
    const params: RouteParams = {};
    route.paramNames.forEach((name, i) => {
      // Catch-all ([...path]) params arrive as string[] under Next — split
      // BEFORE decoding so an encoded %2F stays inside its own segment.
      params[name] = route.catchAll[i]
        ? m[i + 1].split("/").map(decodeURIComponent)
        : decodeURIComponent(m[i + 1]);
    });
    return { module: route.module, params };
  }
  return null;
}

export async function dispatchApi(req: Request, pathname: string): Promise<Response> {
  const hit = matchApiRoute(pathname);
  if (!hit) return Response.json({ error: "Not found" }, { status: 404 });

  const handler = hit.module[req.method] as Handler | undefined;
  if (!handler) return Response.json({ error: "Method not allowed" }, { status: 405 });

  const result = await handler(req, { params: Promise.resolve(hit.params) });
  if (result instanceof Response) return result;
  // Handlers in this app always return Response; tolerate bare values anyway.
  return Response.json(result ?? null);
}
