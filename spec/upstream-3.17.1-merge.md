# v3.17.1 个人分支同步与适配

## 基线与合并规则

- dev 基线为 `20a3d46f`（含 Electron 44.7.2 / pnpm 11.27.1 工具链与 v3.16.2 全部禁用守卫），合入 main 的 `a60ba6a7`（chore: sync ZCode source，版本 3.17.1）。
- 使用真实 merge，不重写历史；冲突逐文件按实际内容裁决，不整文件选 ours/theirs。
- 守卫形态保持「编译期常量 + 上游原逻辑并列」：不重排原逻辑，不新增第二套「禁用版实现」。
- 落地形态：一个 merge 提交（纯冲突解决）+ 独立收尾提交（守卫恢复、测试短路、spec 同步、lockfile 与格式）。
- 根版本跟随上游 3.17.1；本次只 commit，不打 tag、不 push。制品版本仍由 `spec/desktop-release-tag-version.md` 的 tag 流程注入。
- 验证：根 Typecheck、Desktop Main `tsc --noEmit`、Lint、Format、Architecture changed、`git diff --check`，并按本次决策实际运行上游工程测试链路（`pnpm test:engineering` 等）。不运行应用、E2E 与制品构建。

## 上游变更面

`git diff 3c5b2276..a60ba6a7`：5,231 文件，+216,419 / −611,371；上游删除约 2,278 个测试文件，并把 App 单测执行链整体退役。

`git merge-tree --write-tree dev a60ba6a7` 预演：412 个冲突（161 内容冲突 + 251 modify/delete）。

| 冲突类别                               | 数量 | 备注                                                                                                    |
| -------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------- |
| 上游删除、dev 修改                     |  249 | 246 个测试/E2E/夹具；3 个 `Remote{Mcp,Plugin,Skill}SyncDialog.tsx`                                      |
| dev 删除、上游修改                     |    2 | `appARMSBootstrap.ts`、`.vscode/settings.json`，保持删除                                                |
| 内容冲突：`docs/`                      |   39 | 测试覆盖矩阵与测试文档取上游                                                                            |
| 内容冲突：Desktop E2E/夹具             |   69 | 取上游                                                                                                  |
| 内容冲突：Desktop 源码                 |   10 | 手工裁决并回填守卫                                                                                      |
| 内容冲突：UI / CLI / services / shared |   32 | 手工裁决并回填守卫                                                                                      |
| 内容冲突：根清单与治理文件             |    6 | `package.json`、`architecture-policy.yaml`、`pnpm-lock.yaml`、`.husky/pre-push`、`AGENTS.md`、`.agents` |
| 内容冲突：第三方/许可证                |    3 | `NOTICE.md`、`THIRD-PARTY-NOTICES.md`、`third-party/*` 取上游                                           |

与本仓库产品边界相关的新增出网/常驻链路（v3.16.2 时不存在）：

| 领域         | 上游新增                                                                                                                                   | 与本仓库的关系                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 设备标识     | `createServerHostServices` 新增 `ensureTelemetryDeviceMid()`；`packages/server/src/stdioDeviceMid.ts` 新增独立 Server stdio 入口的同样调用 | `ZCODE_TELEMETRY_ENABLED=false` 下不生成、不写、不带头                           |
| 会话遥测     | 手机来源会话遥测：`RemoteConversationTelemetry` 通道、`remoteConversationTelemetry` capability、Host 订阅、Main dispatcher                 | `ZCODE_TELEMETRY_ENABLED=false` 下不构造 collector、不建 dispatcher、不派发      |
| 手机推送     | `MobilePushConnection` 启动即 `setInterval(60s)` 轮询 `/api/v1/remote/notification/*`；Host 观察器派生 `mobile-push:*`                     | `PHONE_REMOTE_DISABLED=true` 下不调用 `startNotifications()`、不派生、不注入回调 |
| 手机日志     | `PullMobileLogs` 命令、移动端日志分片拉取与 `logs/mobile` 落盘                                                                             | `PHONE_REMOTE_DISABLED=true` 下命令入口直接返回                                  |
| Data Sync    | `IUserConfigSyncService`、`IDeviceSyncStateService`、Data Sync 页面与协议通道                                                              | `DATA_SYNC_DISABLED=true` 下不注册、不进入                                       |
| ZCode Sites  | 官方内置插件 `zcode-site`、`official-command-endpoint` 本地代理（`/api/v1/sites`）、已安装/已启用记录                                      | `ZCODE_SITES_DISABLED=true` 下发现层过滤、插件入口早退、不建代理                 |
| ui_mode 遥测 | `ui_mode` 维度、`SyncTelemetryContext` 平台通道、preload/Main handler、Root 订阅                                                           | `ZCODE_TELEMETRY_ENABLED=false` 下不构造、不发 IPC                               |
| 本地 TTFT    | 渲染层 `local-ttft/initialize.ts` 默认开启；CLI 新增 `zcode-protocol-v4/local-ttft/recorder.ts`                                            | `ZCODE_TELEMETRY_ENABLED=false` 下保持早退                                       |

## 已定产品决策

1. **只保留纯本地能力**：Open with 系统应用选择、项目数据测量/清理、本地 server stop/restart、CLI 运行时改进放行。Data Sync、ZCode Sites、手机推送、手机日志拉取全部硬禁用，代码保留供上游同步。
2. **设备标识源头跳过**：`ZCODE_TELEMETRY_ENABLED=false` 时不调用 `ensureTelemetryDeviceMid()`，不生成/写 `telemetry-state.json`，不注入 `X-Device-Mid`；独立 Server 的 stdio 入口同样跳过。
3. **会话遥测三层关断**：server capability 恒 false、Host 不订阅、Main 不派发；保留通道与类型定义，避免每次同步产生结构冲突。
4. **手机推送/日志拉取归入手机远控域**：复用 `PHONE_REMOTE_DISABLED`，不新增第二套手机开关。
5. **Data Sync 与 ZCode Sites 各用一个永久常量**：`DATA_SYNC_DISABLED=true`、`ZCODE_SITES_DISABLED=true`。两者不属于既有远程 workspace 或手机远控域，复用常量会让产品语义失真。
6. **测试链路取上游**：`vitest.config.ts`、`.husky/pre-push`、`verify:pre-push` 与相关脚本取上游；上游删除的 App 单测同步删除。因硬禁用而失败的工程测试只做最小短路（`describe.skipIf` / 顶层早退），不重写测试语义。
7. **测试覆盖矩阵取上游**：`docs/testing/*coverage*matrix*.md` 冲突取上游；dev 的硬禁用说明只保留在 `spec/vendor-disable.md` 与 `spec/remote-disable.md`。
8. **工具链 pin 不回退**：Electron 44.7.2、electron-builder ^26.17.0、electron-updater ^6.8.10、@electron/rebuild ^4.2.1、pnpm 11.27.1、Node ≥24.21.0 保留；只吸收上游新增依赖与 overrides，`pnpm-lock.yaml` 用固定 pnpm 重新生成。

## 新链路的守卫落点

所有判定使用 `packages/shared/src/env.ts` 的编译期常量，不读取运行时环境变量，不以超时兜底。

| 链路         | 不构造（源头）                                                                                                                                                                                                                 | 不注册 / 不订阅                                                                                                                     | 不进入 / 纵深防御                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 设备标识     | `packages/services/src/node.ts` `createServerHostServices` 内 `ensureTelemetryDeviceMid` 调用包进 `ZCODE_TELEMETRY_ENABLED`                                                                                                    | —                                                                                                                                   | `packages/server/src/stdioDeviceMid.ts` 在 `ZCODE_TELEMETRY_ENABLED=false` 时直接返回 `undefined` |
| 会话遥测     | `zcodeAgentService.ts` 不创建 emitter（listener Set）、不装配远端 collector Map，事实只在本地 emitter 分流；`main/index.ts` 不创建 dispatcher                                                                                  | `hostServiceResourceTelemetry.ts` 不订阅；`host/index.ts` capability 表达式同时带常量                                               | `desktopHostProcess.ts` 丢弃 `RemoteConversationTelemetry`                                        |
| 手机推送     | `main/index.ts` 不调用 `startNotifications()`，不接推送回调；Host 观察器不维护 `notificationRuns`、不派生事件、snapshot 不收集 running 集合                                                                                    | 不注册 `powerMonitor.on("resume")` 推送刷新；`will-quit` 不挂推送 dispose；`host/index.ts` 不注入 `onRunStarted` / `onNotification` | `webRemoteControlManager` 在 `PHONE_REMOTE_DISABLED` 下仍不构造（既有守卫）                       |
| 手机日志     | `main/index.ts` 不创建 `MobileLogSink`                                                                                                                                                                                         | 不注册 mobile-log 通道                                                                                                              | `desktopCommandHandlers.ts` 的 `PullMobileLogs` 入口直接返回                                      |
| Data Sync    | `services/src/node.ts` 不注册 `IUserConfigSyncService`；`host/index.ts` 不注册 `IDeviceSyncStateService`                                                                                                                       | `remoteWorkspaceServiceCollection.ts` 的注册保留在远程守卫内                                                                        | UI Data Sync 入口不挂载；跨进程调用点在调用前用常量判断                                           |
| ZCode Sites  | `official-plugin-definitions.ts` 不产出定义；`adapters/src/plugins/index.ts` 按 id + manifest 名过滤所有来源；`bootstrap/zcode-protocol/plugins.ts` 不把旧配置投影成 missing；Host 的 commands/skills 扫描同样按 id + 名称跳过 | `zcode-protocol-entrypoint.ts` 不创建 `officialCommandEndpoint`；插件 `main()` 直接返回                                             | UI Sites 面板入口不挂载；通用插件面板因发现层缺失无法解析 surface                                 |
| ui_mode 遥测 | `packages/ui/src/lib/appTelemetry.ts` 的 `useInterfaceModeTelemetry` 在遥测关闭时直接返回                                                                                                                                      | preload 不安装 `syncTelemetryContext` 桥                                                                                            | `desktopMainIpcRemote.ts` 的 handler 直接丢弃                                                     |
| 本地 TTFT    | 渲染层 `local-ttft/initialize.ts` 在遥测关闭时返回空清理函数，不起 1s 定时器                                                                                                                                                   | CLI `local-ttft/recorder.ts` 不安装采样                                                                                             | OTLP exporter 继续由 `OTLP_DIAGNOSTIC_EXPORT_DISABLED` 关断                                       |

## 冲突裁决

| 文件 / 类别                                                              | 裁决                                                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/env.ts`                                             | 上游本次未改；保留 dev 的十个策略常量并新增 `DATA_SYNC_DISABLED`、`ZCODE_SITES_DISABLED`                                                |
| `packages/desktop/src/main/appARMSBootstrap.ts`、`.vscode/settings.json` | 保持 dev 删除（ARMS 白名单 / 仓库无关编辑器配置）                                                                                       |
| 上游删除的 246 个测试/E2E/夹具                                           | 接受删除                                                                                                                                |
| `Remote{Mcp,Plugin,Skill}SyncDialog.tsx`                                 | 接受上游删除；新 Data Sync 入口由 `DATA_SYNC_DISABLED` 关断                                                                             |
| `docs/testing/*`、`docs/superpowers/*`、其它 `docs/` 冲突                | 取上游；`spec/*` 保持 dev                                                                                                               |
| `AGENTS.md`                                                              | 两侧保留：上游新增条款 + dev 硬禁用规则；验证章节改为「静态检查 + 工程测试」                                                            |
| 根 `package.json`                                                        | 取上游脚本全集；保留 dev 仍被引用的脚本；版本改 3.17.1；`pnpm` 字段迁入 `pnpm-workspace.yaml`（pnpm 11 不再读取 package.json 的该字段） |
| `packages/desktop/package.json`、`pnpm-workspace.yaml`、`mise.toml`      | 保留 dev 工具链 pin；吸收上游新增依赖，不改 workspace 配置                                                                              |
| `architecture-policy.yaml`                                               | 取上游 150 条 + 回填 dev 的 5 条独有条目与守卫例外；重新生成 `scripts/architecture/upstream-snapshot.json`                              |
| `.husky/pre-push`                                                        | 取上游（捕获 push stdin）                                                                                                               |
| `packages/desktop/scripts/r3-remote-spec-inventory.mjs`                  | 取上游（dev 未改；无 `harness/remote` 时检查跳过）                                                                                      |
| `pnpm-lock.yaml`                                                         | 不接受任一侧，删除后用 pnpm 11.27.1 重新生成                                                                                            |
| `third-party/*`、`NOTICE.md`、`THIRD-PARTY-NOTICES.md`                   | 取上游                                                                                                                                  |
| Desktop E2E / fixtures 冲突                                              | 取上游                                                                                                                                  |

## 收尾提交改动清单

### 新增常量

`packages/shared/src/env.ts` 增加：

```ts
// 硬禁用：Data Sync 把 skills/MCP/插件/子代理等配置同步到远端设备；本构建只做本机单机形态。
export const DATA_SYNC_DISABLED = true;
// 硬禁用：ZCode Sites 是官方内置插件，命令经 official-command-endpoint 代理访问 /api/v1/sites。
export const ZCODE_SITES_DISABLED = true;
```

`packages/shared/src/index.ts` 同步导出。

### 守卫恢复

| 位置                                                                             | 动作                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/services/src/node.ts`                                                  | `createServerHostServices` 的 `ensureTelemetryDeviceMid()` 包进 `ZCODE_TELEMETRY_ENABLED`；`createLocalServices` 的 `IUserConfigSyncService` 注册包进 `DATA_SYNC_DISABLED`                                                                                                                   |
| `packages/server/src/stdioDeviceMid.ts`                                          | `ZCODE_TELEMETRY_ENABLED=false` 时直接返回 `undefined`                                                                                                                                                                                                                                       |
| `packages/services/src/zcode-agent/zcodeAgentService.ts`                         | 远端会话遥测 emitter 不在禁用时构造                                                                                                                                                                                                                                                          |
| `packages/desktop/src/host/hostServiceResourceTelemetry.ts`                      | 顶部 `if (!ZCODE_TELEMETRY_ENABLED) return`，不订阅远端会话遥测                                                                                                                                                                                                                              |
| `packages/desktop/src/host/index.ts`                                             | capability 表达式追加 `ZCODE_TELEMETRY_ENABLED`；`IDeviceSyncStateService` 注册包进 `DATA_SYNC_DISABLED`；远程服务集合与 provisioning lane 保持在 `REMOTE_WORKSPACE_DISABLED` 内                                                                                                             |
| `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`                  | `IUserConfigSyncService` / `IBotsService` 注册保持在禁用守卫内                                                                                                                                                                                                                               |
| `packages/desktop/src/main/desktopHostProcess.ts`                                | 丢弃 `HostResponseTypes.RemoteConversationTelemetry`                                                                                                                                                                                                                                         |
| `packages/desktop/src/main/index.ts`                                             | 不创建远端遥测 dispatcher、不接线；`attachRemoteWorkspaceSessionHost` 不注入附件桥；`startNotifications()`、`onMobilePushRun`、`onMobilePushEvent`、`powerMonitor` 推送刷新与 `will-quit` dispose 包进 `PHONE_REMOTE_DISABLED`；`MobileLogSink` 不创建；`webRemoteControlManager` 保持不构造 |
| `packages/desktop/src/host/windowHostSessionsIndexObserver.ts`                   | 在 `PHONE_REMOTE_DISABLED` 下不分配 `notificationRuns`，不计算 workspace SHA-256、不派生 `mobile-push:*`、不写推送日志；sessions-index 观察器继续服务本地任务列表                                                                                                                            |
| `packages/desktop/src/host/index.ts`                                             | `onRunStarted` / `onNotification` 在 `PHONE_REMOTE_DISABLED` 下不注入                                                                                                                                                                                                                        |
| `packages/desktop/src/main/desktopCommandHandlers.ts`                            | `PullMobileLogs` 入口在 `PHONE_REMOTE_DISABLED` 下返回中性值                                                                                                                                                                                                                                 |
| `packages/desktop/src/main/desktopMainIpcRemote.ts`                              | `SyncTelemetryContext` handler 在 `ZCODE_TELEMETRY_ENABLED=false` 下直接丢弃；远程探测 IPC 保持中性                                                                                                                                                                                          |
| `packages/desktop/src/preload/index.ts`                                          | 遥测关闭时不安装 `syncTelemetryContext` 桥                                                                                                                                                                                                                                                   |
| `packages/ui/src/lib/appTelemetry.ts`                                            | `useInterfaceModeTelemetry` 顶部 `if (!ZCODE_TELEMETRY_ENABLED) return;`                                                                                                                                                                                                                     |
| `packages/desktop/src/renderer/src/local-ttft/initialize.ts`                     | 遥测关闭时返回空清理函数，不设 `observer.enabled`、不起 1s 定时器                                                                                                                                                                                                                            |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/local-ttft/recorder.ts` | 遥测关闭时不安装采样                                                                                                                                                                                                                                                                         |
| `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts`       | `ZCODE_SITES_DISABLED` 下不产出 `zcode-site` 定义                                                                                                                                                                                                                                            |
| `apps/zcode-cli/packages/adapters/src/plugins/index.ts`                          | 插件发现按 `ZCODE_SITE_PLUGIN_ID` 与 manifest 名过滤所有来源（official roots / cache / installed 记录）                                                                                                                                                                                      |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts`             | `ZCODE_SITES_DISABLED` 下不创建 official command endpoint                                                                                                                                                                                                                                    |
| `apps/zcode-cli/packages/zcode-site-plugin/src/server/main.ts`                   | `ZCODE_SITES_DISABLED` 下插件入口直接返回，不创建 HTTP API 与 stdio server                                                                                                                                                                                                                   |
| `packages/ui/src/app-shell/*`                                                    | Sites 内置面板入口在 `ZCODE_SITES_DISABLED` 下不挂载                                                                                                                                                                                                                                         |
| `packages/ui/src/data-sync/*` 与其入口                                           | Data Sync 页面与入口在 `DATA_SYNC_DISABLED` 下不挂载                                                                                                                                                                                                                                         |

### 既有守卫复核

- 合并后逐条核对 `spec/vendor-disable.md` 与 `spec/remote-disable.md` 的守卫清单，不只看上游 diff。
- 重点文件：`packages/desktop/src/main/desktopRuntimeEnv.ts`（`ZCODE_DYNAMIC_WORKFLOW_MODE` 只保留一处 `delete inheritedEnv` 删除语句）、`packages/ui/src/hooks/useSourceServer*.ts`（调用点传 `enabled`）、`packages/ui/src/Root.tsx`、`packages/ui/src/v4/SessionPane.tsx`、`packages/ui/src/v4/ConversationTurnGroup.tsx`、`packages/ui/src/highspeed/highspeedTurnStore.ts`、`packages/web/src/platform/index.ts`（`?remote=` 忽略逻辑的新位置）。
- 禁用域的服务未注册时，同进程消费方用 `getOptional`；跨进程调用点在调用前用常量守卫，避免 1s 超时与 `Unknown channel`。

## 静态消融记录

- Data Sync 与 Sites 各用独立常量，不复用 `REMOTE_WORKSPACE_DISABLED`：两者不是远程 workspace 的子能力，复用会让「远程 workspace 恢复」误等于「Data Sync 恢复」。
- 手机推送与日志拉取复用 `PHONE_REMOTE_DISABLED`，不新增开关：它们与手机远控共享同一 relay 与登录态，恢复语义必须一起成立。
- 会话遥测保留协议类型与通道定义，只在 capability、订阅、派发三层短路：删除类型会让上游每次同步产生结构冲突。
- 设备标识只跳过生成与调用，不删除 `telemetryCore` 的 device-mid 实现：上游仍在演进该函数，删除会让每次同步产生冲突。
- 测试短路优先 `describe.skipIf(常量)`，不删除上游测试文件：保留测试结构，最小化后续同步冲突。
- 不把任何开关改写成运行时环境变量；不新增常驻定时器、轮询、重连或采样器。

## 上游同步复核（merge 后逐条执行）

1. 十二个策略常量值未回退：十个既有 + `DATA_SYNC_DISABLED` + `ZCODE_SITES_DISABLED`。
2. `git grep ZCODE_DYNAMIC_WORKFLOW_MODE -- packages apps ':!*test*'` 只命中 `desktopRuntimeEnv.ts` 的 `delete inheritedEnv[...]` 一行。
3. 新增出网链路全部在守卫内：`ensureTelemetryDeviceMid`、`RemoteConversationTelemetry`（collector Map、Host 订阅、Host 转发与 Main dispatcher）、`startNotifications` 与 Host 推送派生、`PullMobileLogs`、`IUserConfigSyncService`、`IDeviceSyncStateService`、`officialCommandEndpoint`、`zcode-site` 插件发现与插件入口、`syncTelemetryContext`、`local-ttft`。
4. 无为禁用域新增的常驻子进程、定时器、长轮询、重连或采样器。
5. `off_peak_tasks` 的表/列/索引/已发布迁移与校验值保持字节不变。
6. Main 仍不向附件桥注入 `attachRemoteWorkspaceSessionHost`（桥内调用点因依赖缺失不可达）；`packages/server` 的 `/api/connect-remote` 与 `/ws/remote/:id` 仍不可达，普通 `/ws` 保留。
7. `DEFAULT_PLUGIN_MARKETPLACES` 仍只含 `zcode-plugins-official`，claude 未被补种。
8. 远程资产 staging 入口的 `stageRemoteAssetsCli.ts` 仍在 `REMOTE_WORKSPACE_DISABLED` 下整轮返回。
9. `pnpm test:engineering` 中因硬禁用失败的测试已最小短路，且短路原因记录在本文件。

## 实测结果

- `pnpm typecheck`、Desktop Main `tsc --noEmit`、`pnpm lint`（0 error / 6 warning）、`pnpm fmt:check`、`pnpm architecture:check --changed`、`git diff --check` 全部通过。
- `pnpm test:engineering`：151 个文件通过 / 6 个跳过（157），928 个用例通过 / 41 跳过（969），0 失败。
- `pnpm test:architecture`（50 pass / 1 skip）、`docs:stale-phrases:check`、`db:schema:check`、`check:e2e-remote-targets`（无私有队列，跳过）通过。
- 合并后按常量逐文件比对守卫引用：`ZCODE_VENDOR_ACTIONS_DISABLED` 在 `packages/web/src/main.tsx` 的 3 处随 `createWebPlatform` 抽取到 `packages/web/src/platform/index.ts` 而丢失，已在新位置恢复；其余九个常量的引用都在，重命名文件的守卫随新路径保留。
- 测试短路与适配：
  - `packages/zcode-server-cli/test/stageRemoteAssetsCli.test.ts`：`describe.skipIf(REMOTE_WORKSPACE_DISABLED)`，staging 入口整轮跳过。
  - `packages/desktop/test/subagentConfigProxy.test.ts`：本机 Windows 拒绝 `AssignProcessToJobObject`（ERROR_NOT_SUPPORTED），用例在 win32 跳过；Linux/macOS 继续执行。`NODE_OPTIONS --import` 改用 `pathToFileURL`，修复 Windows 盘符路径不是合法 ESM URL。
  - `packages/desktop/test/electronBuilderSecurity.test.ts`：期望值改为 dev 的 Electron 44.7.2 与 semver range。
  - `packages/desktop/test/e2eElectronServiceLifecycle.test.ts`：`patchedDependencies` 改读 `pnpm-workspace.yaml`（pnpm 11 忽略 package.json 的 pnpm 字段）。
  - `packages/desktop/test/telemetryFieldContract.test.ts`：`GIT_CONFIG_GLOBAL` 改用临时空文件，规避 Windows `os.devNull` 不被 Git 接受。
  - `packages/desktop/test/powershell-command.test.ts`：动态值往返测试显式设置 `[Console]::OutputEncoding = UTF8`，避免 OEM 代码页把中文变成乱码。
- pnpm 11 不读取 `package.json` 的 `pnpm` 字段：上游新增的 `overrides` / `patchedDependencies` 已迁入 `pnpm-workspace.yaml`，lockfile 由 pnpm 11.27.1 重新生成。

## 第二轮审查修复

| 问题                                                | 根因                                                          | 修复                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timeline selector 绕过 Highspeed 停用守卫           | 合并取上游 selector 入口时只保留了 `buildRenderUnits` 的早退  | selector 在构建 footer 索引与调用 `markHighspeedOutputFooterUnits` 前按 `CODING_PLAN_DISABLED` 短路；历史分区与 `reuseFinal` 引用复用保持原路径                                                          |
| Agent Service 为普通本地会话构造远端遥测 collector  | 合并后 `remoteConversationTelemetry` Map 与事实分流无条件执行 | Map 只在遥测开启时装配；`collectRemoteConversationFact` 在 Map 缺失时返回 false，本地事实继续走本地 emitter（任务活动统计不受影响）；Main dispatcher 同样只在遥测开启时创建                              |
| Host 仍为本地任务派生手机推送                       | 合并取上游观察器时只在 Main 关断了消费端                      | Host 观察器在 `PHONE_REMOTE_DISABLED` 下不分配 `notificationRuns`、不计算 SHA-256、不派生事件、不写推送日志；`host/index.ts` 不注入 `onRunStarted` / `onNotification`                                    |
| Sites 已安装/已启用记录仍可通过通用插件加载         | `ZCODE_SITES_DISABLED` 只过滤内置定义与默认启用集合           | 插件发现层按 `ZCODE_SITE_PLUGIN_ID` 与 manifest 名过滤所有来源（official roots / cache / installed）；Sites 插件 `main()` 禁用时直接返回；共享 `ZCODE_SITE_PLUGIN_ID` / `ZCODE_SITE_PLUGIN_NAME` 统一 id |
| `attachRemoteWorkspaceSessionHost` 文档与实现不一致 | 合并前既有接线，文档写“无调用方”但 Main 仍注入附件桥          | Main 在 `REMOTE_WORKSPACE_DISABLED` 下不注入依赖，桥内保留缺失即拒绝的纵深防御；spec 同步改为「不注入、桥内调用点不可达」                                                                                |
| `git diff --check` 两处 EOF 空行                    | 上游带入的 fixture/源码末尾多一个空行                         | 去掉 `provider-builtin-analyze-image.sse` 与 `causality-order-functions.ts` 的多余空行                                                                                                                   |

验证：`pnpm typecheck`、Desktop Main `tsc --noEmit`、`pnpm lint`（0 error / 6 warning）、`pnpm fmt:check`、`pnpm architecture:check --changed`、`git diff --check`、`pnpm test:engineering`（151 文件通过 / 6 跳过；928 用例通过 / 41 跳过；0 失败）全部通过。

## 第三轮审查修复

| 问题                                              | 根因                                                                                                                                                          | 修复                                                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sites 经缺包投影与 Host 独立扫描出现在技能/命令页 | CLI 发现层守卫只覆盖运行时组件；`createMissingConfiguredPluginInfos` 仍把旧 `enabledPlugins` 投影成 missing；Host 的 commands/skills 扫描独立读缓存与安装记录 | `bootstrap/zcode-protocol/plugins.ts` 不再投影 Sites 的 missing 条目；`commandsService.ts` 与 `skillsService.ts` 在 manifest 读取后按 `ZCODE_SITE_PLUGIN_ID` 与 manifest 名跳过。磁盘安装记录与旧配置保留，其他缺包插件行为不变 |
| sessions-index snapshot 仍无条件创建 running Set  | `notificationRuns` 已置空，但 snapshot 分支仍 new Set 并遍历全部 session 收集 running ID                                                                      | `running` 仅在 `notificationRuns` 存在时创建与填充；`summaries` 更新保持原路径                                                                                                                                                  |
| `remoteConversationTelemetryEmitter` 仍无条件创建 | Emitter 构造即持有常驻 listener Set；禁用时没有生产者与消费者                                                                                                 | emitter 改为仅遥测开启时创建；`onDynamicRemoteConversationTelemetry` 在禁用时返回共享 no-op `Event`；dispose 改为可选                                                                                                           |
| Highspeed 依赖 selector 每个渲染仍创建 Set 与数组 | `getHighspeedSessionDependencies` / `getHighspeedTurnDependencies` 缺少禁用早退                                                                               | 两处早退返回共享的稳定空快照，`useSyncExternalStore` 不再产生新引用或临时对象                                                                                                                                                   |

验证：`pnpm typecheck`、Desktop Main `tsc --noEmit`、`pnpm lint`（0 error / 6 warning）、`pnpm fmt:check`、`pnpm architecture:check --changed`、`git diff --check`、`pnpm test:engineering` 全部通过。

## 人工验收（本轮不执行）

1. 冷启动后无 ARMS 初始化、无遥测请求、无 `telemetry-state.json` 写入、无 `X-Device-Mid` 请求头。
2. 手机推送不启动：任务管理器无 60 秒轮询，无 `/api/v1/remote/notification/*` 请求。
3. 数据同步页面入口不可达；Host 日志无 `user-config-sync` / `device-sync-state` 的 `Unknown channel` 或 1s 超时。
4. ZCode Sites 插件不出现在内置插件列表、技能页与命令页；旧 `enabledPlugins` 不产生 missing 条目；无 `/site-*` 命令；无 `/api/v1/sites` 请求。
5. `PullMobileLogs` 命令无响应、不创建 `logs/mobile`。
6. 设置页「远程设备」分区不在导航；远程连接入口点击无反应。
7. 普通本地会话、项目数据清理、Open with、本地 server stop/restart 正常工作。
