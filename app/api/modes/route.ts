import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function loadModes() {
  var extPath = join(homedir(), ".pi/agent/extensions/mode-switcher/index.ts");
  try {
    if (!existsSync(extPath)) return getFallback();
    var src = readFileSync(extPath, "utf-8");
    var start = src.indexOf("const MODES");
    if (start < 0) return getFallback();
    // Find the object literal after =
    var eq = src.indexOf("=", start);
    var brace = src.indexOf("{", eq);
    if (brace < 0) return getFallback();
    // Find matching closing brace
    var depth = 0;
    var i = brace;
    while (i < src.length) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) break; }
      i++;
    }
    var objStr = src.substring(brace, i + 1);
    // Parse key: { name, label, emoji } entries
    var modes = {};
    var re = /(w+):s*{[^}]*name:s*"(w+)"[^}]*label:s*"([^"]+)"[^}]*emoji:s*"([^"]+)"[^}]*}/g;
    var m;
    while ((m = re.exec(objStr)) !== null) {
      modes[m[1]] = { name: m[2], label: m[3], emoji: m[4] };
    }
    if (Object.keys(modes).length > 0) return modes;
    return getFallback();
  } catch (e) {
    return getFallback();
  }
}

function getFallback() {
  return {
    allallow: { name: "allallow", label: "AllAllow", emoji: "🤖" },
    plan: { name: "plan", label: "Plan", emoji: "📋" },
    auto: { name: "auto", label: "Auto", emoji: "🛡️" },
    writeallow: { name: "writeallow", label: "WriteAllow", emoji: "✏️" },
  };
}

export async function GET() {
  return NextResponse.json(loadModes());
}
