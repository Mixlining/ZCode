# v3.16.2 个人分支同步与适配

## 基线与合并规则

- dev 基线为 `279bf646`（含 Electron 44.7.2 / pnpm 11.27.1 工具链与 v3.16.1 全部禁用守卫），合入 main 的 `3c5b2276`（chore: sync ZCode source，版本 3.16.2）。使用真实 merge，不重写历史。
- 冲突消解按逐文件实际内容裁决，不整文件选 ours/theirs；守卫「常量 + 原逻辑并列」的原逻辑结构保持不动，上游 diff 落在原逻辑上。
- 根版本跟随上游 3.16.2；本次只 commit 不打 tag，发布制品版本仍由 `spec/desktop-release-tag-version.md` 的 tag 流程注入。
- 落地形态：一个 merge 提交 + 一个收尾提交（守卫恢复、动态工作流语义改造、测试清理与文档同步归入收尾提交）。
- 验证只执行静态六项（根 Typecheck、Desktop Main `tsc --noEmit`、Lint、Format、Architecture changed、`git diff --check`），不运行应用、单测、E2E 或制品构建。

## 上游变更面

`git diff 0a1fc56d..3c5b2276`：263 文件，+10548 / −4086。与本仓库产品边界相关的部分：

| 领域                | 上游改动                                                                                                                   | 与本仓库的关系                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 遥测                | 无。`git diff 0a1fc56d..3c5b2276 -G'ZCODE_TELEMETRY\|ARMS\|RUM\|telemetry'` 为空                                           | 全部守卫完好，无需新增                     |
| 动态工作流          | 灰度语义改为「服务端只给默认值、用户选择永远生效」，删除 `isDynamicWorkflowOffered`，新增 `readDynamicWorkflowOfferedMode` | 见「动态工作流：不读服务端、不读环境变量」 |
| 侧栏完整视图 / 浮窗 | 新增 `packages/ui/src/side-pane-full-view/*`、`ChatPromptEditor` 的 `layout: "inline"`                                     | 保留入口；桌面专属，用户主动打开才启用     |
| 4 分屏下线          | 删除 `workbenchPointerDragDrop.ts`、`workbenchPointerPositionTracker.ts`、分屏入口与性能 E2E                               | 接受删除                                   |
| 远程域              | `sourceServerProbe` 增加 glibc 校验、`zcodeAgentDevDeploy` 增加 bundled-skills 资产、`serviceManager` 改为等 `close`       | 全部落在 `REMOTE_WORKSPACE_DISABLED` 下游  |
| 手机远控            | 新增 `webRemoteControlHttpSignal`（请求级 15s 超时）                                                                       | 落在 `/remote` 路由 404 之后               |
| Web 登录            | pending 登录记录从 sessionStorage 迁到 localStorage                                                                        | 落在 `/remote`、`/share` 路由 404 之后     |
| 插件市场            | `describeMarketplacePlugin` 改为先读缓存 manifest                                                                          | claude 默认补种仍不在列表                  |
| 归档                | 默认保留天数 7 → 30                                                                                                        | 扫描间隔仍为 dev 的 1 小时                 |

## 已定产品决策

1. **动态工作流不读服务端、不读环境变量**：`REMOTE_ROLLOUT_DISABLED` 之外再加一层——provider 不再读取 `ZCODE_DYNAMIC_WORKFLOW_MODE`，shared 的 resolve 不再接受 `env`，Desktop main 不再注入该键，server 的远端透传键一并移除。快照的唯一来源是用户设置。
2. **动态工作流缺省 `onDemand`**：用户不配置时，`/workflow` 命令与技能入口可见，十个工作流工具等首次 `/workflow`、Resume 或 Configure 后才注册给模型（launch.md「On demand: activation」）。用户可在设置里改成 `disabled` 或 `alwaysOn`。
3. **独立 CLI 保持 `disabled`**：`apps/zcode-cli` 的 `--workflow-mode` 缺省不变，它不经过 Host，不受本次 shared 默认值影响。
4. **接受上游 4 分屏下线**：删除的模块、入口、性能 E2E 与 fixture 全部接受上游删除，不在 dev 恢复。
5. **侧栏完整视图保留入口**：不为该功能新增 dev 私有开关；其性能特征视为功能本身的一部分。
6. **远程守卫补齐**：`Root.handleOpenRemoteConnection` 恢复 `REMOTE_WORKSPACE_DISABLED` 早退（v3.16.1 合并时丢失，`a02a200f` 曾有）；`SettingsPage` 的 `useSourceServerManagementSnapshot` 传 `enabled`；`remoteWorkspaceController.openProject` 与 Main 的 `BindRemoteWorkspaceSessionContext` 补纵深防御。

## 行为与所有者

```text
用户设置 dynamicWorkflowMode ──┐
                              ├─▶ SettingService（唯一持久化）
                              │
Host zcodeAgentService.resolveDynamicWorkflowGate
  offer = provider.getDynamicWorkflowClientConfig()
     └─ REMOTE_ROLLOUT_DISABLED ──▶ resolve({remote: undefined})
            └─ 无 remote 合法值 ──▶ DEFAULT_DYNAMIC_WORKFLOW_MODE = onDemand
  mode  = applyDynamicWorkflowUserMode(offer, 用户设置)   ← 用户选择永远生效
     ├─▶ workspace/updateDynamicWorkflowPolicy(enabled, mode)
     └─▶ session create/resume 的 dynamicWorkflowEnabled/Mode

Root.handleOpenRemoteConnection ──REMOTE_WORKSPACE_DISABLED──▶ 直接 return，不挂载 SSH/WSL/Docker 探测
SettingsPage.useSourceServerManagementSnapshot ──enabled:false──▶ 不发 getSnapshot，不等 1s 超时
```

- 状态所有者：产品开关仍全部在 `packages/shared/src/env.ts`；动态工作流的缺省值唯一在 `packages/shared/src/dynamic-workflow-feature.ts` 的 `DEFAULT_DYNAMIC_WORKFLOW_MODE`；用户选择的唯一持久化仍是 `SettingService`。
- 环境变量 `ZCODE_DYNAMIC_WORKFLOW_MODE` 在本仓库内不再存在：shared 不再导出 `ZCODE_DYNAMIC_WORKFLOW_MODE_ENV`，services 不读、main 不写、server 不转发。上游若重新引入该键，`git grep ZCODE_DYNAMIC_WORKFLOW_MODE -- packages apps ':!*test*'` 必须为空（测试里的负向断言与 docs 的历史注记允许存在）。

## 冲突裁决

| 文件                                                      | 裁决                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `architecture-policy.yaml`                                | 两侧条目都保留：dev 的 `host-service-resource-telemetry-guard-comment-edit`、`v3-16-1-upstream-source-server-and-packaging` + 上游的 `side-pane-full-view` 模块登记、`side-pane-full-view-shortcut-command-edit`、`workflow-mode-user-choice-unmanaged-edit` |
| `docs/dynamic-workflow/launch.md`、`concurrency.md`       | 取上游全文                                                                                                                                                                                                                                                   |
| `docs/performance/runtime-communication-repro.md`         | 取上游（PERF02 已标注 2026-10-16 退役）                                                                                                                                                                                                                      |
| `docs/superpowers/specs/2026-09-11-archive-management.md` | 取上游（默认关闭 / 30 天，关闭时仍可保存时长）                                                                                                                                                                                                               |
| `docs/testing/workspace-file-tree-e2e-coverage.md`        | 取上游                                                                                                                                                                                                                                                       |
| `packages/ui/src/prompt-editor/ChatPromptEditor.tsx`      | 取上游（新增 `layout` 与 `iconOnly`），dev 的缩进修正已被上游同款格式覆盖                                                                                                                                                                                    |
| `packages/zcode-server-cli/src/runtime/stableLauncher.ts` | 取上游 `cd -P -- … && pwd -P`（符号链接 HOME 下 release 越界误判），保留 dev 的引号风格                                                                                                                                                                      |

modify/delete 冲突全部接受上游删除：

- `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-runtime-communication-performance.test.ts`
- `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-runtime-communication-performance.json`
- `packages/ui/test/workbenchPointerPositionTracker.test.ts`

删除依据：这些用例依赖已下线的 4 分屏入口与被删模块（`workbenchPointerPositionTracker.ts`、`workbenchPointerDragDrop.ts`、`openV4SplitFromSidebar`）。合并后 `TaskActionMenuContent.tsx`、`TaskListItem.tsx`、`grouped/useGroupedDrag.ts`、`WorkbenchPane.tsx`、`packages/desktop/test/e2e/helpers/v4-conversation.ts` 全部取上游版本，无悬空引用。

## 收尾提交改动清单

### 动态工作流

| 位置                                                                                       | 动作                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/dynamic-workflow-feature.ts`                                          | 删除 `ZCODE_DYNAMIC_WORKFLOW_MODE_ENV` 导出；`DEFAULT_DYNAMIC_WORKFLOW_MODE` 改为 `onDemand`；`resolveDynamicWorkflowClientConfig` 入参去掉 `env`；`resolveDynamicWorkflowOffer` 删除 override 分支；文件头与注释改写 |
| `packages/services/src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.ts` | 删除 env 覆盖短路分支与相关导入；`REMOTE_ROLLOUT_DISABLED` 分支改为 `resolveDynamicWorkflowClientConfig({ remote: undefined })`                                                                                       |
| `packages/desktop/src/main/desktopRuntimeEnv.ts`                                           | 删除 `resolveDynamicWorkflowModeHostEnv`、`buildHostProcessEnv` 中的调用与 spread、继承值删除行、相关导入与注释                                                                                                       |
| `packages/server/src/remote/connect.ts`                                                    | 从 `REMOTE_RUNTIME_ENV_KEYS` 移除 `ZCODE_DYNAMIC_WORKFLOW_MODE_ENV` 与导入                                                                                                                                            |
| `packages/shared/src/env.ts`                                                               | 更新 `REMOTE_ROLLOUT_DISABLED` 注释：动态工作流不读远端、不读环境变量，缺省 `onDemand`，用户可在设置中改档                                                                                                            |

保留 `remote` 入参：`REMOTE_ROLLOUT_DISABLED` 是编译期常量，remote 分支在 dev 不可达但保留原逻辑结构，降低后续同步成本，也让上游 DWG-01 的 remote 断言继续有效。

### 测试清理

| 文件                                                                       | 动作                                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/test/desktopRuntimeEnv.test.ts`                          | 删除 `describe("resolveDynamicWorkflowModeHostEnv")` 与两条引用 `ZCODE_DYNAMIC_WORKFLOW_MODE` 的 `buildHostProcessEnv` 用例 |
| `packages/shared/test/dynamicWorkflowFeature.test.ts`                      | 删除 env override 用例；调用去掉 `env`；缺省断言改为 `onDemand`                                                             |
| `packages/services/test/dynamicWorkflowClientConfig.test.ts`               | 删除 env override 用例；`REMOTE_ROLLOUT_DISABLED` 用例期望改为 `onDemand`                                                   |
| `packages/server/test/remoteConnect.test.ts`                               | 删除 `ZCODE_DYNAMIC_WORKFLOW_MODE` 透传断言，改为「不再透传」的负向断言                                                     |
| `packages/desktop/test/e2e/helpers/dynamic-workflow-config-mock-server.ts` | 删除导入与 `delete environment[ZCODE_DYNAMIC_WORKFLOW_MODE_ENV]`（该文件在 `tsconfig.e2e.json` 内）                         |
| `packages/desktop/wdio.conf.ts`                                            | 删除 `ZCODE_DYNAMIC_WORKFLOW_MODE=alwaysOn` 的进程级注入                                                                    |
| `.../manual-review/pending/conversation-session-r3-subagent.test.ts`       | 删除对该环境变量的前置断言                                                                                                  |

上游带入的格式漂移（`pnpm fmt`）：`packages/zcode-server-cli/test/releaseInstaller.test.ts`、`packages/ui/src/project-sidebar/ProjectDirectoryProvider.tsx`、`packages/desktop/src/main/unreadBadge.ts`、`packages/desktop/test/desktopTrayBadge.test.ts` 及若干 `docs/*.md`。

### 远程守卫

| 位置                                                         | 动作                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/ui/src/Root.tsx`                                   | `handleOpenRemoteConnection` 首行补 `if (REMOTE_WORKSPACE_DISABLED) return;`                                             |
| `packages/ui/src/SettingsPage.tsx`                           | `useSourceServerManagementSnapshot(..., { enabled: !REMOTE_WORKSPACE_DISABLED })`                                        |
| `packages/ui/src/hooks/useSourceServerManagementSnapshot.ts` | 新增 `enabled` 选项（默认 true），保持纯逻辑；守卫由调用点传参                                                           |
| `packages/ui/src/hooks/useSourceServerStatuses.ts`           | `useSourceServerStatuses` / `useRemoteDevicePresentationInput` 共用 `useSourceServerStatusRegistry`，registry 构造前关断 |
| `packages/ui/src/hooks/useSourceServerDisplayNames.ts`       | 注册表构造前关断（`getSnapshot` + `onDidChangeState` 都在构造函数里）                                                    |
| `packages/ui/src/hooks/useSourceServerOperationLogs.ts`      | 新增 `options.enabled`（默认 true），三个调用点显式传 `!REMOTE_WORKSPACE_DISABLED`                                       |
| `packages/ui/src/root/useRemoteWorkspaceHistory.ts`          | `remoteWorkspaceController.openProject` 首行补早退                                                                       |
| `packages/desktop/src/main/desktopMainIpcRemote.ts`          | `BindRemoteWorkspaceSessionContext` handler 首行补早退                                                                   |

后六处是 v3.16.1 起就存在的存量缺口（`SourceServerManagement` 相关通道在 renderer 侧是无守卫的惰性代理），
本次按「不需要 remote workspace、不挂载 WSL/Docker」的产品边界统一收口。

**守卫不放进被单测直接驱动的 hook 主体**：`useSourceServerManagementSnapshot` 与
`useSourceServerOperationLogs` 改为新增 `enabled` 选项、由调用点传编译期常量。把常量写进 hook 主体会让
`useSourceServerManagementSnapshot.test.ts` / `projectCreation.test.ts` / `sourceServerManagementPanel.test.ts`
无法再驱动 `getSnapshot` 与事件订阅（实测 64 个用例失败），违反「守卫写在原逻辑并列位置、不改变可测性」的既有惯例。
`useSourceServerStatuses` / `useSourceServerDisplayNames` 的守卫可以留在 hook 内：它们的注册表副作用只发生在
构造时，且现有测试全部 mock 了这两个 hook。

## 静态消融记录

- 不删除 `DynamicWorkflowClientConfigSource` 的 `"override"` 取值：它是既有类型域的一部分，删除会波及上游 `resolveDynamicWorkflowOffer` 的结构；该值在本仓库内不再产生。
- 不为「不读环境变量」新增第二套常量或运行时检查：只删读取点与写入点，`git grep ZCODE_DYNAMIC_WORKFLOW_MODE -- packages apps ':!*test*'` 为空即为完整证据。
- `resolveDynamicWorkflowClientConfig` 保留 `remote` 入参而不改成只收 `userMode`：避免重写上游 DWG-01 的 remote 断言，降低后续每次同步的人工成本。
- 远程守卫集中在共享 hook 内：`useSourceServerManagementSnapshot` / `useSourceServerStatuses` / `useSourceServerDisplayNames` / `useSourceServerOperationLogs` 各一处早退，覆盖全部消费方；不给 `SettingsPage`、`ProjectCreation`、`remote-connection-flow` 等上游调用点逐个加参数。`Root`、controller、IPC 三处保留为入口级单行早退。
- `useSourceServerStatuses` 与 `useRemoteDevicePresentationInput` 抽出一个共享的 `useSourceServerStatusRegistry`：两者本来就共用同一份 `sourceServerStatusRegistry`，拆成两处守卫会重复同一决策。

## 上游同步复核（merge 后逐条执行）

1. `git diff 0a1fc56d..HEAD -G'ZCODE_TELEMETRY|ARMS|RUM|telemetry'` 新增命中项全部位于守卫内（本轮预期为空）。
2. 十个编译期常量值未回退：`ZCODE_TELEMETRY_ENABLED`、`ZCODE_VENDOR_ACTIONS_DISABLED`、`CODING_PLAN_DISABLED`、`REMOTE_ROLLOUT_DISABLED`、`MARKETPLACE_AUTO_REFRESH_DISABLED`、`MEMORY_DIAGNOSTICS_ENABLED`、`BOTS_DISABLED`、`PHONE_REMOTE_DISABLED`、`REMOTE_WORKSPACE_DISABLED`、`ZCODE_AUTO_UPDATE_ENABLED`。
3. `git grep ZCODE_DYNAMIC_WORKFLOW_MODE -- packages apps ':!*test*'` 为空。
4. 无为禁用域新增的常驻子进程、定时器、长轮询、重连或采样器。
5. `off_peak_tasks` 的表/列/索引/已发布迁移与校验值保持字节不变（上游 `0007_initial_workspace_order` 只 `ALTER remote_project_entries`）。
6. `attachRemoteWorkspaceSessionHost` 仍无调用方。
7. `DEFAULT_PLUGIN_MARKETPLACES` 仍只含 `zcode` 官方市场，claude 未被补种。

## 人工验收（本轮不执行）

1. 冷启动进入设置「常规」，交互行为卡片内的工作流设置行出现，「默认」标签落在「通过命令启用」上。
2. 会话输入 `/` 的命令目录包含 `/workflow`；首次 `/workflow` 后模型才拿到十个工作流工具。
3. 在系统层预设 `ZCODE_DYNAMIC_WORKFLOW_MODE=alwaysOn` 后冷启动，默认档位仍是「通过命令启用」（环境变量不生效）。
4. 点击侧栏/工作区菜单的远程连接入口无反应，不弹连接弹窗，任务管理器无 `wsl.exe` / `docker` 探测进程。
5. 设置页「远程设备」分区不在导航（`HIDDEN_SETTINGS_SECTIONS`）；`SettingsPage` 的 Source 快照因 `enabled: false` 不发起 `getSnapshot`，Host 日志无该 channel 的 `Unknown channel` 与 1s 超时噪声。
6. 侧栏完整视图/浮窗可正常打开与关闭。
7. 打包产物冷启动无 ARMS 初始化、无遥测请求。
