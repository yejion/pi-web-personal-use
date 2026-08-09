/**
 * Mode Switcher Extension — 4 种工作模式
 *
 * 模式列表：
 *   🤖 AllAllow   — 全自动执行，无需确认（当前默认行为）
 *   📋 Plan       — 只读探索模式，先制定计划再执行
 *   🛡️ Auto       — 所有命令（bash/edit/write）都需要用户确认
 *   ✏️ WriteAllow — 写入命令（edit/write）自动放行，bash 命令需要确认
 *
 * 使用方法：
 *   /mode            — 在四种模式间循环切换
 *   /mode <name>     — 直接切换到指定模式
 *   Ctrl+Alt+M       — 快捷键循环切换
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// ─── 类型定义 ─────────────────────────────────────────────

type ModeName = "allallow" | "plan" | "auto" | "writeallow";

interface ModeDef {
  name: ModeName;
  label: string;       // 状态栏显示
  emoji: string;
  description: string;
}

const MODES: Record<ModeName, ModeDef> = {
  allallow: {
    name: "allallow",
    label: "AllAllow",
    emoji: "🤖",
    description: "全自动执行，无需确认",
  },
  plan: {
    name: "plan",
    label: "Plan",
    emoji: "📋",
    description: "只读探索，先制定计划再执行",
  },
  auto: {
    name: "auto",
    label: "Auto",
    emoji: "🛡️",
    description: "所有命令都需要用户确认",
  },
  writeallow: {
    name: "writeallow",
    label: "WriteAllow",
    emoji: "✏️",
    description: "写入+安全bash自动放行，危险bash需确认",
  },
};

const MODE_ORDER: ModeName[] = ["allallow", "plan", "auto", "writeallow"];

// ─── Plan 模式：安全 bash 命令白名单 ─────────────────────

const DESTRUCTIVE_PATTERNS = [
  /\brm\b/i, /\brmdir\b/i, /\bmv\b/i, /\bcp\b/i, /\bmkdir\b/i,
  /\btouch\b/i, /\bchmod\b/i, /\bchown\b/i, /\bchgrp\b/i,
  /\bln\b/i, /\btee\b/i, /\btruncate\b/i, /\bdd\b/i, /\bshred\b/i,
  /(^|[^<])>(?!>)/, />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
  /\byarn\s+(add|remove|install|publish)/i,
  /\bpnpm\s+(add|remove|install|publish)/i,
  /\bpip\s+(install|uninstall)/i,
  /\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
  /\bbrew\s+(install|uninstall|upgrade)/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
  /\bsudo\b/i, /\bsu\b/i, /\bkill\b/i, /\bpkill\b/i, /\bkillall\b/i,
  /\breboot\b/i, /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)/i,
  /\bservice\s+\S+\s+(start|stop|restart)/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_PATTERNS = [
  /^\s*cat\b/, /^\s*head\b/, /^\s*tail\b/, /^\s*less\b/, /^\s*more\b/,
  /^\s*grep\b/, /^\s*find\b/, /^\s*ls\b/, /^\s*pwd\b/,
  /^\s*echo\b/, /^\s*printf\b/, /^\s*wc\b/, /^\s*sort\b/, /^\s*uniq\b/,
  /^\s*diff\b/, /^\s*file\b/, /^\s*stat\b/, /^\s*du\b/, /^\s*df\b/,
  /^\s*tree\b/, /^\s*which\b/, /^\s*whereis\b/, /^\s*type\b/,
  /^\s*env\b/, /^\s*printenv\b/, /^\s*uname\b/, /^\s*whoami\b/, /^\s*id\b/,
  /^\s*date\b/, /^\s*cal\b/, /^\s*uptime\b/, /^\s*ps\b/, /^\s*top\b/,
  /^\s*htop\b/, /^\s*free\b/,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
  /^\s*git\s+ls-/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
  /^\s*yarn\s+(list|info|why|audit)/i,
  /^\s*node\s+--version/i, /^\s*python\s+--version/i,
  /^\s*curl\s/i, /^\s*wget\s+-O\s*-/i,
  /^\s*jq\b/, /^\s*sed\s+-n/i, /^\s*awk\b/,
  /^\s*rg\b/, /^\s*fd\b/, /^\s*bat\b/, /^\s*eza\b/,
];

function isSafeCommand(command: string): boolean {
  const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
  const isSafe = SAFE_PATTERNS.some((p) => p.test(command));
  return !isDestructive && isSafe;
}

// ─── Plan 执行：计划提取工具 ──────────────────────────

interface TodoItem {
  step: number;
  text: string;
  completed: boolean;
}

function cleanStepText(text: string): string {
  let cleaned = text
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length > 0) cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (cleaned.length > 50) cleaned = `${cleaned.slice(0, 47)}...`;
  return cleaned;
}

function extractTodoItems(message: string): TodoItem[] {
  const items: TodoItem[] = [];
  // 宽松匹配：Plan: 或 **Plan:** 后面跟换行或空格
  const headerMatch = message.match(/\*{0,2}Plan\*{0,2}\s*[:：]\s*(\n|$)/i);
  if (!headerMatch) return items;
  const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
  // 匹配编号：1. 1) 1、- [ ] 等格式
  const numberedPattern = /^\s*(\d+)[.)、]\s+(?:\[\s*\]\s*)?\*{0,2}([^*\n]+)/gm;
  for (const match of planSection.matchAll(numberedPattern)) {
    const text = match[2].trim().replace(/\*{1,2}$/, "").trim();
    if (text.length > 5 && !text.startsWith("`") && !text.startsWith("/") && !text.startsWith("-")) {
      const cleaned = cleanStepText(text);
      if (cleaned.length > 3) items.push({ step: items.length + 1, text: cleaned, completed: false });
    }
  }
  return items;
}

function extractDoneSteps(message: string): number[] {
  const steps: number[] = [];
  for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
    const step = Number(match[1]);
    if (Number.isFinite(step)) steps.push(step);
  }
  return steps;
}

function markCompletedSteps(text: string, items: TodoItem[]): number {
  const doneSteps = extractDoneSteps(text);
  for (const step of doneSteps) {
    const item = items.find((t) => t.step === step);
    if (item) item.completed = true;
  }
  return doneSteps.length;
}

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
  return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// ─── 主扩展 ───────────────────────────────────────────────

export default function modeSwitcher(pi: ExtensionAPI) {
  let currentMode: ModeName = "allallow";
  let toolsBeforePlan: string[] | undefined;

  // Plan 执行状态
  let planExecuting = false;
  let planTodos: TodoItem[] = [];

  // 写入类工具名称
  const WRITE_TOOLS = new Set(["write", "edit"]);
  const PLAN_DISABLED_TOOLS = new Set(["edit", "write"]);

  // ── 工具函数 ──────────────────────────────────────────

  function updateUI(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    const mode = MODES[currentMode];

    // 状态栏显示
    if (planExecuting && planTodos.length > 0) {
      const completed = planTodos.filter((t) => t.completed).length;
      ctx.ui.setStatus("mode-switcher", `${mode.emoji} ${mode.label} [${completed}/${planTodos.length}]`);
    } else {
      ctx.ui.setStatus("mode-switcher", `${mode.emoji} ${mode.label}`);
    }

    // 编辑器上方 widget
    if (planTodos.length > 0) {
      const lines = planTodos.map((item) => {
        if (item.completed) return `☑ ${item.text}`;
        return `☐ ${item.text}`;
      });
      ctx.ui.setWidget("mode-switcher-widget", lines);
    } else {
      ctx.ui.setWidget(
        "mode-switcher-widget",
        [`${mode.emoji} ${mode.label}: ${mode.description}`],
      );
    }
  }

  function persist(): void {
    pi.appendEntry("mode-switcher-state", {
      mode: currentMode,
      toolsBeforePlan,
      planExecuting,
      planTodos,
    });
  }

  function switchMode(target: ModeName, ctx: ExtensionContext): void {
    if (target === currentMode) return;

    const prev = currentMode;

    // 离开 plan 模式：恢复工具
    if (prev === "plan") {
      if (toolsBeforePlan !== undefined) {
        pi.setActiveTools(toolsBeforePlan);
        toolsBeforePlan = undefined;
      }
    }

    // 进入 plan 模式：禁用写入工具
    if (target === "plan") {
      if (toolsBeforePlan === undefined) {
        toolsBeforePlan = pi.getActiveTools();
      }
      const planTools = [
        ...toolsBeforePlan.filter((t) => !PLAN_DISABLED_TOOLS.has(t)),
        "read", "bash", "grep", "find", "ls",
      ];
      pi.setActiveTools([...new Set(planTools)]);
    }

    currentMode = target;
    // 只有手动切换（非计划执行流程）才清除计划状态
    if (target !== "writeallow" || prev !== "plan") {
      planExecuting = false;
      planTodos = [];
    }
    updateUI(ctx);
    persist();

    const mode = MODES[target];
    ctx.ui.notify(`切换到 ${mode.emoji} ${mode.label}：${mode.description}`, "info");
  }

  function cycleMode(ctx: ExtensionContext): void {
    const idx = MODE_ORDER.indexOf(currentMode);
    const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
    switchMode(next, ctx);
  }

  // ── 注册命令 ──────────────────────────────────────────

  pi.registerCommand("mode", {
    description: `切换工作模式。可选：${MODE_ORDER.join(" / ")}`,
    handler: async (args, ctx) => {
      const arg = args?.trim().toLowerCase();
      if (arg && MODES[arg as ModeName]) {
        switchMode(arg as ModeName, ctx);
      } else if (arg) {
        ctx.ui.notify(`未知模式: ${arg}。可选: ${MODE_ORDER.join(", ")}`, "error");
      } else {
        cycleMode(ctx);
      }
    },
  });

  // 直接切换到各模式的快捷命令
  for (const modeName of MODE_ORDER) {
    const mode = MODES[modeName];
    pi.registerCommand(`mode-${modeName}`, {
      description: `切换到 ${mode.label} 模式：${mode.description}`,
      handler: async (_args, ctx) => switchMode(modeName, ctx),
    });
  }

  // ── 注册快捷键 ────────────────────────────────────────

  // Shift+Tab: 循环切换工作模式
  pi.registerShortcut(Key.shift("tab"), {
    description: "循环切换工作模式",
    handler: async (ctx) => cycleMode(ctx),
  });

  // ── 核心：tool_call 拦截逻辑 ──────────────────────────

  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;

    // ── Auto 模式：全部放行 ──
    if (currentMode === "allallow") return;

    // ── Plan 模式：bash 走白名单 ──
    if (currentMode === "plan") {
      if (toolName === "bash") {
        const cmd = event.input.command as string;
        if (!isSafeCommand(cmd)) {
          return {
            block: true,
            reason: `📋 Plan 模式：命令被阻止。使用 /mode 切换模式。\n命令: ${cmd}`,
          };
        }
      }
      return;
    }

    // ── Auto 模式：bash / edit / write 都需要确认 ──
    if (currentMode === "auto") {
      if (toolName === "bash") {
        const cmd = event.input.command as string;
        if (!ctx.hasUI) {
          return { block: true, reason: `🛡️ Auto 模式：无 UI 环境，命令被阻止: ${cmd}` };
        }
        const choice = await ctx.ui.select(
          `🛡️ Auto 模式 — 允许执行 bash?`,
          ["✅ 允许", "❌ 拒绝", "🔍 查看命令"],
        );
        if (choice === "❌ 拒绝") {
          return { block: true, reason: "用户拒绝执行" };
        }
        if (choice === "🔍 查看命令") {
          await ctx.ui.notify(`命令: ${cmd}`, "info");
          const finalChoice = await ctx.ui.confirm("允许执行？", cmd);
          if (!finalChoice) {
            return { block: true, reason: "用户拒绝执行" };
          }
        }
      }

      if (toolName === "write" || toolName === "edit") {
        const path = event.input.path as string;
        if (!ctx.hasUI) {
          return { block: true, reason: `🛡️ Auto 模式：无 UI 环境，写入被阻止: ${path}` };
        }
        const choice = await ctx.ui.select(
          `🛡️ Auto 模式 — 允许写入文件?`,
          ["✅ 允许", "❌ 拒绝"],
        );
        if (choice !== "✅ 允许") {
          return { block: true, reason: `用户拒绝写入: ${path}` };
        }
      }
      return;
    }

    // ── WriteAllow 模式：edit/write 自动放行，安全 bash 自动放行，危险 bash 需要确认 ──
    if (currentMode === "writeallow") {
      // 写入类工具自动放行
      if (WRITE_TOOLS.has(toolName)) return;

      // bash：安全命令自动放行，危险命令需确认
      if (toolName === "bash") {
        const cmd = event.input.command as string;

        // 安全命令（cat, grep, ls, git status 等）直接放行
        if (isSafeCommand(cmd)) return;

        // 危险命令需要确认
        if (!ctx.hasUI) {
          return { block: true, reason: `✏️ WriteAllow 模式：危险 bash 命令被阻止（无 UI）: ${cmd}` };
        }
        const choice = await ctx.ui.select(
          `✏️ WriteAllow 模式 — 危险命令需确认:`,
          ["✅ 允许", "❌ 拒绝", "🔍 查看命令"],
        );
        if (choice === "❌ 拒绝") {
          return { block: true, reason: "用户拒绝执行" };
        }
        if (choice === "🔍 查看命令") {
          await ctx.ui.notify(`命令: ${cmd}`, "info");
          const ok = await ctx.ui.confirm("允许执行？", cmd);
          if (!ok) {
            return { block: true, reason: "用户拒绝执行" };
          }
        }
      }
      return;
    }
  });

  // ── Plan 模式：注入上下文提示 ────────────────────────

  pi.on("before_agent_start", async () => {
    if (currentMode === "plan") {
      return {
        message: {
          customType: "plan-mode-context",
          content: `[PLAN MODE ACTIVE — READ ONLY]
You are in plan mode. You CANNOT make any changes.

RULES:
- edit and write tools are DISABLED
- bash commands are restricted to READ-ONLY only (cat, grep, ls, git status, etc.)
- You CANNOT use sed, mkdir, touch, mv, cp, rm, npm install, git commit, etc.
- Do NOT try to work around these restrictions

WORKFLOW:
1. Explore codebase as needed (read, grep, ls only)
2. Create a numbered plan under a "Plan:" header
3. Present the plan and ASK the user to approve
4. STOP — do not attempt to execute any step

Plan format:
Plan:
1. First step
2. Second step
...

After presenting the plan, say "请批准这个计划后我开始执行" and WAIT.`,
          display: false,
        },
      };
    }

    if (currentMode === "auto") {
      return {
        message: {
          customType: "auto-mode-context",
          content: `[AUTO MODE ACTIVE]
Every bash command and file write/edit will be confirmed by the user.
Propose changes clearly and ask the user to review before executing.
Be specific about what each command will do.`,
          display: false,
        },
      };
    }

    if (currentMode === "writeallow") {
      // 如果是从 Plan 模式进入的执行模式
      if (planExecuting && planTodos.length > 0) {
        const remaining = planTodos.filter((t) => !t.completed);
        const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
        return {
          message: {
            customType: "plan-execution-context",
            content: `[EXECUTING PLAN - WriteAllow Mode]

Remaining steps:
${todoList}

Execute each step in order. Mark completed steps with [DONE:n].
File writes/edits are auto-approved. Dangerous bash commands require user confirmation.`,
            display: false,
          },
        };
      }

      return {
        message: {
          customType: "writeallow-mode-context",
          content: `[WRITE-ALLOW MODE ACTIVE]
File writes and edits are auto-approved.
Safe bash commands (cat, grep, ls, git status, etc.) are auto-approved.
Dangerous bash commands (rm, mv, npm install, git push, sudo, etc.) require user confirmation.
Be specific about dangerous commands and explain why they are needed before calling them.`,
          display: false,
        },
      };
    }
  });

  // ── 过滤旧模式上下文 ──────────────────────────────────

  pi.on("context", async (event) => {
    return {
      messages: event.messages.filter((m: any) => {
        if (
          m.customType === "plan-mode-context" ||
          m.customType === "auto-mode-context" ||
          m.customType === "writeallow-mode-context" ||
          m.customType === "plan-execution-context" ||
          m.customType === "plan-approval" ||
          m.customType === "plan-approved"
        ) {
          return false;
        }
        return true;
      }),
    };
  });

  // ── Plan 模式：检测计划 → plan.md + 批准流程 ──────

  pi.on("agent_end", async (event, ctx) => {
    if (currentMode !== "plan" || planExecuting || !ctx.hasUI) return;

    const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
    if (!lastAssistant) return;

    const text = getTextContent(lastAssistant);
    const headerMatch = text.match(/\*{0,2}Plan\*{0,2}\s*[:：]/i);
    if (!headerMatch) return;

    // 提取计划步骤
    const extracted = extractTodoItems(text);
    if (extracted.length === 0) return;

    planTodos = extracted;
    updateUI(ctx);
    persist();

    // 写入完整计划到 plan.md
    const planSection = text.slice(text.indexOf(headerMatch[0]));
    try {
      writeFileSync(join(ctx.cwd, "plan.md"), `# Plan\n\n${planSection}\n`, "utf-8");
      ctx.ui.notify("plan.md 已保存", "success");
    } catch {
      ctx.ui.notify("写入 plan.md 失败", "error");
    }

    // 显示批准提示
    const todoListText = planTodos.map((t, i) => `${i + 1}. ☐ ${t.text}`).join("\n");
    pi.sendMessage(
      {
        customType: "plan-approval",
        content: `**📋 计划 (${planTodos.length} 步):**\n\n${todoListText}\n\n---\n✅ 输入 **/approve** 批准并开始执行\n✏️ 回复修改意见来完善计划（plan.md 同步更新）`,
        display: true,
      },
      { deliverAs: "followUp" },
    );
  });

  // ── /approve 命令：批准计划并开始执行 ───────────────

  pi.registerCommand("approve", {
    description: "批准当前计划并切换到 WriteAllow 模式执行",
    handler: async (_args, ctx) => {
      if (planExecuting) {
        ctx.ui.notify("计划已在执行中", "info");
        return;
      }

      // 尝试从聊天记录恢复计划
      if (planTodos.length === 0) {
        const entries = ctx.sessionManager.getEntries();
        const lastAssistant = [...entries].reverse().find(
          (e: any) => e.type === "message" && "message" in e && isAssistantMessage(e.message as AgentMessage),
        ) as any;
        if (lastAssistant) {
          const extracted = extractTodoItems(getTextContent(lastAssistant.message as AssistantMessage));
          if (extracted.length > 0) {
            planTodos = extracted;
            updateUI(ctx);
            persist();
          }
        }
      }

      if (planTodos.length === 0) {
        ctx.ui.notify("没有待执行的计划。请先在 Plan 模式下创建计划。", "warning");
        return;
      }

      const confirmed = await ctx.ui.confirm(
        "切换到 WriteAllow 模式？",
        `将执行 ${planTodos.length} 个步骤的计划。\n\nWriteAllow 模式：写入自动放行，危险 bash 需确认。`,
      );

      if (!confirmed) {
        ctx.ui.notify("已取消，继续完善计划", "info");
        return;
      }

      planExecuting = true;
      switchMode("writeallow", ctx);
      updateUI(ctx);
      persist();

      const firstTodo = planTodos[0];
      const remainingList = planTodos.map((t) => `${t.step}. ${t.text}`).join("\n");
      pi.sendMessage(
        {
          customType: "plan-execute-cmd",
          content: `执行以下计划：\n\n${remainingList}\n\n从第 1 步开始：${firstTodo.text}\n完成后使用 [DONE:n] 标记。`,
          display: true,
        },
        { triggerTurn: true, deliverAs: "followUp" },
      );
    },
  });

  // ── 用户说"执行"时自动弹确认 ─────────────────────

  pi.on("input", async (event, ctx) => {
    const text = event.text.trim().toLowerCase();
    const keywords = ["执行", "批准", "approve", "go ahead", "yes", "ok", "好的", "开始", "accept", "执行计划"];

    if (
      currentMode === "plan" &&
      !planExecuting &&
      planTodos.length > 0 &&
      keywords.some((kw) => text === kw || text.startsWith(kw))
    ) {
      const confirmed = await ctx.ui.confirm(
        "切换到 WriteAllow 模式？",
        `将执行 ${planTodos.length} 个步骤的计划。\n\nWriteAllow 模式：写入自动放行，危险 bash 需确认。`,
      );

      if (!confirmed) {
        ctx.ui.notify("已取消，继续完善计划", "info");
        return { action: "handled" };
      }

      planExecuting = true;
      switchMode("writeallow", ctx);
      updateUI(ctx);
      persist();

      const firstTodo = planTodos[0];
      const remainingList = planTodos.map((t) => `${t.step}. ${t.text}`).join("\n");

      // 先切模式，再以消息触发执行
      pi.sendMessage(
        {
          customType: "plan-execute-cmd",
          content: `执行以下计划：\n\n${remainingList}\n\n从第 1 步开始：${firstTodo.text}\n完成后使用 [DONE:n] 标记。`,
          display: true,
        },
        { triggerTurn: true, deliverAs: "followUp" },
      );

      return { action: "handled" };
    }
  });

  // ── Plan 执行：追踪 [DONE:n] 进度 ────────────────────

  pi.on("turn_end", async (event, ctx) => {
    if (!planExecuting || planTodos.length === 0) return;
    if (!isAssistantMessage(event.message)) return;

    const text = getTextContent(event.message);
    if (markCompletedSteps(text, planTodos) > 0) {
      updateUI(ctx);
      persist();

      // 同步更新 plan.md
      try {
        const planMd = `# Plan\n\n${planTodos.map((t, i) => `${i + 1}. [${t.completed ? "x" : " "}] ${t.text}`).join("\n")}\n\n---\n*Generated by pi Plan Mode*\n`;
        writeFileSync(join(ctx.cwd, "plan.md"), planMd, "utf-8");
      } catch { /* ignore */ }
    }
  });

  // ── Plan 执行完成检测 ────────────────────────────────

  pi.on("agent_end", async (event, ctx) => {
    if (!planExecuting || planTodos.length === 0) return;

    if (planTodos.every((t) => t.completed)) {
      const completedList = planTodos.map((t) => `~~${t.text}~~`).join("\n");
      pi.sendMessage(
        { customType: "plan-complete", content: `**✅ 计划完成！**\n\n${completedList}`, display: true },
        { triggerTurn: false },
      );
      planExecuting = false;
      planTodos = [];
      updateUI(ctx);
      persist();
    }
  });

  // ── 会话恢复 ──────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const savedState = entries
      .filter((e: any) => e.type === "custom" && e.customType === "mode-switcher-state")
      .pop() as { data?: { mode?: ModeName; toolsBeforePlan?: string[] } } | undefined;

    if (savedState?.data?.mode && MODES[savedState.data.mode]) {
      currentMode = savedState.data.mode;
      toolsBeforePlan = savedState.data.toolsBeforePlan;
      planExecuting = savedState.data.planExecuting ?? false;
      planTodos = savedState.data.planTodos ?? [];

      if (currentMode === "plan") {
        if (toolsBeforePlan !== undefined) {
          const planTools = [
            ...toolsBeforePlan.filter((t) => !PLAN_DISABLED_TOOLS.has(t)),
            "read", "bash", "grep", "find", "ls",
          ];
          pi.setActiveTools([...new Set(planTools)]);
        }
        // 恢复执行进度
        if (planExecuting) {
          const msgs = entries
            .filter((e: any) => e.type === "message" && "message" in e && isAssistantMessage(e.message as AgentMessage))
            .map((e: any) => getTextContent(e.message as AssistantMessage));
          markCompletedSteps(msgs.join("\n"), planTodos);
        }
      }
    }

    updateUI(ctx);

    // 折叠 thinking 时显示 Ctrl+E 提示
    ctx.ui.setHiddenThinkingLabel("Thinking... Ctrl+E to expand");
  });
}
