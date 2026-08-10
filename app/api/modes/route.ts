import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const raw = readFileSync(join(process.cwd(), "config", "modes.json"), "utf-8");
    const cfg = JSON.parse(raw) as {
      defaultMode?: string;
      modes?: Record<
        string,
        { label?: string; emoji?: string; auto?: string[]; ask?: string[]; deny?: string[] }
      >;
    };
    const modes = cfg.modes ?? {};
    // Flatten into the shape the frontend consumes:
    // { <mode>: { label, emoji, tools (auto+ask), ask } }
    const out: Record<string, { label: string; emoji?: string; tools: string[]; ask: string[] }> = {};
    for (const [key, m] of Object.entries(modes)) {
      const auto = m.auto ?? [];
      const ask = m.ask ?? [];
      out[key] = {
        label: m.label ?? key,
        emoji: m.emoji,
        tools: [...new Set([...auto, ...ask])],
        ask,
      };
    }
    return NextResponse.json({ defaultMode: cfg.defaultMode, modes: out });
  } catch {
    return NextResponse.json({});
  }
}
