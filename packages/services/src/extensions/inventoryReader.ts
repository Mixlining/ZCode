import {
  resolvePluginManifest,
  type ExtensionStaticTable,
  type ExtensionDeclaration,
  type StaticPlugin,
} from "@zcode/shared/extension-host";
import type { IPluginManagementService } from "#src/plugins/pluginManagement.js";
import type { ServiceLogger } from "#src/logger/serviceLogger.js";
import type { GrantsStore } from "#src/extensions/grantsStore.js";
import { readPluginManifest } from "#src/extensions/manifestReader.js";

type ResolvedPlugins = Array<{ entry: StaticPlugin; declaration: ExtensionDeclaration | null }>;

/** 清单 IO 与授权重算仅由 Window Host 串行调用；这里不持表、修订号或第二份缓存。 */
export function createExtensionInventoryReader(deps: {
  pluginManagement: Pick<IPluginManagementService, "listPlugins">;
  inventoryWorkspacePath: string;
  grants: GrantsStore;
  abortPlugin(pluginId: string): void;
  isDisposed(): boolean;
  logger: Pick<ServiceLogger, "info" | "warn">;
}) {
  /**
   * 从插件商店安装后、激活前的确认（§17.7，P3b）：安装的成功信号没有插件 id，所以按静态表判断。
   * 新出现、扩展合法且有 main 的插件，在已有别的插件持有生效会话权限时先不激活，记为 pending。
   */
  const holdNewlyInstalled = async (
    resolved: ResolvedPlugins,
    previousIds: ReadonlySet<string>,
  ) => {
    for (const { entry } of resolved) {
      const extension = entry.extension;
      if (previousIds.has(entry.pluginId) || extension?.state !== "ok" || !extension.main) continue;
      if (deps.grants.activationHold(entry.pluginId)) continue;
      const holders = deps.grants.holders(entry.pluginId);
      if (holders.length === 0) continue;
      try {
        await deps.grants.holdActivation(entry.pluginId, entry.version);
        deps.logger.info(
          undefined,
          `extension activation held plugin=${entry.pluginId} holders=${holders.length} (installed while other extensions hold session grants)`,
        );
      } catch (error) {
        deps.logger.warn(undefined, `hold extension activation failed plugin=${entry.pluginId}`, {
          code: (error as { code?: unknown } | null)?.code,
        });
      }
    }
  };

  /** 读插件清单与每个插件的 plugin.json，整份替换静态表与扩展声明（§16.1）。 */
  return async (
    table: ExtensionStaticTable,
    options: { installed?: boolean } = {},
  ): Promise<ResolvedPlugins | undefined> => {
    // 授权记录读完再算静态表：之后推的扩展声明让扩展激活，激活时的会话调用要看到已有的授权。
    await deps.grants.ready;
    const result = await deps.pluginManagement.listPlugins({
      workspacePath: deps.inventoryWorkspacePath,
      configScope: "user",
    });
    // 扩展只认用户级启用（§13）：工作区级启用不激活扩展代码；未物化的插件包没有可读的清单。
    const plugins = result.plugins.filter(
      (plugin) =>
        plugin.enabled &&
        plugin.enabledSource !== "workspace" &&
        plugin.packageStatus !== "missing",
    );
    const resolved = await Promise.all(
      plugins.map(async (plugin) =>
        resolvePluginManifest(
          {
            pluginId: plugin.id,
            name: plugin.name,
            ...(plugin.version ? { version: plugin.version } : {}),
            rootPath: plugin.rootPath,
            ...(plugin.dataPath ? { dataPath: plugin.dataPath } : {}),
          },
          await readPluginManifest(plugin.rootPath),
        ),
      ),
    );
    if (deps.isDisposed()) return;
    const previousIds = new Set(table.plugins.map((plugin) => plugin.pluginId));
    // 按新清单重算授权（插件更新：不变多不询问、变多待授权、变少收窄）；生效档位变少的插件中止在途调用。
    for (const pluginId of deps.grants.reconcile({
      rev: table.rev,
      plugins: resolved.map(({ entry }) => entry),
    }))
      deps.abortPlugin(pluginId);
    if (options.installed) await holdNewlyInstalled(resolved, previousIds);
    if (deps.isDisposed()) return;
    // 清单问题按插件记一次（重读只在插件清单变化与重新加载时发生，频率低）。
    for (const { entry } of resolved) {
      const extension = entry.extension;
      if (extension && extension.state !== "ok") {
        deps.logger.warn(
          undefined,
          `extension ${extension.state} ${entry.pluginId}: ${extension.reason}${extension.state === "invalid" ? ` (${extension.path})` : ""}`,
        );
      }
      for (const problem of entry.problems) {
        deps.logger.warn(
          undefined,
          `manifest item unusable ${entry.pluginId} ${problem.path}: ${problem.reason}`,
        );
      }
      for (const ignored of entry.ignored) {
        deps.logger.info(
          undefined,
          `manifest ignored ${entry.pluginId} ${ignored.path}: ${ignored.reason}`,
        );
      }
    }
    return resolved;
  };
}
