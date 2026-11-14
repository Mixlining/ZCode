import type { useOptionalServices } from "@/hooks/useServices.js";
/** 只读服务上下文；不注册服务、不复制记录，不支持时返回 null。 */
export type OnboardingRecordHook = () => NonNullable<
  NonNullable<ReturnType<typeof useOptionalServices>>["onboardingRecordService"]
> | null;
