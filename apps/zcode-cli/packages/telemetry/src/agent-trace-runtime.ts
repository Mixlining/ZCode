import type {
  AgentExecutionTelemetryPort,
  AgentStepSpanWriter,
  AgentTelemetryCausation,
  AgentTelemetryScope,
  AgentTurnSpanWriter,
  CommandExecutionSpanWriter,
  ContextCompactionSpanWriter,
  DetachedOperationSpanWriter,
  ModelAttemptSpanWriter,
  ModelCallSpanWriter,
  ModelExecutionTelemetryPort,
  ToolExecutionSpanWriter,
} from "@zcode/contracts/telemetry";

/**
 * 2026-11 OTel 移除（spec/dependency-upgrade-2026-11.md）：
 * 保留 `NoopAgentExecutionTelemetry` 作为 CLI 的默认 Telemetry Port 实现；
 * 这里不再创建 Span、Queue、Timer 或任何 OTel SDK 对象。
 *
 * 用类而不是对象字面量实现 Writer：Contracts 的 dist 声明可能滞后于源码
 * （既存 `ModelRequestObservation` 漂移），类的多余方法在两者下都合法。
 */
class NoopScope implements AgentTelemetryScope {
  captureCausation(): AgentTelemetryCausation | undefined {
    return undefined;
  }

  run<T>(execute: () => T): T {
    return execute();
  }
}

class NoopCommandWriter extends NoopScope implements CommandExecutionSpanWriter {
  finishBackgrounded() {}
  finishCancelled() {}
  finishCompleted() {}
  finishFailed() {}
  markFirstOutput() {}
  markTerminationRequested() {}
  setExitCode() {}
  setOutputBytes() {}
  setSignal() {}
  setTimedOut() {}
}

const noopCommandWriter = new NoopCommandWriter();

class NoopToolWriter extends NoopScope implements ToolExecutionSpanWriter {
  finishCancelled() {}
  finishCompleted() {}
  finishDenied() {}
  finishFailed() {}
  markPermissionRequested() {}
  setOutputBytes() {}
  setOutputTruncated() {}
  setPermissionDecision() {}
  startCommand(): CommandExecutionSpanWriter {
    return noopCommandWriter;
  }
}

class NoopStepWriter extends NoopScope implements AgentStepSpanWriter {
  finishCancelled() {}
  finishCompleted() {}
  finishDiscarded() {}
  finishFailed() {}
}

class NoopTurnWriter extends NoopScope implements AgentTurnSpanWriter {
  finishCancelled() {}
  finishCompleted() {}
  finishFailed() {}
}

class NoopCompactionWriter extends NoopScope implements ContextCompactionSpanWriter {
  finishCancelled() {}
  finishCompleted() {}
  finishDiscarded() {}
  finishFailed() {}
  markFallbackSelected() {}
  setInputTokens() {}
  setOutputTokens() {}
}

class NoopDetachedWriter extends NoopScope implements DetachedOperationSpanWriter {
  finishCancelled() {}
  finishCompleted() {}
  finishFailed() {}
  setResultType() {}
}

class NoopModelAttemptWriter extends NoopScope implements ModelAttemptSpanWriter {
  finishAbandoned() {}
  finishCancelled() {}
  finishCompleted() {}
  finishFailed() {}
  markFirstContent() {}
  markFirstProviderEvent() {}
  markFirstText() {}
  markStreamStalled() {}
  recordRequestObservation() {}
  setCacheReadTokens() {}
  setCacheWriteTokens() {}
  setEffectiveReasoningBudgetTokens() {}
  setEffectiveReasoningControl() {}
  setEffectiveReasoningLevel() {}
  setEffectiveReasoningState() {}
  setFinishReason() {}
  setHttpStatusCode() {}
  setInputTokens() {}
  setOutputTokens() {}
  setProviderErrorCode() {}
  setProviderErrorMessage() {}
  setProviderRequestId() {}
  setReasoningTokens() {}
  setResponseModel() {}
  setRetryAfterMs() {}
  setStreamOutputCommitted() {}
}

const noopModelAttemptWriter = new NoopModelAttemptWriter();

class NoopModelCallWriter extends NoopScope implements ModelCallSpanWriter {
  finishAbandoned() {}
  finishCancelled() {}
  finishCompleted() {}
  finishFailed() {}
  markFallbackSelected() {}
  startAttempt(): ModelAttemptSpanWriter {
    return noopModelAttemptWriter;
  }
}

const noopModelCallWriter = new NoopModelCallWriter();
const noopCompactionWriter = new NoopCompactionWriter();
const noopDetachedWriter = new NoopDetachedWriter();
const noopStepWriter = new NoopStepWriter();
const noopToolWriter = new NoopToolWriter();
const noopTurnWriter = new NoopTurnWriter();

export class NoopAgentExecutionTelemetry
  implements AgentExecutionTelemetryPort, ModelExecutionTelemetryPort
{
  abandonSession(): void {}
  captureCausation() {
    return undefined;
  }
  startCall(): ModelCallSpanWriter {
    return noopModelCallWriter;
  }
  startCompaction(): ContextCompactionSpanWriter {
    return noopCompactionWriter;
  }
  startDetachedOperation(): DetachedOperationSpanWriter {
    return noopDetachedWriter;
  }
  startStep(): AgentStepSpanWriter {
    return noopStepWriter;
  }
  startTool(): ToolExecutionSpanWriter {
    return noopToolWriter;
  }
  startTurn(): AgentTurnSpanWriter {
    return noopTurnWriter;
  }
}
