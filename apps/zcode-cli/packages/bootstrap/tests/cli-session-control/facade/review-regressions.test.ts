import { describe, expect, expectTypeOf, it } from "vitest";
import { createCliSessionControl } from "@zcode/session-control/cli";

import {
  createTestPorts,
  createOperationFeed,
  deferred,
  flushMicrotasks,
} from "@zcode/session-control/testing";
import type {
  CliOperationRef,
  CliSessionRef,
  OperationFeed,
  OperationSnapshot,
} from "@zcode/session-control/contracts";

const root: CliSessionRef = { kind: "cli", workspacePath: "/workspace", sessionId: "sess_root" };
const a: CliOperationRef = {
  session: { ...root, sessionId: "sess_a" },
  sessionId: "sess_a",
  commandId: "a-command",
};
const b: CliOperationRef = {
  session: { ...root, sessionId: "sess_b" },
  sessionId: "sess_b",
  commandId: "b-command",
};
const snapshot = (
  operation: CliOperationRef,
  status: OperationSnapshot["status"],
  revision = 0,
): OperationSnapshot<CliSessionRef> => ({ operation, status, epoch: "epoch-1", revision });

describe("wait convergence", () => {
  it.each(["initial", "update"])(
    "retains a settled %s after its feed ends while another target runs",
    async (stage) => {
      const ports = createTestPorts("cli", root);
      const feedA = createOperationFeed(snapshot(a, stage === "initial" ? "completed" : "running"));
      const feedB = createOperationFeed(snapshot(b, "running"));
      ports.cli.observations.open = async (_ctx, operation) =>
        operation.commandId === a.commandId ? feedA : feedB;
      let settled = false;
      const result = createCliSessionControl(ports.cli)
        .waitSessions(ports.context, { operations: [a, b], mode: "all" })
        .then((value) => {
          settled = true;
          return value;
        });
      await flushMicrotasks();
      if (stage === "update")
        feedA.push({ type: "snapshot", snapshot: snapshot(a, "completed", 1) });
      await flushMicrotasks();
      feedA.end();
      await flushMicrotasks();
      expect(settled).toBe(false);
      expect(feedA.closeCount).toBe(1);
      expect(feedB.closeCount).toBe(0);
      feedB.push({ type: "snapshot", snapshot: snapshot(b, "completed", 1) });
      await expect(result).resolves.toMatchObject({
        status: "completed",
        operations: [{ status: "completed" }, { status: "completed" }],
      });
      expect(feedB.closeCount).toBe(1);
    },
  );
  it("timeout zero any collects every baseline before returning a completed target", async () => {
    const ports = createTestPorts("cli", root);
    const feedA = createOperationFeed(snapshot(a, "completed"));
    const feedB = createOperationFeed(snapshot(b, "running"));
    const openingB = deferred<OperationFeed<CliSessionRef>>();
    ports.cli.observations.open = async (_ctx, operation) =>
      operation.commandId === a.commandId ? feedA : openingB.promise;
    let settled = false;
    const result = createCliSessionControl(ports.cli)
      .waitSessions(ports.context, { operations: [a, b], mode: "any", timeoutMs: 0 })
      .then((value) => {
        settled = true;
        return value;
      });
    await flushMicrotasks();
    expect(settled).toBe(false);
    openingB.resolve(feedB);
    await expect(result).resolves.toMatchObject({
      status: "completed",
      operations: [
        { operation: a, epoch: "epoch-1", status: "completed" },
        { operation: b, epoch: "epoch-1", status: "running" },
      ],
    });
    expect(feedA.closeCount).toBe(1);
    expect(feedB.closeCount).toBe(1);
  });
});

describe("facade operation type isolation", () => {
  it("round-trips a CLI wait operation into the same facade", async () => {
    const ports = createTestPorts("cli", root);
    const control = createCliSessionControl(ports.cli);
    const result = await control.waitSessions(ports.context, {
      operations: [a],
      mode: "all",
      timeoutMs: 0,
    });
    const next = result.operations[0];
    if (!next) throw new Error("Missing operation");
    expectTypeOf(next.operation).toEqualTypeOf<CliOperationRef>();
    await control.waitSessions(ports.context, {
      operations: [next.operation],
      mode: "all",
      timeoutMs: 0,
    });
  });
});
