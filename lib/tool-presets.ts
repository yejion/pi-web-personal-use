export interface ToolEntry {
  name: string;
  description: string;
  active: boolean;
}

export type ToolPreset = "none" | "default" | "full" | "plan";

export const PRESET_NONE: string[] = [];
export const PRESET_DEFAULT: string[] = ["read", "bash", "edit", "write"];
export const PRESET_PLAN: string[] = ["read", "grep", "find", "ls"];
export const PRESET_FULL: string[] = ["bash", "read", "edit", "write", "grep", "find", "ls"];

const BUILTIN_TOOL_NAMES = new Set(PRESET_FULL);

export function getPresetFromTools(tools: ToolEntry[]): ToolPreset {
  const activeTools = tools.filter((t) => t.active);
  if (activeTools.length === 0) return "none";

  const active = activeTools
    .map((t) => t.name)
    .filter((name) => BUILTIN_TOOL_NAMES.has(name))
    .sort()
    .join(",");

  if (active === [...PRESET_DEFAULT].sort().join(",")) return "default";
  if (active === [...PRESET_FULL].sort().join(",")) return "full";
  return "default";
}

export type PiMode = "manual" | "acceptEdits" | "plan" | "auto";

export const MODE_PRESET_MAP: Record<PiMode, ToolPreset> = {
  manual: "default",
  acceptEdits: "default",
  plan: "default",
  auto: "full",
};

export const MODE_TOOL_MAP: Record<PiMode, string[]> = {
  // set_tools 列表 = auto + ask（deny 排除）；pi 无原生确认粒度，ask 靠 system prompt 约束
  manual: [...PRESET_DEFAULT, "grep", "find", "ls"],
  acceptEdits: [...PRESET_DEFAULT, "grep", "find", "ls"],
  plan: [...PRESET_PLAN],
  auto: [...PRESET_FULL],
};

export function getToolNamesForPreset(preset: ToolPreset): string[] {
  if (preset === "none") return [...PRESET_NONE];
  if (preset === "full") return [...PRESET_FULL];
  if (preset === "plan") return [...PRESET_PLAN];
  return [...PRESET_DEFAULT];
}
