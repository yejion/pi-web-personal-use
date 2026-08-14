// Runtime shim for "next/server" used by the embedded production server.
// Route handlers only ever use NextResponse.json (209 call sites) — native
// Response.json in Node ≥ 18.18 is behaviorally identical. Types are
// typechecked against the real next/server in dev; this shim is runtime-only
// and gets aliased in by esbuild (see bin/build-all.js).

export const NextResponse = {
  json(data: unknown, init?: ResponseInit): Response {
    return Response.json(data, init);
  },
};

export type NextRequest = Request;
