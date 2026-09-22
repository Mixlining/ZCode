import { useEffect } from "react";
import type { AppSettings } from "@zcode/shared";
import { useServices } from "@/hooks/useServices.js";
import { useOffPeakTaskStore } from "@/store/offPeakTaskStore.js";

/**
 * 两个闲时入口共享初始化/连接/Registry 通知边界，不在组件中另存资格。
 *
 * 闲时任务已随套餐整体硬禁用，但停用点在 store（它才是本域渲染进程状态的唯一所有者）：
 * `initialize` / `refreshCodingPlanSupport` / `createTask` 在禁用时都不产生请求也不写状态，
 * 所以这里保持原样调用即可，不再重复一份「入口层是否停用」的判断。
 */
export function useOffPeakEligibility(
  settings: AppSettings | null | undefined,
  registryRevision: number | undefined,
): void {
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
