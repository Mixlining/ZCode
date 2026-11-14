import { describe, expect, it } from "vitest";
import {
  listSessionsResultSchema,
  cliCreateSessionInputSchema,
  cliSessionRefSchema,
  createSessionResultSchema,
  operationSnapshotSchema,
  sendToSessionResultSchema,
  workspacePathSchema,
} from "@zcode/session-control/contracts";

describe("session-control public wire contracts", () => {
  it("supports absolute POSIX, drive and UNC paths without using platform IO", () => {
    for (const cwd of [
      "/workspace",
      "C:\\workspace",
      "D:/workspace",
      "\\\\server\\share\\workspace",
    ]) {
      // 规格 0.14 后 cwd 不再是工具参数，但跨平台路径规则仍服务 session 引用，直接测 schema 本身。
      expect(workspacePathSchema.safeParse(cwd).success).toBe(true);
    }
    expect(
      cliSessionRefSchema.safeParse({
        kind: "app",
        workspacePath: "/workspace",
        sessionId: "sess_session",
      }).success,
    ).toBe(false);
  });
  it("rejects invented completion states and impossible accepted creation receipts", () => {
    const session = { kind: "cli", workspacePath: "/workspace", sessionId: "sess_session" };
    const operation = { session, sessionId: session.sessionId, commandId: "command" };
    expect(
      operationSnapshotSchema.safeParse({
        operation,
        epoch: "epoch",
        revision: 1,
        status: "success",
      }).success,
    ).toBe(false);
    expect(
      createSessionResultSchema.safeParse({
        requestId: "r",
        creation: "rejected",
        firstInput: "accepted",
        delivery: "start_now",
        session,
        operation,
      }).success,
    ).toBe(false);
    expect(
      createSessionResultSchema.safeParse({
        requestId: "r",
        creation: "created",
        firstInput: "rejected",
        delivery: "none",
        session,
      }).success,
    ).toBe(true);
  });
  it("preserves request identity exactly, rejects whitespace IDs and contradictory admission delivery", () => {
    expect(
      cliCreateSessionInputSchema.safeParse({ cwd: "/workspace", prompt: "run", requestId: " r " })
        .success,
    ).toBe(false);
    const session = { kind: "cli", workspacePath: "/workspace", sessionId: "sess_session" };
    const operation = { session, commandId: "command" };
    expect(
      sendToSessionResultSchema.safeParse({
        session,
        operation,
        admission: "rejected",
        delivery: "queued",
      }).success,
    ).toBe(false);
    expect(
      sendToSessionResultSchema.safeParse({
        session,
        operation,
        admission: "accepted",
        delivery: "none",
      }).success,
    ).toBe(false);
  });
});

// App 发现元数据不进入独立 CLI 列表契约。
it("keeps CLI list output independent from App discovery metadata", () => {
  expect(listSessionsResultSchema.safeParse({ sessions: [] }).success).toBe(true);
  expect(
    listSessionsResultSchema.safeParse({
      sessions: [],
      searchScope: { scopes: [], unavailableSources: [] },
    }).success,
  ).toBe(false);
});
