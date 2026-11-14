import { useOnboardingRecordService } from "../hooks/useOnboardingRecordService.js";
/** 调用方固定调用 Hook 后，再按服务是否存在决定是否读取记录。 */
export function useOnboardingRecordExample() {
  return useOnboardingRecordService();
}
