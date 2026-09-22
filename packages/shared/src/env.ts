import type { ZCodeRuntimeEnv } from "./runtimeEnv.js";

export type ZCodeEnv = "test" | "production";
/** 安装包身份：决定应用名、app id、Electron 数据目录与更新策略；与后端环境 `ZCodeEnv` 是两个轴。 */
export type ZCodeProductFlavor = "production" | "preview";
export type ArmsRumEnv = "local" | "prod";

// 非构建环境（如 e2e 测试的 mocha）下 define 不存在，用 typeof 检查 + fallback 避免 ReferenceError
declare const __ZCODE_ENV__: string;
declare const __ZCODE_PRODUCT_FLAVOR__: string;

export function normalizeZCodeEnv(value: string | undefined): ZCodeEnv {
  return value?.trim().toLowerCase() === "production" ? "production" : "test";
}

export const ZCODE_ENV = normalizeZCodeEnv(
  typeof __ZCODE_ENV__ !== "undefined" ? __ZCODE_ENV__ : undefined,
);

/**
 * 身份缺省跟随后端环境（test → preview，production → production）。
 * 桌面构建通过 `ZCODE_PREVIEW_IDENTITY=1` 显式注入 preview，得到连接生产后端的 Preview 包；
 * 未注入 define 的 bundle（web、CLI、测试）沿用旧的单轴语义。
 */
export function normalizeZCodeProductFlavor(
  value: string | undefined,
  zcodeEnv: ZCodeEnv,
): ZCodeProductFlavor {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production" || normalized === "preview") {
    return normalized;
  }
  return zcodeEnv === "production" ? "production" : "preview";
}

export const ZCODE_PRODUCT_FLAVOR = normalizeZCodeProductFlavor(
  typeof __ZCODE_PRODUCT_FLAVOR__ !== "undefined" ? __ZCODE_PRODUCT_FLAVOR__ : undefined,
  ZCODE_ENV,
);
export const ZCODE_APP_VERSION_ENV = "ZCODE_APP_VERSION" as const;
export const ZCODE_BUILD_COMMIT_ID_ENV = "ZCODE_BUILD_COMMIT_ID" as const;

// ── 运行时环境变量（不经过编译打包，启动时从 process.env 读取） ──
// 启用调试模式，值为 inspect-brk 的端口号，如 ZCODE_DEBUG=9230
export const RUNTIME_ZCODE_DEBUG =
  typeof process !== "undefined" ? process.env.ZCODE_DEBUG : undefined;

// 硬禁用：本仓库按配置关闭全部遥测出网（数仓事件与 ARMS RUM），并完全忽略运行时环境变量——
// 即使部署环境注入了端点也不启用。各出口另有自己的初始化层守卫（desktop main 的
// appARMSBootstrap 与 services 的 telemetryCore），恢复时需要一起改回。
export const ZCODE_TELEMETRY_ENABLED: boolean = false;

// 硬禁用：会话分享、反馈工单与附件上传、帮助/社区/产品文档/更新日志外链的底层调用直接返回空或
// 错误（界面与入口保留）。这些调用都会把请求发往厂商服务，本构建不再使用；恢复时改回 false。
export const ZCODE_VENDOR_ACTIONS_DISABLED: boolean = true;

// 硬禁用：本构建只支持自带 API Key 接入，不再提供 ZCode 官方套餐（Z.ai / BigModel Coding Plan）。
// 三层同时收口：① 入口层——套餐页、套餐登录、模板选择器套餐模板、用量面板套餐 tab、侧边栏套餐
// 额度与等级徽章、会话额度横幅与重置提醒、启动登录门禁与自动引导都不再出现，Z.ai / BigModel
// 登录入口一并隐藏；② 服务边界——权益、额度、商品、定价、支付、订单、协议查询一律返回空值，
// 不请求厂商；③ 启动恢复——不恢复旧 OAuth 会话，账号来源解析不再认本地 OAuth 凭据，模型请求
// 也不再经官方网关改写到 zcode.z.ai。组件、i18n 与底层服务全部保留，仅加守卫；恢复时改回 false
// （自动引导另有 OccupationOnboarding 的 AUTO_ONBOARDING_DISABLED，测试期登录门禁另见
// rootStartupGate）。目录类例外见 spec/vendor-disable.md。
export const CODING_PLAN_DISABLED: boolean = true;

// 硬关闭：内存诊断采样器（renderer / host / scheduler / agent CLI 四个进程各自的定时采样与本地
// 日志）默认不启动。它们是排查内存增长的取证手段，需要在排查时把这里改成 true 再复现。
export const MEMORY_DIAGNOSTICS_ENABLED: boolean = false;

// 硬禁用：不再拉取远端灰度配置（/api/v1/client/configs 的灰度字段与套餐侧 dynamicWorkflow）。
// 灰度控制的功能固定在各自本地默认值：desktop context prompt 关闭、动态工作流关闭，
// 本地环境变量覆盖（ZCODE_DYNAMIC_WORKFLOW_MODE 等）仍然生效；恢复时改回 false。
export const REMOTE_ROLLOUT_DISABLED: boolean = true;

// 硬禁用：官方商店进入页面时的目录自动刷新（保留手动刷新入口）。它会在每次进入商店页发一次
// 厂商目录请求；恢复时改回 false。
export const MARKETPLACE_AUTO_REFRESH_DISABLED: boolean = true;

/** 数仓事件上报端点：由运行时环境变量提供，未配置即停用，构建产物不内嵌。 */
export const ZCODE_TELEMETRY_REPORT_ENDPOINT =
  typeof process !== "undefined" ? (process.env.ZCODE_TELEMETRY_REPORT_ENDPOINT ?? "") : "";

/** ARMS RUM 接入端点：由运行时环境变量提供，未配置即停用，构建产物不内嵌。 */
export const ZCODE_ARMS_RUM_ENDPOINT =
  typeof process !== "undefined" ? (process.env.ZCODE_ARMS_RUM_ENDPOINT ?? "") : "";

/** 将本地运行态与编译期 ZCODE_ENV 映射为 ARMS 控制台识别的上报环境标签 */
export function mapZCodeEnvToArmsRumEnv(runtimeEnv: ZCodeRuntimeEnv): ArmsRumEnv {
  return runtimeEnv !== "development" && ZCODE_ENV === "production" ? "prod" : "local";
}
