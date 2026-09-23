/* eslint-disable max-lines -- 轨迹读取的尾部过滤、delta 链式展开、窗口选择与字节预算四段严格顺序耦合（展开依赖上一条完整上下文，窗口又必须在映射前确定），拆到多个文件会把同一读取契约摊开并放大链式语义漂移风险。 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { utf8JsonByteLength } from "@zcode/shared/zcode-protocol-v4";
import type {
  ZCodeModelTrajectory,
  ZCodeModelTrajectoryCallSource,
  ZCodeModelTrajectoryContentPart,
  ZCodeModelTrajectoryMessage,
  ZCodeModelTrajectoryRecord,
  ZCodeModelTrajectoryUsage,
} from "#src/session/zcodeTaskService.js";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import {
  readTrajectoryFileTail,
  resolveModelIODirs,
  sanitizeSessionSegment,
} from "#src/zcode-agent/modelTrajectoryFileTail.js";
import type { TrajectoryFileTail } from "#src/zcode-agent/modelTrajectoryFileTail.js";

// model-io 默认最多返回的调用条数（保留最近 N 条），避免长 session 把 UI 压垮。
const DEFAULT_TRAJECTORY_LIMIT = 200;
// 轨迹结果的序列化字节上限。条数上限不封顶字节：单条记录携带完整上下文，长 session 下
// 200 条窗口仍会产出数百 MB 的 RPC 载荷，极端时 JSON.stringify 直接抛 RangeError。
// 因此条数与字节两个上限取小。取值与 PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes 对齐：
// 开启完整保留时单条上下文就是数 MB，本机实测「32 MiB 尾部」的常规结果为 4–12 条、
// 6.8–8.0 MiB，预算低于此会让用户直接少看到调用记录，而 16 MiB 仍足以消除上述失控载荷。
const MODEL_TRAJECTORY_MAX_RESULT_BYTES = 16 * 1024 * 1024;
const SESSION_TITLE_PROMPT_PREFIX = "Generate a concise title for this coding session.";
const logger = createServiceLogger("model-trajectory");

/**
 * 解析 ~/.zcode/cli/{debug,rollout} 下的 model-io JSONL，按 sessionId 还原某个 task 的模型调用轨迹。
 *
 * 设计说明：
 * - model-io 由 adapters/model/runner-debug.ts 落盘；一个 session 一个
 *   `model-io-<sanitizedSessionId>.jsonl`。
 * - ZCode Agent 把 taskId 当作 sessionId（见 zcodeTaskServiceAdapter），所以这里只读取
 *   该 session 的单文件，并按 `record.sessionId === taskId` 精确匹配。
 */
export async function readModelTrajectory(
  taskId: string,
  limit = DEFAULT_TRAJECTORY_LIMIT,
): Promise<ZCodeModelTrajectory> {
  const safeLimit =
    Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : DEFAULT_TRAJECTORY_LIMIT;
  const sanitized = sanitizeSessionSegment(taskId);
  const dirs = resolveModelIODirs();
  const sourceFiles: string[] = [];
  const rawRecords: Record<string, unknown>[] = [];
  let inputTruncated = false;

  for (const dir of dirs) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      // 目录不存在（没跑过对应模式）或不可读，跳过。
      continue;
    }

    const fileName = `model-io-${sanitized || "no-session"}.jsonl`;
    const candidates = names.includes(fileName) ? [fileName] : [];

    for (const name of candidates) {
      const filePath = join(dir, name);
      let tail: TrajectoryFileTail;
      const startedAt = Date.now();
      try {
        // 同步读取并 split 整个 model-io 会阻塞 Host 事件循环，并在大文件上制造多份字符串峰值。
        // 从尾部异步读取固定上限；若从行中间开始，则由 readTrajectoryFileTail 丢弃不完整残行。
        tail = await readTrajectoryFileTail(filePath);
        logger.debug(
          undefined,
          `read taskId=${taskId} bytes=${tail.bytesRead} truncated=${tail.truncated} durationMs=${Date.now() - startedAt}`,
        );
      } catch (error) {
        logger.debug(undefined, `read failed taskId=${taskId} file=${filePath}`, error);
        continue;
      }
      inputTruncated ||= tail.truncated;

      let matchedInFile = false;
      for (const line of tail.text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (parsed.type !== "model_io" || parsed.sessionId !== taskId) {
          continue;
        }
        rawRecords.push(parsed);
        matchedInFile = true;
      }

      if (matchedInFile) {
        sourceFiles.push(filePath);
      }
    }
  }

  // 按开始时间排序；同毫秒/缺失时间时按 requestId 兜底，保证顺序稳定。
  rawRecords.sort((left, right) => {
    const startDiff = toTime(asString(left.startedAt)) - toTime(asString(right.startedAt));
    if (startDiff !== 0) {
      return startDiff;
    }
    return (asString(left.requestId) ?? "").localeCompare(asString(right.requestId) ?? "");
  });

  // 字节预算的窗口预判。展开后的上下文是各条记录自己消息切片的拼接，所以「累计切片字节」
  // 是每条记录上下文的近似规模；用窗口内最小的那个乘以窗口长度就是真实序列化大小的下界。
  // 先按下界定窗口，再逐条映射，可避免默认配置下「映射上千条 delta 只为丢弃」白占数秒 Host
  // 时间；下界只会让窗口偏大，不会漏掉本可展示的记录，最终大小仍由下方逐条实测收口。
  const estimatedContextBytes: number[] = [];
  let cumulativeContextBytes = 0;
  for (const record of rawRecords) {
    const request = asObject(record.request);
    const deltaBytes = utf8JsonByteLength(request?.messages ?? null);
    // delta 是增量；full/tail 是自包含基线，与 expandMessageCollection 的重置语义保持一致。
    cumulativeContextBytes =
      asString(request?.messagesKind) === "delta"
        ? cumulativeContextBytes + deltaBytes
        : deltaBytes;
    estimatedContextBytes.push(cumulativeContextBytes);
  }

  let startIndex = Math.max(0, rawRecords.length - safeLimit);
  let smallestContextBytes = Number.POSITIVE_INFINITY;
  for (let index = rawRecords.length - 1; index >= startIndex; index -= 1) {
    smallestContextBytes = Math.min(smallestContextBytes, estimatedContextBytes[index] ?? 0);
    if ((rawRecords.length - index) * smallestContextBytes > MODEL_TRAJECTORY_MAX_RESULT_BYTES) {
      startIndex = index + 1;
      break;
    }
  }

  const windowSize = rawRecords.length - startIndex;
  const mapped: ZCodeModelTrajectoryRecord[] = [];
  let previousExpanded: Record<string, unknown> | undefined;
  let retainedBytes = 0;

  for (const [index, record] of rawRecords.entries()) {
    // 窗口外的记录仍要参与展开以推进 delta 链，但不映射：这正是「先定窗口再物化」。
    previousExpanded = expandModelIORecord(record, previousExpanded);
    if (index < startIndex) continue;
    // 预判用的是下界，这里按实际序列化字节复核，超预算就从头部出队（保留最近调用）；
    // 至少留一条，让超过预算的单条上下文完整返回，不截断首条上下文。
    const mappedRecord = mapRecord(previousExpanded);
    retainedBytes += utf8JsonByteLength(mappedRecord);
    mapped.push(mappedRecord);
    while (mapped.length > 1 && retainedBytes > MODEL_TRAJECTORY_MAX_RESULT_BYTES) {
      retainedBytes -= utf8JsonByteLength(mapped.shift()!);
    }
  }

  const truncated = inputTruncated || rawRecords.length > safeLimit || mapped.length < windowSize;

  return {
    taskId,
    available: true,
    records: mapped,
    sourceFiles,
    truncated,
  };
}

function toTime(value?: string): number {
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function mapRecord(record: Record<string, unknown>): ZCodeModelTrajectoryRecord {
  const request = asObject(record.request);
  const response = asObject(record.response);
  const model = asObject(record.model);
  const error = asObject(record.error);
  const querySource = asString(record.querySource) ?? inferQuerySourceFromRequest(request);
  const modelRole = asString(model?.role);

  const mapped: ZCodeModelTrajectoryRecord = {
    requestId: asString(record.requestId) ?? "",
    attempt: asNumber(record.attempt) ?? 1,
    startedAt: asString(record.startedAt) ?? "",
    completedAt: asString(record.completedAt),
    durationMs: asNumber(record.durationMs),
    turnId: asString(record.turnId),
    traceId: asString(record.traceId),
    callSource: classifyCallSource(querySource, modelRole),
    model: {
      modelId: asString(model?.modelId),
      providerId: asString(model?.providerId),
      role: modelRole,
      source: asString(model?.source),
    },
    request: {
      messages: mapMessages(request?.messages),
      toolNames: asStringArray(request?.toolNames),
    },
  };

  if (response) {
    const responseToolCalls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
    mapped.response = {
      finishReason: asString(response.finishReason),
      text: asString(response.text),
      reasoningText: asString(response.reasoningText),
      toolCalls: responseToolCalls.map((toolCall) => mapResponseToolCall(toolCall)),
      usage: mapUsage(response.usage),
      responseId: asString(response.responseId),
      modelId: asString(response.modelId),
    };
  }

  if (error && (asString(error.message) || asString(error.name))) {
    mapped.error = {
      name: asString(error.name) ?? "Error",
      message: asString(error.message) ?? "",
      stack: asString(error.stack),
    };
  }

  return mapped;
}

function inferQuerySourceFromRequest(
  request: Record<string, unknown> | undefined,
): string | undefined {
  const messages = request?.messages;
  if (!Array.isArray(messages)) {
    return undefined;
  }
  const first = asObject(messages[0]);
  if (first?.role !== "system") {
    return undefined;
  }
  const content = asString(first.content);
  return content?.startsWith(SESSION_TITLE_PROMPT_PREFIX) ? "session_title" : undefined;
}

function classifyCallSource(
  querySource: string | undefined,
  modelRole: string | undefined,
): ZCodeModelTrajectoryCallSource {
  if (querySource === "main_turn") {
    return { kind: "main", querySource };
  }
  if (querySource === "subagent") {
    return { kind: "subagent", querySource };
  }
  if (querySource === "compact" || modelRole === "compact") {
    return { kind: "compact", querySource };
  }
  if (querySource) {
    return { kind: "sidecar", querySource };
  }
  if (modelRole === "subagent") {
    return { kind: "subagent" };
  }
  return { kind: "main" };
}

function expandModelIORecord(
  record: Record<string, unknown>,
  previousRecord?: Record<string, unknown>,
): Record<string, unknown> {
  const request = asObject(record.request);
  if (!request) {
    return record;
  }

  return {
    ...record,
    request: expandModelIORequest(request, asObject(previousRecord?.request)),
  };
}

function expandModelIORequest(
  request: Record<string, unknown>,
  previousRequest?: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...request };
  expandMessageCollection(next, previousRequest, {
    collectionKey: "messages",
    kindKey: "messagesKind",
    offsetKey: "messageOffset",
  });
  expandMessageCollection(next, previousRequest, {
    collectionKey: "sdkMessages",
    kindKey: "sdkMessagesKind",
    offsetKey: "sdkMessageOffset",
  });

  const body = asObject(next.body);
  if (body) {
    const nextBody = { ...body };
    expandMessageCollection(
      nextBody,
      asObject(previousRequest?.body),
      {
        collectionKey: "messages",
        kindKey: "bodyMessagesKind",
        offsetKey: "bodyMessageOffset",
      },
      next,
    );
    next.body = nextBody;
  }

  return next;
}

function expandMessageCollection(
  target: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
  keys: {
    collectionKey: string;
    kindKey: string;
    offsetKey: string;
  },
  metadataSource: Record<string, unknown> = target,
): void {
  if (metadataSource[keys.kindKey] === "tail") {
    // model-io 文件超限或进程内缓存丢失后会写最近窗口 baseline。
    // tail 是新的展开起点，不能继续拼接更早历史，否则又会把已裁剪的巨大上下文带回 UI 读取链路。
    return;
  }
  if (metadataSource[keys.kindKey] !== "delta") {
    return;
  }
  const deltaMessages = target[keys.collectionKey];
  const previousMessages = previous?.[keys.collectionKey];
  const offset = asNonNegativeInteger(metadataSource[keys.offsetKey]);
  if (!Array.isArray(deltaMessages) || !Array.isArray(previousMessages) || offset === undefined) {
    return;
  }
  // 新 model-io 为了避免同一 session 内完整上下文梯度重复，只保存 delta；服务层读出时还原给 UI。
  target[keys.collectionKey] = [...previousMessages.slice(0, offset), ...deltaMessages];
}

function mapMessages(value: unknown): ZCodeModelTrajectoryMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const message = asObject(entry) ?? {};
    const role = asString(message.role) ?? "unknown";
    return {
      role,
      parts: mapContent(message.content, role, {
        toolCallId:
          asString(message.toolCallId) ??
          asString(message.tool_call_id) ??
          asString(message.tool_use_id),
        toolName: asString(message.toolName) ?? asString(message.name),
        isError: message.isError === true || message.is_error === true,
      }),
    };
  });
}

function mapContent(
  content: unknown,
  role?: string,
  messageTool?: { toolCallId?: string; toolName?: string; isError?: boolean },
): ZCodeModelTrajectoryContentPart[] {
  if (typeof content === "string") {
    if (content.length === 0) return [];
    // tool 角色的字符串内容即工具输出，单独标记为 tool-result 便于 UI 区分。
    if (role === "tool") {
      // 实际 model-io 把关联字段放在消息顶层，而 content 只保存字符串结果；
      // 丢掉顶层字段会让 UI 无法把 TOOL 返回关联到对应 tool call。
      return [
        {
          kind: "tool-result",
          toolCallId: messageTool?.toolCallId,
          toolName: messageTool?.toolName,
          // 标准化 model-io 会把 error-text 展平为 content + isError；这里必须还原类型，
          // 否则 UI 只能看到错误字符串，无法显示错误状态。
          output: tryParseJson(content, messageTool?.isError),
        },
      ];
    }
    return [{ kind: "text", text: content }];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.map((rawPart) => mapPart(rawPart, role === "tool" ? messageTool : undefined));
}

function mapPart(
  rawPart: unknown,
  messageTool?: { toolCallId?: string; toolName?: string; isError?: boolean },
): ZCodeModelTrajectoryContentPart {
  const part = asObject(rawPart);
  if (!part) {
    return { kind: "unknown", raw: rawPart };
  }

  switch (part.type) {
    case "text":
      return { kind: "text", text: asString(part.text) ?? "" };
    case "reasoning":
      return { kind: "reasoning", text: asString(part.text) ?? "" };
    case "tool-call":
      return {
        kind: "tool-call",
        toolCallId: asString(part.toolCallId),
        toolName: asString(part.toolName) ?? "tool",
        input: part.input ?? part.args,
      };
    case "tool-result":
      return {
        kind: "tool-result",
        toolCallId: asString(part.toolCallId) ?? messageTool?.toolCallId,
        toolName: asString(part.toolName) ?? messageTool?.toolName,
        output: part.output ?? part.result,
      };
    case "image":
    case "file":
      return { kind: "image", mediaType: asString(part.mediaType) };
    default:
      return { kind: "unknown", raw: rawPart };
  }
}

function mapResponseToolCall(rawToolCall: unknown): ZCodeModelTrajectoryContentPart {
  const toolCall = asObject(rawToolCall);
  if (!toolCall) {
    return { kind: "unknown", raw: rawToolCall };
  }
  return {
    kind: "tool-call",
    // 归一化后的 response.toolCalls 形如 {id, name, input}。
    toolCallId: asString(toolCall.id) ?? asString(toolCall.toolCallId),
    toolName: asString(toolCall.name) ?? asString(toolCall.toolName) ?? "tool",
    input: toolCall.input ?? toolCall.args,
  };
}

function mapUsage(value: unknown): ZCodeModelTrajectoryUsage | undefined {
  const usage = asObject(value);
  if (!usage) {
    return undefined;
  }
  return {
    inputTokens: asNumber(usage.inputTokens),
    outputTokens: asNumber(usage.outputTokens),
    totalTokens: asNumber(usage.totalTokens),
    cacheReadTokens: asNumber(usage.cacheReadTokens),
    reasoningTokens: asNumber(usage.reasoningTokens),
  };
}

function tryParseJson(value: string, isError = false): unknown {
  if (isError) return { type: "error-text", value };
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
