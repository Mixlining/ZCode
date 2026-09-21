import type { EnvRecord } from "./model-execution.js";
import { normalizeModelSessionIdForAttribution, type ModelStatusContext } from "./runner-status.js";

const REDACTED_METADATA_USER_ID = "[REDACTED]";

function createAnthropicRequestMetadataUserId(input: {
  sessionId?: ModelStatusContext["sessionId"];
}): string {
  return JSON.stringify({
    // device_id 已按配置移除：模型请求不再携带设备标识（原值来自 ensureCliDeviceMid）。
    account_uuid: "",
    session_id: normalizeModelSessionIdForAttribution(input.sessionId) ?? "",
  });
}

export async function resolveAnthropicRequestMetadataUserId(input: {
  env: EnvRecord;
  providerKind: string | undefined;
  sessionId?: ModelStatusContext["sessionId"];
}): Promise<string | undefined> {
  if (input.providerKind !== "anthropic") {
    return undefined;
  }

  // 不再读取本地 deviceMid：身份文件仍由 device 模块维护，但不再进入模型请求。
  return createAnthropicRequestMetadataUserId({ sessionId: input.sessionId });
}

export function redactAnthropicRequestMetadata(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      const redacted = redactAnthropicRequestMetadata(parsed);
      return redacted === parsed ? value : JSON.stringify(redacted);
    } catch {
      return value;
    }
  }
  if (!isRecord(value)) {
    return value;
  }

  let result = value;
  const wireMetadata = isRecord(value.metadata) ? value.metadata : undefined;
  if (wireMetadata && wireMetadata.user_id !== undefined) {
    result = {
      ...result,
      metadata: {
        ...wireMetadata,
        user_id: REDACTED_METADATA_USER_ID,
      },
    };
  }

  const providerOptions = isRecord(value.providerOptions) ? value.providerOptions : undefined;
  const anthropicOptions = isRecord(providerOptions?.anthropic)
    ? providerOptions.anthropic
    : undefined;
  const providerMetadata = isRecord(anthropicOptions?.metadata)
    ? anthropicOptions.metadata
    : undefined;
  if (providerOptions && anthropicOptions && providerMetadata?.userId !== undefined) {
    result = {
      ...result,
      providerOptions: {
        ...providerOptions,
        anthropic: {
          ...anthropicOptions,
          metadata: {
            ...providerMetadata,
            userId: REDACTED_METADATA_USER_ID,
          },
        },
      },
    };
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
