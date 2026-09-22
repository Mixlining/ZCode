import type {
  ApiClient,
  AppUsageRequest,
  AppUsageSnapshot,
  CodingPlanUsageRequest,
  CodingPlanUsageSnapshot,
  CodingPlanResetOpportunityRequest,
  CodingPlanResetOpportunityResult,
  CodingPlanResetScopeRequest,
  CodingPlanResetStatusSnapshot,
  CodingPlanResetUseRequest,
  CodingPlanResetUseResult,
  UsageEntitlementRequest,
  UsageEntitlementSnapshot,
  UsageStatsRequest,
  UsageStatsSnapshot,
} from "@zcode/shared";
import {
  CODING_PLAN_DISABLED,
  ESTIMATED_TOKEN_CHAR_DIVISOR,
  isCodingPlanModelProviderId,
} from "@zcode/shared";
import type { ICredentialService } from "../credential/credential.js";
import type { IAccountRequestAuthService } from "../model-provider/accountRequestAuthService.js";
import type { IZCodeAgentService } from "../zcode-agent/zcodeAgent.js";
import type { IUsageStatsService } from "./usageStats.js";
import {
  BigModelUsageQuotaProvider,
  type UsageApiAuthorizationRequest,
  type UsageApiAuthorization,
} from "./providers/bigmodelUsageQuotaProvider.js";
import type { OfficialMcpCredentialSource } from "./providers/zcodeMcpQuotaProvider.js";

interface UsageStatsServiceDependencies {
  apiClient: ApiClient;
  accountRequestAuthService: Pick<
    IAccountRequestAuthService,
    "resolveAccessCurrent" | "resolveCurrent" | "assertCurrent"
  >;
  resolveApiAuthorization?: (
    request: UsageApiAuthorizationRequest,
  ) => Promise<UsageApiAuthorization | null>;
  credentialService?: Pick<ICredentialService, "load">;
  env?: NodeJS.ProcessEnv;
  /** App Usage 经 ZCode Protocol 读取 agent 数据库真实统计。 */
  zcodeAgentService: Pick<IZCodeAgentService, "getAppUsageStats">;
  /**
   * 官方 Server MCP 额度的凭证来源（与 server MCP 调用同一套 5 个身份头）。
   * 缺省时 entitlement 快照不含 MCP 额度。
   */
  officialMcpCredentialSource?: OfficialMcpCredentialSource;
}

function isCodingPlanProviderId(providerId: string | undefined): boolean {
  return Boolean(providerId && isCodingPlanModelProviderId(providerId));
}

/**
 * 套餐停用时下发的空权益快照。
 *
 * `unavailableReason: "unavailable"` 会被 `plan-identity` 与 `resolveUsageEntitlementOutcome`
 * 判为 unknown（不是 no_plan，不能当作“明确无套餐”），因此调用方只会显示空态，
 * 不会误判订阅状态，也不会与真实查询结果混淆。
 */
function createDisabledEntitlementSnapshot(): UsageEntitlementSnapshot {
  return {
    generatedAt: Date.now(),
    authenticated: false,
    unavailableReason: "unavailable",
    provider: null,
    remaining: null,
    subscription: null,
    quota: null,
  };
}

/**
 * 套餐停用时下发的空 Coding Plan 用量快照。
 *
 * 与真实快照同形，但所有统计为零、来源为空，让面板自然呈现空态。
 */
function createDisabledCodingPlanUsageSnapshot(
  request: CodingPlanUsageRequest,
): CodingPlanUsageSnapshot {
  const today = new Date().toISOString().slice(0, 10);
  return {
    range: request.range,
    rangeStartDate: request.customStartDate?.trim() || today,
    rangeEndDate: request.customEndDate?.trim() || today,
    generatedAt: Date.now(),
    sourceProvider: { id: "", name: "" },
    quota: null,
    activity: {
      summary: {
        totalTokens: 0,
        peakDailyTokens: 0,
        peakDailyTokensDate: null,
        totalUsageDurationMs: 0,
        currentStreakDays: 0,
        longestStreakDays: 0,
        favoriteModelName: null,
      },
      heatmap: { startDate: null, endDate: null, maxTokens: 0, weeks: [] },
    },
    detail: {
      model: {
        cacheHitRate: null,
        cacheHitRateTrend: null,
        totalCredits: 0,
        totalCreditsTrend: null,
        averageDailyCredits: 0,
        averageDailyCreditsTrend: null,
      },
      tool: {
        cacheHitRate: null,
        cacheHitRateTrend: null,
        totalCredits: 0,
        totalCreditsTrend: null,
        averageDailyCredits: 0,
        averageDailyCreditsTrend: null,
      },
    },
    modelUsage: {
      xTime: [],
      granularity: "day",
      totalModelCallCount: 0,
      totalTokensUsage: 0,
      modelDataList: [],
      modelSummaryList: [],
    },
    toolUsage: {
      xTime: [],
      granularity: "day",
      toolDataList: [],
      toolSummaryList: [],
    },
    health: { xTime: [], proMaxDecodeSpeed: [], liteDecodeSpeed: [] },
  };
}

/**
 * 套餐停用时下发的空 Coding Plan 监控快照（`getSnapshot`）。
 * App Usage 走 `getAppUsageSnapshot`，不受这里影响。
 */
function createDisabledUsageStatsSnapshot(request: UsageStatsRequest): UsageStatsSnapshot {
  return {
    range: request.range,
    generatedAt: Date.now(),
    timeZone: request.timeZone?.trim() || "UTC",
    estimatedTokenCharDivisor: ESTIMATED_TOKEN_CHAR_DIVISOR,
    summary: {
      totalSessions: 0,
      totalMessages: 0,
      totalCharacters: 0,
      totalEstimatedTokens: 0,
      activeDays: 0,
      mostActiveDay: null,
      favoriteModel: null,
      longestSessionMs: 0,
      longestStreakDays: 0,
      currentStreakDays: 0,
      firstActivityDate: null,
      lastActivityDate: null,
      peakHour: null,
    },
    daily: [],
    heatmap: { startDate: null, endDate: null, maxActivityScore: 0, weeks: [], monthLabels: [] },
    models: [],
  };
}

export function createUsageStatsService(
  dependencies: UsageStatsServiceDependencies,
): IUsageStatsService {
  const quotaProvider = new BigModelUsageQuotaProvider({
    apiClient: dependencies.apiClient,
    accountRequestAuthService: dependencies.accountRequestAuthService,
    resolveApiAuthorization: dependencies.resolveApiAuthorization,
    credentialService: dependencies.credentialService,
    env: dependencies.env,
    ...(dependencies.officialMcpCredentialSource
      ? { officialMcpCredentialSource: dependencies.officialMcpCredentialSource }
      : {}),
  });

  return {
    async getAppUsageSnapshot(request: AppUsageRequest): Promise<AppUsageSnapshot> {
      // App Usage 现读取 agent 数据库真实统计（model_usage/turn_usage/tool_usage），
      // 经 ZCode Protocol usage/stats 取回。不再读本地 session JSON 估算。
      return dependencies.zcodeAgentService.getAppUsageStats({
        range: request.range,
        timeZone: request.timeZone,
      });
    },
    async getCodingPlanUsageSnapshot(
      request: CodingPlanUsageRequest,
    ): Promise<CodingPlanUsageSnapshot> {
      // 套餐硬禁用：服务边界直接下发空快照，不请求厂商 monitor 接口。
      if (CODING_PLAN_DISABLED) {
        return createDisabledCodingPlanUsageSnapshot(request);
      }
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        // Coding Plan 页面只允许预置的 Z.AI/BigModel Coding Plan 账号。
        // 普通 provider id 不能进入 monitor 链路，避免误读 API Key 或环境变量。
        throw new Error("no_bigmodel_api_key");
      }
      return quotaProvider.getCodingPlanUsageSnapshot(request);
    },
    async getCodingPlanResetStatus(
      request: CodingPlanResetScopeRequest,
    ): Promise<CodingPlanResetStatusSnapshot> {
      // 套餐硬禁用：没有可用重置机会，也不请求厂商接口。
      if (CODING_PLAN_DISABLED) {
        return {
          availableFiveHourResets: [],
          availableWeekResets: [],
          latestFiveHourResetHistory: null,
          latestWeekResetHistory: null,
          hasUnreadHistory: false,
        };
      }
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        throw new Error("no_bigmodel_api_key");
      }
      return quotaProvider.getCodingPlanResetStatus(request);
    },
    async requestCodingPlanResetOpportunity(
      request: CodingPlanResetOpportunityRequest,
    ): Promise<CodingPlanResetOpportunityResult> {
      // 套餐硬禁用：按“未授予”返回，语义准确且不请求厂商接口。
      if (CODING_PLAN_DISABLED) {
        return { granted: false, nextTryAt: null };
      }
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        throw new Error("no_bigmodel_api_key");
      }
      return quotaProvider.requestCodingPlanResetOpportunity(request);
    },
    async useCodingPlanReset(
      request: CodingPlanResetUseRequest,
    ): Promise<CodingPlanResetUseResult> {
      // 套餐硬禁用：`CodingPlanResetUseResult` 只能表达成功（`used: true`），没有空值可返回，
      // 返回成功等于谎报一次额度重置。UI 入口已由 CODING_PLAN_DISABLED 关闭，这里保持
      // 显式失败，恢复套餐时无需改动。
      if (CODING_PLAN_DISABLED) {
        throw new Error("套餐功能在当前构建中已停用");
      }
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        throw new Error("no_bigmodel_api_key");
      }
      return quotaProvider.useCodingPlanReset(request);
    },
    async markCodingPlanResetHistoryRead(request: CodingPlanResetScopeRequest): Promise<void> {
      // 套餐硬禁用：无历史可标记，也不请求厂商接口（void 返回，直接落定为已完成）。
      if (CODING_PLAN_DISABLED) return;
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        throw new Error("no_bigmodel_api_key");
      }
      await quotaProvider.markCodingPlanResetHistoryRead(request);
    },
    async getSnapshot(request: UsageStatsRequest): Promise<UsageStatsSnapshot> {
      // 套餐硬禁用：Coding Plan monitor 统计不再查询，下发空快照。
      if (CODING_PLAN_DISABLED) {
        return createDisabledUsageStatsSnapshot(request);
      }
      // App Usage 已迁移到 getAppUsageSnapshot（agent 数据库）。getSnapshot 仅服务 Coding Plan monitor 链路。
      // 任何 monitor 失败都不能回退本地数据，保持数据源隔离。
      return quotaProvider.getUsageStatsSnapshot(request);
    },
    async getEntitlementSnapshot(
      request: UsageEntitlementRequest = {},
    ): Promise<UsageEntitlementSnapshot> {
      // 套餐硬禁用：权益查询不再进入 quota provider，避免旧账号配置（例如没有保存
      // provider-family selection 的历史数据）绕过界面开关触发官方权益与额度请求。
      if (CODING_PLAN_DISABLED) {
        return createDisabledEntitlementSnapshot();
      }
      return quotaProvider.getSnapshotForRequest(request);
    },
  };
}
