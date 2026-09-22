import {
  DISABLED_RENDERER_ACTION_TRACE_CONFIG,
  RENDERER_ACTION_TRACE_SERVICE_NAME,
  ZCODE_ENV,
  ZCODE_TELEMETRY_ENABLED,
  ZCODE_VERSION,
  type IPlatformService,
  type RendererActionTraceConfigV1,
} from "@zcode/shared";
import { RendererUserActionTelemetry, setUserActionTelemetry } from "@zcode/ui";

export function initializeDesktopUserActionTrace(options: {
  platform: IPlatformService;
  isLocalDevelopmentRuntime: boolean;
}): () => void {
  if (!ZCODE_TELEMETRY_ENABLED) {
    // 遥测硬关闭：不注册渲染层 action trace 采集（它会按远端灰度上报批次）。
    setUserActionTelemetry(null);
    return () => {};
  }
  const sendBatch = options.platform.reportRendererActionTraceBatch;
  const getConfig = options.platform.getRendererActionTraceConfig;
  if (!sendBatch || !getConfig) {
    setUserActionTelemetry(null);
    return () => {};
  }

  const rendererInstanceId = crypto.randomUUID();
  const telemetry = new RendererUserActionTelemetry({
    config: DISABLED_RENDERER_ACTION_TRACE_CONFIG,
    resource: {
      serviceName: RENDERER_ACTION_TRACE_SERVICE_NAME,
      serviceVersion: ZCODE_VERSION || "unknown",
      deploymentEnvironment: options.isLocalDevelopmentRuntime ? "development" : ZCODE_ENV,
      rendererInstanceId,
    },
    sendBatch: (batch) => sendBatch(batch),
  });
  setUserActionTelemetry(telemetry);

  const applyConfig = (config: RendererActionTraceConfigV1) => telemetry.updateConfig(config);
  void getConfig()
    .then(applyConfig)
    .catch(() => {
      telemetry.updateConfig(DISABLED_RENDERER_ACTION_TRACE_CONFIG);
    });
  const disposeConfigListener = options.platform.onRendererActionTraceConfigChanged?.(applyConfig);
  const handlePageHide = () => {
    void telemetry.shutdown();
  };
  window.addEventListener("pagehide", handlePageHide, { once: true });

  return () => {
    window.removeEventListener("pagehide", handlePageHide);
    disposeConfigListener?.();
    setUserActionTelemetry(null);
    void telemetry.shutdown();
  };
}
