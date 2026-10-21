import { useMemo, useSyncExternalStore } from "react";
import { REMOTE_WORKSPACE_DISABLED } from "@zcode/shared";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { getSourceServerDisplayNameRegistry } from "@/store/sourceServerDisplayNameRegistry.js";

const emptyNames: ReadonlyMap<string, string> = new Map();
const subscribeToNothing = () => () => undefined;
const getEmptyNames = () => emptyNames;

export function useSourceServerDisplayNames(enabled = true): ReadonlyMap<string, string> {
  const management = useBaseWorkspaceServices().sourceServerManagementService;
  // 远程 workspace 硬禁用：Host 不注册 ISourceServerManagementService，而 renderer 侧的
  // accessor 是惰性代理（恒为 truthy）。注册表在构造时就 onDidChangeState + getSnapshot，
  // 因此必须在拿到 registry 之前用编译期常量关断，否则每次挂载都等满 ChannelServer 超时。
  const requested = enabled && !REMOTE_WORKSPACE_DISABLED;
  const registry = useMemo(
    () => (requested && management ? getSourceServerDisplayNameRegistry(management) : null),
    [requested, management],
  );
  return useSyncExternalStore(
    registry?.subscribe ?? subscribeToNothing,
    registry?.getSnapshot ?? getEmptyNames,
    registry?.getSnapshot ?? getEmptyNames,
  );
}
