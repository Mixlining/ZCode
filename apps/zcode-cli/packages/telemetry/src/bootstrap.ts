import type {
  AgentTelemetryRuntimeOwner,
  AgentExecutionTelemetryPort,
  ModelApiRuntimeSurface,
  ModelExecutionTelemetryPort,
  TelemetryResourceContext,
} from "@zcode/contracts/telemetry";
import type { ModelStatusSink } from "@zcode/contracts/model";
import { NoopAgentExecutionTelemetry } from "./agent-trace-runtime.js";

type EnvRecord = Record<string, string | undefined>;

const noopExecution = new NoopAgentExecutionTelemetry();

export interface CreateModelTelemetryOptions {
  owner?: AgentTelemetryRuntimeOwner;
  sessionId?: string;
}

export interface ModelTelemetryBootstrap {
  agentExecution: AgentExecutionTelemetryPort;
  enabled: boolean;
  modelExecution: ModelExecutionTelemetryPort;
  statusSink?: ModelStatusSink;
  shutdown(): Promise<void>;
}

export function createModelTelemetry(
  options: CreateModelTelemetryOptions = {},
): ModelTelemetryBootstrap {
  // 显式注入的 Owner 优先：调用方仍然可以借用进程级实现；
  // 2026-11 之后本包不再自行创建 OTel Owner，默认路径固定为 no-op。
  const owner = options.owner;
  if (!owner) {
    return {
      agentExecution: noopExecution,
      enabled: false,
      modelExecution: noopExecution,
      async shutdown() {},
    };
  }
  return {
    agentExecution: owner.agentExecution,
    enabled: owner.enabled,
    modelExecution: owner.modelExecution,
    statusSink: owner.statusSink,
    async shutdown() {
      if (options.sessionId) owner.abandonSession(options.sessionId);
      // Session 只借用进程 Owner。关闭 Session 可以 flush，但不能关闭 Provider、Exporter、
      // Context Manager 或其他 Session 仍在使用的队列。
      await owner.flush({ timeoutMs: 1_500 });
    },
  };
}

export interface PrepareModelTelemetryOptions {
  buildCommitId?: string;
  cliVersion?: string;
  onWarning?: (message: string, context: Record<string, unknown>) => void;
  productVersion?: string;
  runtimeDistribution?: TelemetryResourceContext["runtimeDistribution"];
  runtimeSurface?: ModelApiRuntimeSurface;
}

/**
 * 2026-11 OTel 移除：不再解析 OTLP endpoint/header，不生成或读写 device MID 状态文件，
 * 不动态加载 OTel SDK。保留函数签名供 CLI 启动边界继续调用，直接返回原 env。
 */
export async function prepareModelTelemetryEnv(
  env: EnvRecord,
  _options: PrepareModelTelemetryOptions = {},
): Promise<EnvRecord> {
  return env;
}

export async function shutdownPreparedModelTelemetry(): Promise<void> {
  // no-op：没有进程 Owner、队列或 Exporter 需要关闭。
}
