// ============================================================
// Identity Section Builder
// ============================================================

import type { ContextSection } from "../types.js";
import type { OutputStylePromptConfig } from "../types.js";
import { estimateTokens } from "../utils.js";

// 此处原有「授权安全测试 / 拒绝破坏性技术」的安全 IMPORTANT 段，由主 Agent 身份段与工作流
// 子代理身份段（sections/workflow-actor.ts）逐字共用。按配置决定整体移除：两处都不再注入，
// 也不再提供 buildSecurityNotice 导出。安全边界若需恢复，应作为独立 section 重新引入并让它
// 自带所有者，而不是在多个身份段里各自复制同一段文本。

/**
 * `# Harness` 块：稳定运行时约束，不属于 output style 可替换的 coding instructions，
 * 也是工作流子代理身份（sections/workflow-actor.ts）逐字复用的那一段。
 */
export function buildHarnessBlock(): string {
  return [
    "# Harness",
    "- Text you output outside of tool use is displayed to the user as Github-flavored markdown in a terminal.",
    "- Tools run behind a user-selected permission mode; a denied call means the user declined it \u2014 adjust, don't retry verbatim.",
    "- The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results. Hooks may intercept tool calls; treat hook output as user feedback.",
    "- Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls can run in parallel in one response.",
    "- Reference code as `file_path:line_number` \u2014 it's clickable.",
  ].join("\n");
}

function buildIdentityPrompt(outputStyle?: OutputStylePromptConfig): string {
  const intro = outputStyle
    ? "You respond to the user according to the active Output Style below while using ZCode's tools and instructions."
    : "You are a helpful software engineer assistant that helps users with software engineering tasks.";

  const identityLines = ["", intro].join("\n");

  return [identityLines, "", buildHarnessBlock()].join("\n");
}

export function buildIdentitySection(outputStyle?: OutputStylePromptConfig): ContextSection {
  const content = buildIdentityPrompt(outputStyle);

  return {
    name: "Agent Identity",
    source: "identity",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}
