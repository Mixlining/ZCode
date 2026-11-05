import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentTelemetryRuntimeOwner } from "@zcode/contracts/telemetry";
import {
  createModelTelemetry,
  prepareModelTelemetryEnv,
  shutdownPreparedModelTelemetry,
} from "../src/bootstrap.js";
import { NoopAgentExecutionTelemetry } from "../src/agent-trace-runtime.js";

afterEach(async () => {
  await shutdownPreparedModelTelemetry();
});

describe("Telemetry bootstrap no-op", () => {
  it("显式注入的进程 Owner 优先，Session 关闭只 abandon + flush", async () => {
    const execution = new NoopAgentExecutionTelemetry();
    const flush = vi.fn(async () => {});
    const shutdown = vi.fn(async () => {});
    const abandon = vi.spyOn(execution, "abandonSession");
    const owner: AgentTelemetryRuntimeOwner = {
      abandonSession: abandon,
      agentExecution: execution,
      enabled: true,
      flush,
      modelExecution: execution,
      shutdown,
      updateIdentity() {},
    };

    const telemetry = createModelTelemetry({ owner, sessionId: "session-1" });
    expect(telemetry.enabled).toBe(true);
    expect(telemetry.agentExecution).toBe(execution);
    await telemetry.shutdown();
    expect(abandon).toHaveBeenCalledWith("session-1");
    expect(flush).toHaveBeenCalledOnce();
    expect(shutdown).not.toHaveBeenCalled();
  });

  it("无 Owner 时提供安全 Noop Port", async () => {
    const telemetry = createModelTelemetry();
    expect(telemetry.enabled).toBe(false);
    expect(telemetry.agentExecution.captureCausation()).toBeUndefined();
    await telemetry.shutdown();
  });

  it("prepare 原样返回 env，不生成 device MID 或状态文件", async () => {
    const home = await mkdtemp(join(tmpdir(), "zcode-telemetry-"));
    try {
      const env = {
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:1/v1/traces",
        ZCODE_HOME: home,
      };
      const [first, second] = await Promise.all([
        prepareModelTelemetryEnv(env, {
          cliVersion: "0.16.1",
          productVersion: "3.6.1",
        }),
        prepareModelTelemetryEnv(env, {
          cliVersion: "0.16.1",
          productVersion: "3.6.1",
        }),
      ]);

      expect(first).toBe(env);
      expect(second).toBe(env);
      expect(first.ZCODE_TELEMETRY_DEVICE_MID).toBeUndefined();
      expect(existsSync(join(home, "v2", "telemetry-state.json"))).toBe(false);
    } finally {
      await rm(home, { force: true, recursive: true });
    }
  });
});
