import { ZCODE_TELEMETRY_ENABLED } from "@zcode/shared";
import type { TelemetryRendererContext } from "@zcode/shared";

interface StartupCoordinatorLike {
  onRendererReady(input: { hasPendingOAuthCallback: boolean; rendererId: number }): boolean;
  onOAuthCallbackHandled(input: { rendererId: number }): boolean;
}

interface TelemetryCoreLike {
  reportAppLaunch(context: TelemetryRendererContext): Promise<void>;
  reportAppDailyActive(context: TelemetryRendererContext): Promise<void>;
}

type DailyActiveInterval = ReturnType<typeof setInterval> | number;

interface AppTelemetryRuntimeDependencies {
  telemetryCore: TelemetryCoreLike;
  appLaunchCoordinator: StartupCoordinatorLike;
  onError?: (error: unknown) => void;
  dailyActiveHeartbeatIntervalMs?: number;
  setInterval?: (handler: () => void, timeout: number) => DailyActiveInterval;
  clearInterval?: (interval: DailyActiveInterval) => void;
}

const DEFAULT_DAILY_ACTIVE_HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

export function createAppTelemetryRuntime({
  telemetryCore,
  appLaunchCoordinator,
  onError,
  dailyActiveHeartbeatIntervalMs = DEFAULT_DAILY_ACTIVE_HEARTBEAT_INTERVAL_MS,
  setInterval: setIntervalFn = setInterval,
  clearInterval: clearIntervalFn = clearInterval,
}: AppTelemetryRuntimeDependencies) {
  const rendererContexts = new Map<number, TelemetryRendererContext>();
  let pendingStartupTelemetryRendererId: number | null = null;
  let latestRendererContext: TelemetryRendererContext | null = null;
  let interactive = false;

  function reportDailyActive(context: TelemetryRendererContext): void {
    // 总开关关闭（本仓库硬置 false）：app_daily_active 不发起，也不注册心跳定时器。
    if (!ZCODE_TELEMETRY_ENABLED) {
      return;
    }
    void telemetryCore.reportAppDailyActive(context).catch((error) => {
      onError?.(error);
    });
  }

  function maybeReportDailyActive(): void {
    if (!interactive || latestRendererContext == null) {
      return;
    }

    reportDailyActive(latestRendererContext);
  }

  const dailyActiveHeartbeat: DailyActiveInterval | null = ZCODE_TELEMETRY_ENABLED
    ? setIntervalFn(maybeReportDailyActive, dailyActiveHeartbeatIntervalMs)
    : null;
  if (dailyActiveHeartbeat !== null && typeof dailyActiveHeartbeat === "object") {
    dailyActiveHeartbeat.unref?.();
  }

  function flushStartupTelemetry(): void {
    if (pendingStartupTelemetryRendererId == null) {
      return;
    }

    const context = rendererContexts.get(pendingStartupTelemetryRendererId);
    if (context == null) {
      return;
    }

    pendingStartupTelemetryRendererId = null;
    if (!ZCODE_TELEMETRY_ENABLED) {
      return;
    }
    void telemetryCore.reportAppLaunch(context).catch((error) => {
      onError?.(error);
    });
    reportDailyActive(context);
  }

  function markStartupTelemetryPending(rendererId: number): void {
    pendingStartupTelemetryRendererId = rendererId;
    flushStartupTelemetry();
  }

  return {
    syncRendererContext(input: { rendererId: number; context: TelemetryRendererContext }): void {
      // 遥测硬关闭：不再按 renderer 缓存 context（此前只增不减，且唯一的读取方是已停用的上报）。
      if (!ZCODE_TELEMETRY_ENABLED) return;
      rendererContexts.set(input.rendererId, input.context);
      latestRendererContext = input.context;
      flushStartupTelemetry();
    },

    getLatestRendererContext(): TelemetryRendererContext | null {
      return latestRendererContext;
    },

    getRendererContext(rendererId: number): TelemetryRendererContext | null {
      return rendererContexts.get(rendererId) ?? null;
    },

    setInteractive(nextInteractive: boolean): void {
      const becameInteractive = !interactive && nextInteractive;
      interactive = nextInteractive;
      if (becameInteractive) {
        maybeReportDailyActive();
      }
    },

    onRendererReady(input: { hasPendingOAuthCallback: boolean; rendererId: number }): void {
      if (appLaunchCoordinator.onRendererReady(input)) {
        markStartupTelemetryPending(input.rendererId);
      }
    },

    onOAuthCallbackHandled(input: { rendererId: number }): void {
      if (appLaunchCoordinator.onOAuthCallbackHandled(input)) {
        markStartupTelemetryPending(input.rendererId);
      }
    },

    dispose(): void {
      if (dailyActiveHeartbeat !== null) {
        clearIntervalFn(dailyActiveHeartbeat);
      }
    },
  };
}
