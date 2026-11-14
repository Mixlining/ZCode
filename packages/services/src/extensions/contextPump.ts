import { Emitter, type Event, type IDisposable } from "@zcode/rpc";
import type { ContextComposition } from "@zcode/shared/zcode-protocol-v4";
import type { IZCodeAgentService } from "#src/zcode-agent/zcodeAgent.js";
import type { ServiceLogger } from "#src/logger/serviceLogger.js";
import {
  createWorkspaceSubscriptions,
  type WorkbenchState,
} from "#src/extensions/workbenchState.js";

// context 组成数据泵（docs/plugins/extension-host.md §9）：CLI 是唯一 owner，这里只转发变更通知
// （只带修订号）并按需查询。查询时模型只有一个来源：草稿带 Renderer 报告的所选模型，正式会话不带。

export interface ContextChange {
  sessionId: string;
  revision: number;
}

export interface ContextPump {
  get(sessionId: string): Promise<ContextComposition | null>;
  readonly onDidChange: Event<ContextChange>;
  dispose(): void;
}

export function createContextPump(deps: {
  agent: Pick<IZCodeAgentService, "getContextComposition" | "onDynamicContextCompositionChanged">;
  workbench: WorkbenchState;
  logger: Pick<ServiceLogger, "debug" | "info">;
}): ContextPump {
  /** 每会话最近一次见到的 CLI 修订号：补发草稿换模型通知时沿用它，不自造修订号。 */
  const revisions = new Map<string, number>();
  const noteRevision = (sessionId: string, revision: number) => {
    if (!reportSubscription) return;
    if (revision > (revisions.get(sessionId) ?? -1)) revisions.set(sessionId, revision);
  };
  let reportSubscription: IDisposable | undefined;
  const subscriptions = createWorkspaceSubscriptions(
    (workspace) => deps.agent.onDynamicContextCompositionChanged?.(workspace),
    (_workspace, event) => {
      noteRevision(event.sessionId, event.revision);
      changes.fire({ sessionId: event.sessionId, revision: event.revision });
    },
    (workspaceKey) => deps.logger.info(undefined, `context pump subscribed ${workspaceKey}`),
  );
  const changes = new Emitter<ContextChange>({
    // 没有扩展订阅时不订阅 CLI 通知。
    onWillAddFirstListener: () => {
      // 没有消费者时不维护草稿模型缓存；首次订阅从唯一报告 owner 取当前值。
      for (const session of deps.workbench.sessions()) {
        const draft = deps.workbench.find(session.sessionId);
        if (draft?.isDraft && draft.draftModel)
          draftModels.set(draft.sessionId, JSON.stringify(draft.draftModel));
      }
      reportSubscription = deps.workbench.onDidChangeReport(handleReport);
      subscriptions.sync(deps.workbench.workspaces());
      deps.logger.info(undefined, `context pump started workspaces=${subscriptions.size()}`);
    },
    onDidRemoveLastListener: () => {
      reportSubscription?.dispose();
      reportSubscription = undefined;
      subscriptions.disposeAll();
      revisions.clear();
      draftModels.clear();
      deps.logger.info(undefined, "context pump stopped");
    },
  });
  // 草稿的所选模型只在 Renderer：它变了 CLI 不会发通知，由这里补一条，让扩展重新拉取预演。
  // 工作区订阅只增不减（见 createWorkspaceSubscriptions）。
  let draftModels = new Map<string, string>();
  const handleReport: Parameters<WorkbenchState["onDidChangeReport"]>[0] = (report) => {
    subscriptions.sync(deps.workbench.workspaces());
    const next = new Map<string, string>();
    for (const session of report.sessions) {
      if (session.isDraft && session.draftModel) {
        next.set(session.sessionId, JSON.stringify(session.draftModel));
      }
    }
    const previous = draftModels;
    draftModels = next;
    for (const [sessionId, model] of next) {
      const before = previous.get(sessionId);
      if (before === undefined || before === model) continue;
      deps.logger.info(undefined, `context changed by draft model sessionId=${sessionId}`);
      changes.fire({ sessionId, revision: revisions.get(sessionId) ?? 0 });
    }
  };

  return {
    async get(sessionId) {
      const session = deps.workbench.find(sessionId);
      // 会话不在 Renderer 报告里：Window Host 不知道它的工作区，也就没有可查的 CLI。
      if (!session || !deps.agent.getContextComposition) return null;
      const subscriberAtQuery = reportSubscription;
      const composition = await deps.agent.getContextComposition({
        workspacePath: session.workspace.workspacePath,
        ...(session.workspace.workspaceIdentity
          ? { workspaceIdentity: session.workspace.workspaceIdentity }
          : {}),
        sessionId,
        // 正式会话不带模型：CLI 用会话自己的模型（§9）。
        ...(session.isDraft && session.draftModel ? { modelSelection: session.draftModel } : {}),
      });
      // 查询跨过最后一次退订/重新订阅时，旧回包不能填充新消费者的修订缓存。
      if (composition && subscriberAtQuery && reportSubscription === subscriberAtQuery)
        noteRevision(sessionId, composition.revision);
      deps.logger.debug(
        undefined,
        `context.get sessionId=${sessionId} draft=${session.isDraft} phase=${composition?.phase ?? "null"}`,
      );
      return composition;
    },
    onDidChange: changes.event,
    dispose() {
      reportSubscription?.dispose();
      subscriptions.disposeAll();
      revisions.clear();
      draftModels.clear();
      changes.dispose();
    },
  };
}
