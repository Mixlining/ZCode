import type { ApiClient, EnterpriseCodingPlanOrderStatusRequest } from "@zcode/shared";
import { CODING_PLAN_DISABLED } from "@zcode/shared";
import type { ICredentialService } from "../credential/credential.js";
import {
  EMPTY_DISABLED_OFF_PEAK_CLIENT_CONFIG,
  type ICodingPlanSubscriptionService,
} from "./codingPlanSubscription.js";
import { BigModelCodingPlanSubscriptionProvider } from "./bigmodelCodingPlanSubscriptionProvider.js";
import type { ModelSelectionView } from "@zcode/provider";
import { ZaiCodingPlanSubscriptionProvider } from "./zaiCodingPlanSubscriptionProvider.js";

interface CodingPlanSubscriptionServiceDependencies {
  apiClient: ApiClient;
  credentialService: Pick<ICredentialService, "load">;
  resolveOffPeakModelSelectionView?: () => Promise<ModelSelectionView>;
}

/**
 * 套餐域硬禁用时被替换的方法集合。
 *
 * 只列套餐、商品、定价、支付、订单、协议，以及依赖套餐凭据的闲时任务；
 * 模型能力与平台配置类方法（动态工作流灰度、模型上下文预算、强制更新）不属于套餐域，
 * 继续走真实实现（它们各自的远端读取另有 REMOTE_ROLLOUT_DISABLED 等开关收敛）。
 */
type CodingPlanDisabledMethod =
  | "batchPreview"
  | "getStaticProducts"
  | "getStaticTeamProducts"
  | "getStartPlanPreview"
  | "getOffPeakClientConfig"
  | "productInfo"
  | "preview"
  | "createSign"
  | "updateSign"
  | "checkPayment"
  | "checkPendingOrders"
  | "queryStripeCards"
  | "bindStripeCard"
  | "unbindStripeCard"
  | "payStripe"
  | "checkPaypalSupport"
  | "createPaypalSetupToken"
  | "subscribePaypal"
  | "getEnterprisePricing"
  | "getEnterpriseBalance"
  | "calculateEnterpriseOrder"
  | "createEnterpriseOrder"
  | "getEnterprisePendingOrders"
  | "cancelEnterpriseOrder"
  | "continueEnterpriseOrderPayment"
  | "checkEnterpriseOrderStatus";

/**
 * 套餐域硬禁用时使用的空实现。
 *
 * 返回值都是契约允许的中性值：读取类为空值/空列表，动作类为「未发生」状态（未支付、无订单、
 * 已关闭），使调用方自然降级为空态。这里不请求厂商、也不写失败日志——界面已隐藏，
 * 报错只会污染日志。
 *
 * 唯一不在表内的是 `useCodingPlanReset`：它属于 `usageStatsService`，其返回类型
 * `CodingPlanResetUseResult` 只能表达成功（`{ used: true }`），伪造成功等于谎报一次额度重置。
 */
const DISABLED_CODING_PLAN_METHODS: Pick<ICodingPlanSubscriptionService, CodingPlanDisabledMethod> =
  {
    batchPreview: async () => ({ productList: [], isSubscribed: false, isAuthenticated: false }),
    getStaticProducts: async () => ({}),
    getStaticTeamProducts: async () => ({}),
    getStartPlanPreview: async () => null,
    getOffPeakClientConfig: async () => EMPTY_DISABLED_OFF_PEAK_CLIENT_CONFIG,
    productInfo: async (request) => ({ productId: request.productId }),
    preview: async (request) => ({ productId: request.productId, bizId: "" }),
    createSign: async () => ({ sign: "" }),
    updateSign: async () => ({ sign: "" }),
    checkPayment: async () => ({ status: "CLOSED" }),
    checkPendingOrders: async () => ({ hasPendingOrders: false }),
    queryStripeCards: async () => [],
    bindStripeCard: async (request) => ({ paymentMethodId: request.paymentMethodId }),
    unbindStripeCard: async () => "",
    payStripe: async () => ({}),
    checkPaypalSupport: async () => ({ isSupport: false }),
    createPaypalSetupToken: async () => ({}),
    subscribePaypal: async () => ({}),
    getEnterprisePricing: async () => ({ productList: [] }),
    getEnterpriseBalance: async () => ({ giveBalance: 0, cashBalance: 0, totalBalance: 0 }),
    calculateEnterpriseOrder: async () => ({
      totalOriginalAmount: 0,
      totalPayAmount: 0,
      thirdPayAmount: 0,
    }),
    createEnterpriseOrder: async () => ({
      orderNo: "",
      totalOriginalAmount: 0,
      totalPayAmount: 0,
      thirdPayAmount: 0,
    }),
    getEnterprisePendingOrders: async () => [],
    cancelEnterpriseOrder: async (request) => ({ orderNo: request.orderNo, status: "CLOSED" }),
    continueEnterpriseOrderPayment: async (request) => ({
      orderNo: request.orderNo,
      totalOriginalAmount: 0,
      totalPayAmount: 0,
      thirdPayAmount: 0,
    }),
    checkEnterpriseOrderStatus: async (request: EnterpriseCodingPlanOrderStatusRequest) => ({
      orderNo: request.orderNo,
      paymentStatus: "CLOSED",
    }),
  };

/**
 * 原 service 把所有调用直接绑定到单一 BigModelCodingPlanSubscriptionProvider，
 * zai family 没有独立的 Team Plan 定价来源（死代码）。
 *
 * zai 与 bigmodel Team Plan 全链路对称化：
 * 同时持有 bigmodel 和 zai 两个 provider 实例；enterprise 读路径（getEnterprisePricing）按
 * request.family 路由到对应实例；缺省 family 时保持 bigmodel，向后兼容既有调用点。
 *
 * 其余方法（购买/staticConfigs/preview 等）语义与 family 无关或已在 provider 内部按
 * request.providerId 动态路由，统一委托给 bigmodel provider 即可：
 *   - 企业购买闭环（balance/order/pending/cancel/continue/status）按产品决策仍只走 bigmodel 域。
 *   - staticConfigs 是平台级 client/configs，与 family 无关。
 *   - 购买类（Stripe/PayPal/preview/createSign 等）已通过 request.providerId 在 provider 内路由。
 */
export function createCodingPlanSubscriptionService(
  dependencies: CodingPlanSubscriptionServiceDependencies,
): ICodingPlanSubscriptionService {
  const bigmodelProvider = new BigModelCodingPlanSubscriptionProvider(dependencies);
  const zaiProvider = new ZaiCodingPlanSubscriptionProvider(dependencies);

  // 按 family 选择 enterprise 读路径 provider；缺省（含未指定 family 的历史调用）走 bigmodel。
  const resolveEnterprisePricingProvider = (
    family?: "bigmodel" | "zai",
  ): BigModelCodingPlanSubscriptionProvider => (family === "zai" ? zaiProvider : bigmodelProvider);

  const liveService: ICodingPlanSubscriptionService = {
    batchPreview: (request) => bigmodelProvider.batchPreview(request),
    getStaticProducts: () => bigmodelProvider.getStaticProducts(),
    getStaticTeamProducts: () => bigmodelProvider.getStaticTeamProducts(),
    getStartPlanPreview: () => bigmodelProvider.getStartPlanPreview(),
    getOffPeakClientConfig: (options) => bigmodelProvider.getOffPeakClientConfig(options),
    // 动态工作流灰度：与 client/configs 同源，
    // 因此和其它平台级配置一样固定走 bigmodel provider，与 family 无关。
    getDynamicWorkflowClientConfig: (options) =>
      bigmodelProvider.getDynamicWorkflowClientConfig(options),
    getModelContextBudgetStrategy: () => bigmodelProvider.getModelContextBudgetStrategy(),
    getForceUpdateConfig: () => bigmodelProvider.getForceUpdateConfig(),
    productInfo: (request) => bigmodelProvider.productInfo(request),
    preview: (request) => bigmodelProvider.preview(request),
    createSign: (request) => bigmodelProvider.createSign(request),
    updateSign: (request) => bigmodelProvider.updateSign(request),
    checkPayment: (request) => bigmodelProvider.checkPayment(request),
    checkPendingOrders: (request) => bigmodelProvider.checkPendingOrders(request),
    queryStripeCards: (request) => bigmodelProvider.queryStripeCards(request),
    bindStripeCard: (request) => bigmodelProvider.bindStripeCard(request),
    unbindStripeCard: (request) => bigmodelProvider.unbindStripeCard(request),
    payStripe: (request) => bigmodelProvider.payStripe(request),
    checkPaypalSupport: (request) => bigmodelProvider.checkPaypalSupport(request),
    createPaypalSetupToken: (request) => bigmodelProvider.createPaypalSetupToken(request),
    subscribePaypal: (request) => bigmodelProvider.subscribePaypal(request),
    getEnterprisePricing: (request) =>
      resolveEnterprisePricingProvider(request?.family).getEnterprisePricing(request),
    getEnterpriseBalance: () => bigmodelProvider.getEnterpriseBalance(),
    calculateEnterpriseOrder: (request) => bigmodelProvider.calculateEnterpriseOrder(request),
    createEnterpriseOrder: (request) => bigmodelProvider.createEnterpriseOrder(request),
    getEnterprisePendingOrders: () => bigmodelProvider.getEnterprisePendingOrders(),
    cancelEnterpriseOrder: (request) => bigmodelProvider.cancelEnterpriseOrder(request),
    continueEnterpriseOrderPayment: (request) =>
      bigmodelProvider.continueEnterpriseOrderPayment(request),
    checkEnterpriseOrderStatus: (request) => bigmodelProvider.checkEnterpriseOrderStatus(request),
  };

  // 套餐硬禁用：只替换套餐域方法，其它方法保持真实实现。守卫放在 service 边界而不是 UI
  // 或 provider，是为了让 Renderer 之外的调用方（Host、后台刷新、CLI）也无法绕过。
  if (CODING_PLAN_DISABLED) {
    return { ...liveService, ...DISABLED_CODING_PLAN_METHODS };
  }

  return liveService;
}
