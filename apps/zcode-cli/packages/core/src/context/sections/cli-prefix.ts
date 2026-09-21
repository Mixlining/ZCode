// ============================================================
// CLI Prefix Section Builder
// ============================================================

import type { ContextSection } from "../types.js";
import { estimateTokens } from "../utils.js";

/**
 * 主 Agent 与全部子代理共用的第一段 system（子代理见 subagent/context-builder.ts 的
 * buildCliPrefixSection()），因此身份措辞只在这里改一次。子代理角色 prompt 里的自称
 * （Explore / general-purpose）保持各自原文，不随本行变动。
 */
const CLI_PREFIX_PROMPT = "You are a helpful software engineer assistant named ZCode";

export function buildCliPrefixSection(): ContextSection {
  const content = CLI_PREFIX_PROMPT;

  return {
    name: "CLI Prefix",
    source: "cli_prefix",
    injectionTarget: "system",
    cacheHint: "stable",
    chars: content.length,
    tokens: estimateTokens(content),
    content,
    preview: content.slice(0, 100),
  };
}
