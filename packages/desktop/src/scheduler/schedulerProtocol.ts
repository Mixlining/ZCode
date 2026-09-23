// Desktop 私有入口沿用历史路径；类型归 shared 所有，避免 Main 与 scheduler 的 TS 项目跨 rootDir 引用。
export type { MainToSchedulerMessage, SchedulerToMainMessage } from "@zcode/shared";
