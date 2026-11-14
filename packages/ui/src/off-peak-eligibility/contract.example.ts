import type { AppSettings } from "@zcode/shared";
import { useOffPeakEligibility } from "../hooks/useOffPeakEligibility.js";
/** Root 固定调用位置；禁用选择发生在模块装配时。 */
export function useOffPeakEligibilityExample(settings: AppSettings | null, revision?: number) {
  useOffPeakEligibility(settings, revision);
}
