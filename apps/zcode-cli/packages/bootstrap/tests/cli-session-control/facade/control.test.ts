import { describe, expect, it, vi } from "vitest";
import { createCliSessionControl } from "@zcode/session-control/cli";

import { createTestPorts } from "@zcode/session-control/testing";
import { cliCreateSessionInputSchema, type CliSessionRef } from "@zcode/session-control/contracts";

const cliRoot: CliSessionRef = { kind: "cli", workspacePath: "/workspace", sessionId: "sess_root" };
const cliTarget: CliSessionRef = { ...cliRoot, sessionId: "sess_target" };

function cliFixture() {
  const ports = createTestPorts("cli", cliRoot);
  return { ports, ctx: ports.context, control: createCliSessionControl(ports.cli) };
}

describe("strict schemas and independent facades", () => {
  it("has only the eight CLI application actions", () => {
    const { control } = cliFixture();
    expect(Object.keys(control).sort()).toEqual([
      "createSession",
      "forkSession",
      "interruptSession",
      "listSessions",
      "readSession",
      "renameSession",
      "sendToSession",
      "waitSessions",
    ]);
  });
  it("rejects unknown fields, blank input and spoofed context", async () => {
    const { control, ctx, ports } = cliFixture();
    // 规格 0.14：cwd 已从契约删除，多传即被 strictObject 拒。
    expect(
      cliCreateSessionInputSchema.safeParse({ cwd: "/workspace", prompt: "run", requestId: "r" })
        .success,
    ).toBe(false);
    expect(cliCreateSessionInputSchema.safeParse({ prompt: "run", requestId: "r" }).success).toBe(
      true,
    );
    await expect(
      control.sendToSession(ctx, {
        session: cliTarget,
        prompt: "run",
        requestId: "r",
        callerId: "spoof",
      } as never),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      control.sendToSession(ctx, { session: cliTarget, prompt: " ", requestId: "r" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(ports.calls).toEqual([]);
  });
  it("checks access grants and output schema instead of trusting adapter types", async () => {
    const { control, ctx, ports } = cliFixture();
    ports.cli.access.authorize = async () => ({
      scope: { kind: "cli", workspacePath: "/other" },
      fence: "epoch",
    });
    await expect(
      control.readSession(ctx, { session: cliTarget, view: "summary" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const other = cliFixture();
    other.ports.cli.execution.sendToSession = async () =>
      ({
        session: cliTarget,
        operation: { session: cliTarget, sessionId: cliTarget.sessionId, commandId: "r" },
        admission: "accepted",
        delivery: "queued",
        unexpected: true,
      }) as never;
    await expect(
      other.control.sendToSession(other.ctx, { session: cliTarget, prompt: "go", requestId: "r" }),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });
  it("rejects wrong-session receipts and cross-scope list output", async () => {
    const { control, ctx, ports } = cliFixture();
    ports.cli.execution.sendToSession = async () => ({
      requestId: "r",
      session: cliRoot,
      operation: { session: cliRoot, sessionId: cliRoot.sessionId, commandId: "r" },
      admission: "accepted",
      delivery: "queued",
    });
    await expect(
      control.sendToSession(ctx, { session: cliTarget, prompt: "go", requestId: "r" }),
    ).rejects.toMatchObject({ code: "invalid_output" });
    ports.cli.sessions.listSessions = async () => ({
      sessions: [
        {
          session: { ...cliTarget, workspacePath: "/other" },
          title: "private",
          status: "idle",
          availableActions: [],
        },
      ],
    });
    await expect(control.listSessions(ctx, {})).rejects.toMatchObject({ code: "invalid_output" });
  });
});

describe("CLI owner boundary", () => {
  it("preserves trace fields and keeps different workspace identities isolated", async () => {
    const { control, ctx, ports } = cliFixture();
    const traced = { ...ctx, traceId: "trace-1", turnId: "turn-1", toolCallId: "tool-1" };
    await control.renameSession(traced, {
      session: cliTarget,
      title: "Renamed",
      requestId: "rename",
    });
    expect(ports.calls.at(-1)?.ctx).toBe(traced);
    await expect(
      control.readSession(ctx, {
        session: { ...cliTarget, workspaceIdentity: "other-identity" },
        view: "summary",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("passes stable identity and fence without retries or another admission queue", async () => {
    const { control, ctx, ports } = cliFixture();
    const input = { session: cliTarget, prompt: "go", requestId: "stable-request" };
    const result = await control.sendToSession(ctx, input);
    expect(result.admission).toBe("accepted");
    expect(result.delivery).toBe("queued");
    expect(ports.calls.map((call) => call.method)).toEqual(["authorize", "sendToSession"]);
    expect(ports.calls[1]).toMatchObject({ ctx, input, grant: { fence: "test-epoch" } });
    ports.cli.execution.sendToSession = vi.fn(async () => {
      throw new Error("owner unknown");
    });
    await expect(control.sendToSession(ctx, input)).rejects.toThrow("owner unknown");
    expect(ports.cli.execution.sendToSession).toHaveBeenCalledTimes(1);
  });
  it("keeps partial create results and never retries rejected first input", async () => {
    const { control, ctx, ports } = cliFixture();
    ports.cli.execution.createSession = async () => ({
      requestId: "r",
      creation: "created",
      firstInput: "rejected",
      delivery: "none",
      session: cliTarget,
      reason: "provider unavailable",
    });
    await expect(
      control.createSession(ctx, { prompt: "go", requestId: "r" }),
    ).resolves.toMatchObject({ creation: "created", firstInput: "rejected" });
    expect(ports.calls.map((call) => call.method)).toEqual(["authorize"]);
  });
  it("defaults lists to the trusted root workspace, and forwards explicit execution guards", async () => {
    const { control, ctx, ports } = cliFixture();
    await control.listSessions(ctx, {});
    expect(ports.calls[1]?.input).toMatchObject({
      workspace: { kind: "cli", workspacePath: "/workspace" },
    });
    await control.interruptSession(ctx, {
      session: cliTarget,
      expectedExecutionId: "execution-2",
      requestId: "stop",
    });
    expect(ports.calls.at(-1)?.input).toMatchObject({
      expectedExecutionId: "execution-2",
      requestId: "stop",
    });
  });
  it("forks without automatically sending and preserves the stable history point", async () => {
    const { control, ctx, ports } = cliFixture();
    await control.forkSession(ctx, {
      session: cliTarget,
      atMessage: "message-5",
      requestId: "fork",
    });
    expect(ports.calls.map((call) => call.method)).toEqual(["authorize", "forkSession"]);
    expect(ports.calls.at(-1)?.input).toMatchObject({ atMessage: "message-5" });
  });
});
