import type { IZCodeSessionService } from "@zcode/services";
import { useServices } from "@/hooks/useServices.js";
import { useWorkspaceServices } from "@/hooks/useWorkspaceServices.js";

export function useZCodeSessionService(
  workspacePath?: string,
  preferredRemoteSessionId?: string | null,
  workspaceIdentity?: string | null,
): IZCodeSessionService {
  const contextServices = useServices();
  // 路径切换不能改变 Hook 顺序；无路径保持原上下文，有路径保留身份和断连边界。
  const services = useWorkspaceServices(
    workspacePath,
    preferredRemoteSessionId,
    workspaceIdentity,
    undefined,
    workspacePath ? undefined : { unscopedServices: contextServices, forceUnscoped: true },
  );
  return services.zcodeSessionService;
}
