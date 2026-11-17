import recommendedPluginsConfig from "@/settings/recommendedPlugins.json" with { type: "json" };

// 客户端精选「推荐」区已下线；本文件与 recommendedPlugins.json 仅保留为历史兼容死配置。
// claude-plugins-official 现在是普通个人市场，不再参与默认市场、归属判断或置顶排序。
// 禁止重新从生产代码 import 本文件；策展名单如需恢复，git 历史里有完整实现。

/** 历史默认市场 id；生产代码不得再依赖。 */
export const DEFAULT_MARKETPLACE_ID = (recommendedPluginsConfig as { marketplace: string })
  .marketplace;
