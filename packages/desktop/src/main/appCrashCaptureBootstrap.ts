import { logger } from "./logger.js";
import { initializeCrashCapture, type CrashCapturePaths } from "./desktopCrashCapture.js";

// 先由 desktopEarlyDataBaseDirBootstrap 注入 dataBaseDir，再配置本地 crashDumps。
// remoteCrashReporterEnabled 仅保留旧配置兼容；当前构建不启动 ARMS。
export const crashCapturePaths: CrashCapturePaths = initializeCrashCapture(logger, true);
