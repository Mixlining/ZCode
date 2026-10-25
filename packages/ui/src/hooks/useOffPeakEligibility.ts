import { CODING_PLAN_DISABLED } from "@zcode/shared";
import { useEffect } from "react";
import type { AppSettings } from "@zcode/shared";
import { useServices } from "@/hooks/useServices.js";
import { useOffPeakTaskStore } from "@/store/offPeakTaskStore.js";

/**
 * 两个闲时入口共享初始化/连接/Registry 通知边界，不在组件中另存资格。
 *
 * 闲时任务随套餐永久禁用：入口不订阅、不初始化；store 守卫仅作纵深防御。
 */
export function useOffPeakEligibility(
  settings: AppSettings | null | undefined,
  registryRevision: number | undefined,
): void {
  // 禁用域不进入 hooks，避免初始化调用、store 订阅与资格 key 派生。
  if (CODING_PLAN_DISABLED) return;
  const { offPeakTaskService, codingPlanSubscriptionService } = useServices();
  const initialize = useOffPeakTaskStore((state) => state.initialize);
  const refresh = useOffPeakTaskStore((state) => state.refreshCodingPlanSupport);
  const family = settings?.providerFamilyDomain;
  const connection = family ? settings?.providerFamilyConnectionSelections?.[family] : undefined;
  const freshnessKey = settings
    ? JSON.stringify([registryRevision, family, connection])
    : undefined;

  useEffect(() => {
    void initialize({ offPeakTaskService, codingPlanSubscriptionService });
  }, [initialize, offPeakTaskService, codingPlanSubscriptionService]);

  useEffect(() => {
    if (freshnessKey === undefined) return;
    // Settings 变化只是失效信号；ProviderSettings View revision 来自 Registry 已完成发布。
    // 即使选择没变，账号稍后就绪也会重查；相同 key 的双入口通知由 Store 去重。
    void refresh(offPeakTaskService, freshnessKey);
  }, [freshnessKey, offPeakTaskService, refresh]);
}
