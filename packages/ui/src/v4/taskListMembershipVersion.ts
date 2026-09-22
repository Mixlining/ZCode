// tasks-index 行/membership 权威版本号。
// sessions-index 只承载列表活性与 detail；task create/delete 以及 pin/archive/unread 等组织态
// 持久化在 tasks-index.sqlite，派生列表无法从 sessions 变化感知正向行或归属变化。
// mutation 提交后 bump 这里的版本号，让所有 task-row 左表 + session detail join 重新读取再过滤。
import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

/** task row 或 membership mutation 后调用：通知所有 sessions-index 派生列表重新拉取左表。 */
export function bumpTaskListMembershipVersion(): void {
  version += 1;
  for (const listener of [...listeners]) {
    listener();
  }
}

function subscribeTaskListMembershipVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getTaskListMembershipVersion(): number {
  return version;
}

// 同一条 workspace_task_list_changed 会经由多条订阅链路（useGlobalTaskList 的
// 共享订阅 fan-out + useWorkspaceTaskLists 的独立订阅，跨 RPC 反序列化后对象引用不同）
// 各 bump 一次，一次归属 mutation 会触发多轮全局 membership 重拉。这里按事件内容 key
// 在短窗口内去重：key 包含 meta 的时间字段（updatedAt/unreadAt），保证只有"同一事件的
// 重复投递"被合并；快速连续的真实 mutation（pin→unpin 等）reason/时间戳不同，不会被误吞。
//
// 不带 meta 的事件（bulk archive / group 操作）无法构造逐 task 的 key，但可以按
// workspace + reason 去重：bump 的语义是"立刻重验"而不是增量数据，合并 500ms 窗口内
// 同一 workspace 的重复信号不会丢失任何变更（重验读到的是当前状态）。旧实现对这些事件
// 无条件放行，于是同一批 bulk 事件会让每个 workspace 各触发一轮 membership 重拉
// （每次 1 + 4×scopes 个 RPC），这是任务列表侧最明显的 RPC 放大路径。
const BUMP_DEDUPE_WINDOW_MS = 500;
const BUMP_DEDUPE_MAX_KEYS = 256;
const recentBumpAtByKey = new Map<string, number>();

interface MembershipBumpEventLike {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId?: string;
  reason: string;
  taskMeta?: {
    updatedAt: number;
    unreadAt?: number;
  };
}

function shouldSkipRecentBump(dedupeKey: string, now: number): boolean {
  const lastBumpAt = recentBumpAtByKey.get(dedupeKey);
  if (lastBumpAt !== undefined && now - lastBumpAt < BUMP_DEDUPE_WINDOW_MS) {
    return true;
  }
  for (const [key, bumpedAt] of recentBumpAtByKey) {
    if (now - bumpedAt >= BUMP_DEDUPE_WINDOW_MS) {
      recentBumpAtByKey.delete(key);
    }
  }
  if (recentBumpAtByKey.size < BUMP_DEDUPE_MAX_KEYS) {
    recentBumpAtByKey.set(dedupeKey, now);
  }
  return false;
}

export function bumpTaskListMembershipVersionForWorkspaceEvent(
  event: MembershipBumpEventLike,
): void {
  const workspaceKey = event.workspaceIdentity?.trim() || event.workspacePath;
  if (!event.taskMeta || !event.taskId) {
    // bulk 事件按 workspace + reason 去重：同一 workspace 的重复投递合并成一次重验。
    const now = Date.now();
    if (shouldSkipRecentBump(`${workspaceKey}::${event.reason}::bulk`, now)) {
      return;
    }
    bumpTaskListMembershipVersion();
    return;
  }
  const dedupeKey = [
    workspaceKey,
    event.taskId,
    event.reason,
    event.taskMeta.updatedAt,
    event.taskMeta.unreadAt ?? "",
  ].join("::");
  if (shouldSkipRecentBump(dedupeKey, Date.now())) {
    return;
  }
  bumpTaskListMembershipVersion();
}

/** React 绑定：版本号变化触发重渲染（subscribe/get 是模块级函数，引用稳定）。 */
export function useTaskListMembershipVersion(): number {
  return useSyncExternalStore(subscribeTaskListMembershipVersion, getTaskListMembershipVersion);
}
