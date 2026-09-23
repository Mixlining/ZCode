import type { Logger } from "@zcode/contracts";
import {
  createMemorySampleWriteGate,
  ZCODE_CLI_RESOURCE_SAMPLE_INTERVAL_MS,
  MEMORY_DIAGNOSTICS_ENABLED,
  memoryUsageToSampleFields,
  ZCODE_TELEMETRY_ENABLED,
  zcodeProtocolNotifications,
  type MemorySample,
  type ZCodeProtocolNotification,
} from "@zcode/shared";
import {
  createZCodeProcessResourceSampler,
  type ZCodeProcessResourceSampler,
} from "../process-resource-sampler.js";
import type { ZCodeProtocolAgentServer } from "./server.js";

export function startProtocolResourceSampler(
  server: ZCodeProtocolAgentServer,
  send: (message: ZCodeProtocolNotification) => void,
  logger: Logger,
): ZCodeProcessResourceSampler | undefined {
  try {
    const maintainSessions = () => {
      server.rebalanceResidentSessions();
      try {
        server.pruneSessionEventStores();
        server.pruneDetachedChildPublishers();
      } catch {
        // 单次兜底淘汰失败不影响后续维护。
      }
    };
    if (!ZCODE_TELEMETRY_ENABLED && !MEMORY_DIAGNOSTICS_ENABLED) {
      // 保留既有 60 秒维护节拍，但不创建资源采样器或读取 CPU/内存。
      let timer: ReturnType<typeof setInterval> | undefined;
      const maintenance: ZCodeProcessResourceSampler = {
        start() {
          if (timer) return;
          timer = setInterval(() => {
            try {
              maintainSessions();
            } catch {
              // 下一节拍继续维护。
            }
          }, ZCODE_CLI_RESOURCE_SAMPLE_INTERVAL_MS);
          try {
            timer.unref?.();
          } catch {
            // unref 不可用时仍保留 timer，stop 能按原有生命周期回收。
          }
        },
        stop() {
          if (!timer) return;
          clearInterval(timer);
          timer = undefined;
        },
      };
      maintenance.start();
      return maintenance;
    }
    // 本地内存诊断日志：复用同一 60s 节拍，
    // 变化/心跳门控后才写一行，避免与消息流同频刷盘。
    const memoryDiagnosticsGate = createMemorySampleWriteGate();
    const sampler = createZCodeProcessResourceSampler({
      onSample: (sample, memoryUsage) => {
        // 遥测硬关闭：不再把 60 秒进程样本发给 app（main 侧入口已丢弃，累加器也永不排空）。
        if (ZCODE_TELEMETRY_ENABLED) {
          send({
            method: zcodeProtocolNotifications.processResourceSample,
            params: sample,
          });
        }
        // resident session TTL / 水位收敛借用资源采样节拍（60s）作兜底，不新增定时器；
        // sampler 对 onSample 已有异常兜底，单次 rebalance 失败不影响遥测上报。
        maintainSessions();
        // 内存诊断日志默认关闭：这个 60 秒节拍本身还驱动 resident session 收敛与事件存储淘汰，
        // 不能整段停掉，只把门控写盘这一步放到开关后面。
        if (!MEMORY_DIAGNOSTICS_ENABLED) {
          return;
        }
        try {
          const memorySample: MemorySample = {
            role: "agent_node",
            ...memoryUsageToSampleFields(memoryUsage),
            counters: server.collectMemoryDiagnostics(),
          };
          const reason = memoryDiagnosticsGate.evaluate(memorySample, Date.now());
          if (reason) {
            const { role: _role, counters, ...memoryFields } = memorySample;
            logger.info("Process memory sample", {
              event: "zcode_protocol.process.memory_sample",
              reason,
              ...memoryFields,
              counters,
            });
          }
        } catch {
          // 诊断日志失败只丢当前样本，不影响资源上报与 rebalance。
        }
      },
    });
    sampler.start();
    return sampler;
  } catch {
    // 资源遥测是 best effort，初始化失败不能改变 Agent 启动结果。
    return undefined;
  }
}
