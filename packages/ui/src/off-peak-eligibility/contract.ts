import type { AppSettings } from "@zcode/shared";
/** 资格状态仍由服务/store 持有；编译期禁用时没有 Hook 或服务副作用。 */
export type OffPeakEligibilityHook = (
  settings: AppSettings | null | undefined,
  registryRevision: number | undefined,
) => void;
