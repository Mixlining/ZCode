import { getCapturedZCodeAgentTelemetryEnv } from "@zcode/shared";
import {
  prepareModelTelemetryEnv,
  shutdownPreparedModelTelemetry,
  type PrepareModelTelemetryOptions,
} from "@zcode/telemetry";

/**
 * CLI 异步入口在创建同步 App 之前调用本函数以保留既有启动边界。
 * 2026-11 OTel 移除后这里是 no-op：不生成 device MID、不创建 Owner、
 * 不回写 OTLP 凭据；仅保留 env 捕获与清理边界。
 */
export async function prepareZCodeTelemetryEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: PrepareModelTelemetryOptions = {},
): Promise<NodeJS.ProcessEnv> {
  const prepared = await prepareModelTelemetryEnv({
    ...getCapturedZCodeAgentTelemetryEnv(),
    ...env,
  }, {
    ...options,
    productVersion: options.productVersion ?? env.ZCODE_APP_VERSION,
  });
  const deviceMid = prepared.ZCODE_TELEMETRY_DEVICE_MID;
  return deviceMid ? { ...env, ZCODE_TELEMETRY_DEVICE_MID: deviceMid } : env;
}

/**
 * 与 prepareZCodeTelemetryEnv 对称地关闭当前进程持有的 Telemetry Owner。
 * 单个 App/Session 只允许 flush；只有最外层可执行入口可以调用本函数。
 */
export async function shutdownZCodeTelemetry(): Promise<void> {
  await shutdownPreparedModelTelemetry();
}
