/**
 * Status Bar Extension
 *
 * 在底部状态栏显示：
 * - 当前工作文件夹
 * - 所用模型
 * - 上下文余量 (已用/总量)
 * - 思考强度
 * - 本次对话耗费
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			// 模型切换时刷新
			pi.on("model_select", () => tui.requestRender());

			// 思考强度变化时刷新
			pi.on("thinking_level_select", () => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},

				render(width: number): string[] {
					// ── 1. 当前工作文件夹（绝对路径）──
					const folder = ctx.cwd;

					// ── 2. 模型 ──
					const modelId = ctx.model?.id ?? "no-model";

					// ── 3. 思考强度 ──
					const level = pi.getThinkingLevel();
					const levelLabels: Record<string, string> = {
						off: "off",
						minimal: "min",
						low: "low",
						medium: "med",
						high: "high",
						xhigh: "xhigh",
						max: "max",
					};
					const levelLabel = levelLabels[level] ?? level;

					// ── 4. 上下文余量 ──
					let tokensUsed = 0;
					let contextWindow = ctx.model?.contextWindow ?? 0;
					const usage = ctx.getContextUsage();
					if (usage) {
						tokensUsed = usage.tokens;
					}
					const remaining = contextWindow > 0 ? contextWindow - tokensUsed : 0;

					const fmt = (n: number) => {
						if (n < 1000) return `${n}`;
						if (n < 1000000) return `${(n / 1000).toFixed(1)}k`;
						return `${(n / 1000000).toFixed(1)}m`;
					};
					const ctxStr =
						contextWindow > 0
							? `${fmt(tokensUsed)}/${fmt(contextWindow)}`
							: fmt(tokensUsed);

					// ── 5. 对话耗费（按模型对应的人民币定价重新计算）──
					// 不用 m.usage.cost.total（那是旧的美元定价算的），
					// 直接从 token 数按官网定价重算
					const MODEL_PRICES: Record<string, { input: number; cache: number; output: number }> = {
						"deepseek-v4-flash":  { input: 1,    cache: 0.02,  output: 2 },
						"deepseek-v4-pro":    { input: 3,    cache: 0.025, output: 6 },
					};
					const prices = MODEL_PRICES[modelId] ?? MODEL_PRICES["deepseek-v4-flash"]!;
					let totalInput = 0, totalCache = 0, totalOutput = 0;
					for (const e of ctx.sessionManager.getBranch()) {
						if (e.type === "message" && e.message.role === "assistant") {
							const m = e.message as AssistantMessage;
							totalInput   += m.usage.input;
							totalCache   += m.usage.cacheRead;
							totalOutput  += m.usage.output;
						}
					}
					const cost = (totalInput * prices.input + totalCache * prices.cache + totalOutput * prices.output) / 1_000_000;
					const costStr = cost >= 0.01
						? `¥${cost.toFixed(2)}`
						: `¥${cost.toFixed(4)}`;

					// ── 拼装 ──
					const sep = theme.fg("muted", " │ ");
					const leftParts = [
						theme.fg("accent", folder),
					];
					const rightParts = [
						theme.fg("text", modelId),
						theme.fg("dim", levelLabel),
						ctxStr,
						theme.fg("warning", costStr),
					];

					// 如果上下文余量 < 10%，用 warning 色
					let ctxColor: (s: string) => string;
					if (contextWindow > 0 && remaining < contextWindow * 0.1) {
						ctxColor = (s: string) => theme.fg("error", s);
					} else if (contextWindow > 0 && remaining < contextWindow * 0.25) {
						ctxColor = (s: string) => theme.fg("warning", s);
					} else {
						ctxColor = (s: string) => theme.fg("dim", s);
					}
					// 替换 rightParts 中的 ctxStr 为带颜色的版本
					rightParts[2] = ctxColor(ctxStr);

					const left = leftParts.join(sep);
					const right = rightParts.join(sep);

					const padLen = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
					const pad = " ".repeat(padLen);

					return [truncateToWidth(left + pad + right, width)];
				},
			};
		});
	});
}
