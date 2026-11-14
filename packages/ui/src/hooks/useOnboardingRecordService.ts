import type { OnboardingRecordHook } from "@/onboarding-record/contract.js";
import { useOptionalServices } from "./useServices.js";

/** 未提供上下文或 Host 未注册本地完成记录服务时返回 null。 */
export function useOnboardingRecordService(): ReturnType<OnboardingRecordHook> {
  // Hook 必须位于异常边界之外；可选服务代理读取仍允许安全降级。
  const services = useOptionalServices();
  try {
    return services?.onboardingRecordService ?? null;
  } catch {
    return null;
  }
}
