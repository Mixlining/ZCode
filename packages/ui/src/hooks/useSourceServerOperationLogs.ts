import { useEffect, useState } from "react";
import { sourceServerOperationLogSchema, type SourceServerOperationLog } from "@zcode/shared";
import { REMOTE_WORKSPACE_DISABLED } from "@zcode/shared";
import type { ISourceServerManagementService } from "@zcode/services";
import { logger } from "@/logger.js";

/** 事件只触发重读，关闭页面后仍从同一个 Host owner 查询；不在 UI 累积历史。 */
export function useSourceServerOperationLogs(
  management: ISourceServerManagementService | undefined,
  profileIds: readonly string[] = [],
) {
  const [logsByProfileId, setLogsByProfileId] = useState<
    Record<string, SourceServerOperationLog[]>
  >({});
  const profileKey = JSON.stringify([...new Set(profileIds)].sort());
  useEffect(() => {
    setLogsByProfileId({});
    // 远程 workspace 硬禁用：Host 不注册该 channel，惰性 accessor 恒 truthy，必须在调用点关断。
    if (REMOTE_WORKSPACE_DISABLED || !management?.getRecentOperationLogs) return;
    const ids: string[] = JSON.parse(profileKey);
    let disposed = false;
    let pending = false;
    let queued = false;
    const refresh = async () => {
      if (pending) {
        queued = true;
        return;
      }
      pending = true;
      try {
        const entries = await Promise.all(
          ids.map(async (id) => {
            const logs = await management.getRecentOperationLogs(id);
            return [id, logs.map((entry) => sourceServerOperationLogSchema.parse(entry))] as const;
          }),
        );
        if (!disposed) setLogsByProfileId(Object.fromEntries(entries));
      } catch (error) {
        if (!disposed) logger.warn("读取远程设备最近日志失败", error);
      } finally {
        pending = false;
        if (!disposed && queued) {
          queued = false;
          void refresh();
        }
      }
    };
    const subscription = management.onDidAppendOperationLog?.(() => {
      void refresh();
    });
    void refresh();
    return () => {
      disposed = true;
      subscription?.dispose();
    };
  }, [management, profileKey]);
  return { logsByProfileId };
}
