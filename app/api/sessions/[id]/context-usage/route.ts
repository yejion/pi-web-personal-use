import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { resolveSessionPath } from "@/lib/session-reader";

function cachePath(sessionPath: string): string {
  return sessionPath.replace(/.jsonl$/, ".ctx.json");
}

// GET: load cached context usage
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const cp = cachePath(filePath);
    if (!existsSync(cp)) return NextResponse.json(null);
    return NextResponse.json(JSON.parse(readFileSync(cp, "utf8")));
  } catch {
    return NextResponse.json(null);
  }
}

// PUT: save context usage
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = await req.json();
    const cp = cachePath(filePath);
    const dir = dirname(cp);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(cp, JSON.stringify(body), "utf8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
