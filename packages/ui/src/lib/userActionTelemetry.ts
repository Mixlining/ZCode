import type { UserActionFeatureId } from "@/lib/userActionTraceCatalog.js";

/**
 * 2026-11 OTel 移除后，UI 用户操作遥测只保留 no-op 接口。
 *
 * 调用点（runUserAction / startUserAction 等）保持不变；这里不再构建 span、不排队、
 * 不创建定时器、不发送 batch，避免为无消费者的遥测保留任何后台资源。
 * 类型改为本地字面量联合，不再依赖 @zcode/shared 的 renderer action trace 契约。
 */
export interface UserActionTelemetryClock {
  now(): number;
  setNow?(value: number): void;
}

export type UserActionTrigger =
  | "button"
  | "keyboard"
  | "shortcut"
  | "menu"
  | "switch"
  | "select"
  | "drag";

export type UserActionResultSource =
  | "local_commit"
  | "shared_settings"
  | "setting_service"
  | "platform_result"
  | "authority_ack"
  | "optimistic_projection";

export type UserActionWorkspaceKind = "local" | "remote";
export type UserActionRemoteKind = "ssh" | "wsl" | "docker" | "server";
export type UserActionAutomationKind = "scheduled" | "off_peak";
export type UserActionStateAfter = "enabled" | "disabled";
export type UserActionAdmissionResult =
  | "accepted"
  | "rejected"
  | "stale"
  | "duplicate"
  | "noop"
  | "not_applicable";

export interface StartUserActionInput {
  featureId: UserActionFeatureId;
  action: string;
  trigger: UserActionTrigger;
  surface?: string;
  timeoutMs?: number;
  workspaceKind?: UserActionWorkspaceKind;
  remoteKind?: UserActionRemoteKind;
  automationKind?: UserActionAutomationKind;
}

export interface UserActionResult {
  resultSource?: UserActionResultSource;
  failureStage?: string;
  stateAfter?: UserActionStateAfter;
  configured?: boolean;
  requiresRestart?: boolean;
  sectionId?: string;
  valueAfter?: string;
  admissionResult?: UserActionAdmissionResult;
}

export interface UserActionFailure extends UserActionResult {
  failureStage: string;
}

export interface UserActionHandle {
  complete(result?: UserActionResult): void;
  fail(failure: UserActionFailure): void;
  reject(result?: UserActionResult): void;
  cancel(): void;
  noop(): void;
}

export interface UserActionTelemetry {
  start(input: StartUserActionInput): UserActionHandle;
}

const NOOP_ACTION_HANDLE: UserActionHandle = {
  complete() {},
  fail() {},
  reject() {},
  cancel() {},
  noop() {},
};

const NOOP_USER_ACTION_TELEMETRY: UserActionTelemetry = {
  start: () => NOOP_ACTION_HANDLE,
};

export function startUserAction(_input: StartUserActionInput): UserActionHandle {
  return NOOP_USER_ACTION_TELEMETRY.start(_input);
}

export async function runUserActionAsync<T>(options: {
  input: StartUserActionInput;
  operation: () => Promise<T>;
  completed?: UserActionResult | ((value: T) => UserActionResult);
  failureStage: string;
}): Promise<T> {
  const handle = startUserAction(options.input);
  try {
    const value = await options.operation();
    handle.complete(
      typeof options.completed === "function" ? options.completed(value) : options.completed,
    );
    return value;
  } catch (error) {
    handle.fail({ failureStage: options.failureStage });
    throw error;
  }
}

export function runUserAction<T>(options: {
  input: StartUserActionInput;
  operation: () => T;
  completed?: UserActionResult | ((value: T) => UserActionResult);
  failureStage: string;
}): T {
  const handle = startUserAction(options.input);
  try {
    const value = options.operation();
    handle.complete(
      typeof options.completed === "function" ? options.completed(value) : options.completed,
    );
    return value;
  } catch (error) {
    handle.fail({ failureStage: options.failureStage });
    throw error;
  }
}
