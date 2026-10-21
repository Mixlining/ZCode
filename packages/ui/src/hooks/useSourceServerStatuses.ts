import { useMemo, useSyncExternalStore } from "react";
import { REMOTE_WORKSPACE_DISABLED } from "@zcode/shared";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { getSourceServerStatusRegistry } from "@/store/sourceServerStatusRegistry.js";
import type { AggregatedSourceStatus } from "@/lib/remoteConnectionPresentation.js";

const emptyStatuses: ReadonlyMap<string, AggregatedSourceStatus> = new Map();
const subscribeToNothing = () => () => undefined;
const getEmptyStatuses = () => emptyStatuses;

// 远程 workspace 硬禁用：Host 不注册 ISourceServerManagementService，renderer 侧的 accessor
// 却是惰性代理（恒为 truthy）。注册表在构造时就 onDidChangeState + getSnapshot，必须在拿到
// registry 之前用编译期常量关断，否则每次挂载都等满 ChannelServer 超时并打 Unknown channel。
function useSourceServerStatusRegistry() {
  const management = useBaseWorkspaceServices().sourceServerManagementService;
  return useMemo(
    () =>
      REMOTE_WORKSPACE_DISABLED || !management ? null : getSourceServerStatusRegistry(management),
    [management],
  );
}

export function useSourceServerStatuses() {
  const registry = useSourceServerStatusRegistry();
  return useSyncExternalStore(
    registry?.subscribe ?? subscribeToNothing,
    registry?.getSnapshot ?? getEmptyStatuses,
    registry?.getSnapshot ?? getEmptyStatuses,
  );
}

const emptyInputs: ReadonlyMap<
  string,
  import("@/lib/remoteConnectionPresentation.js").RemoteConnectionPresentationInput
> = new Map();
const getEmptyInputs = () => emptyInputs;

export function useRemoteDevicePresentationInput(sourceServerId?: string) {
  const registry = useSourceServerStatusRegistry();
  const inputs = useSyncExternalStore(
    registry?.subscribe ?? subscribeToNothing,
    registry?.getInputs ?? getEmptyInputs,
    registry?.getInputs ?? getEmptyInputs,
  );
  return sourceServerId ? inputs.get(sourceServerId) : undefined;
}
