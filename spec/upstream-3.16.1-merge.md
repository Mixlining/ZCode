# v3.16.1 个人分支同步与适配

## 基线与合并规则

- dev 基线为 `a02a200f`（含 Electron 44.7.2 / pnpm 11.27.1 工具链与 v3.15.1 全部禁用守卫），合入 main 的 `0a1fc56d`（chore: sync ZCode source，版本 3.16.1）。使用真实 merge，不重写历史。
- 冲突消解按逐文件实际内容裁决，不整文件选 ours/theirs；守卫「常量 + 原逻辑并列」的原逻辑结构保持不动，上游 diff 落在原逻辑上。
- 根版本跟随上游 3.16.1；本次只 commit 不打 tag，发布制品版本仍由 `spec/desktop-release-tag-version.md` 的 tag 流程注入。
- 落地形态：一个 merge 提交 + 一个收尾提交（守卫恢复、依赖锁文件重生成与格式化归入收尾提交）。
- 验证只执行静态六项（根 Typecheck、Desktop Main `tsc --noEmit`、Lint、Format、Architecture changed、`git diff --check`），不运行应用、单测、E2E 或制品构建。

## 已定产品决策

1. **启用项目模型**：侧边栏按项目组织会话，分组视图移除（分组视图代码与分组数据保留，不再提供入口）；旧 `task_groups` 数据在首次启动按上游迁移静默转为项目，不弹窗。
2. **归档按需运行**：自动归档关闭（默认）时不启动任何扫描定时器；开启后启动扫描，间隔由上游 5 分钟改为 1 小时；设置变更动态启停。手动归档不受影响。
3. **远程/Bot/手机入口保持「入口可见、点击无效」**：入口照常显示，点击在触发处直接 return，不打开设置页、不挂载弹窗（含新增的 `remoteDevices` 设置页，从导航隐藏且跳转入口返回）。
4. **会话分享按钮为死按钮**：点击在触发处返回，不进入选择流程；HTTP 客户端守卫保留作纵深防御。
5. **首次引导不读本机证据**：启动不读取 CLI 配置、会话数据库与旧版快照目录；引导仅经帮助菜单手动打开。
6. **文档预览与上游一致**：四个文档插件升级为共享运行时（office-runtime），含中文字体兜底。
7. **Web 页面 404**：`/remote` 与 `/cn/share/*`、`/share/*` 路由直接 404，不加载页面、不发请求。桌面安装包不发布也不托管 `packages/web/dist`，该决策只影响自建 Web 部署。
8. **守卫缺口一并修复**：上游新增的 `PluginTelemetry` 转发分支补 `ZCODE_TELEMETRY_ENABLED` 开关；`createWebRemoteControlFeatureGate` 默认参数改为关闭（显式传参才启用）。
9. **验证门禁维持静态检查**：不引入上游 `verify:pre-push` 的 `db:schema:check`、`test:architecture`、`test:unit:affected`。

## 行为与所有者

```text
SettingService(归档开关) ──开──▶ 归档扫描定时器(1h) ──▶ archiveInactive
        │──关──▶ 不构造定时器，无周期读设置/查库
设置变更 ──动态启停──▶ 同一定时器所有者（Host 服务装配处）

Main(远控管理器) ──PHONE_REMOTE_DISABLED──▶ 不构造、不恢复、无中继心跳
Host(SourceServer*) ──REMOTE_WORKSPACE_DISABLED──▶ 不构造、无启动重连批次
services(IBotsService/IOffPeakTaskService) ──各域常量──▶ 不注册、不构造、无轮询
telemetryCore/转发分支 ──ZCODE_TELEMETRY_ENABLED──▶ 全链路早返回，无跨进程载荷
```

- 状态所有者不变：产品开关仍全部在 `packages/shared/src/env.ts`；归档定时器的启停唯一所有者是 Host 服务装配处的设置订阅；Web 路由收口所有者是 `packages/web/src/main.tsx` 路由判定。
- 数据库启动沿用原迁移与修复顺序；`off_peak_tasks` 表、列、索引、已发布迁移及校验内容字节不变；分组→项目迁移执行上游迁移，迁移语义与数据由 `project-storage` 的既有契约测试资产覆盖（本轮不运行）。
- 上游新增的 `useSourceServerUpdateNotifications`（Root 挂载、订阅远端状态变化）随远程域禁用：不挂载、不订阅。
- 上游 CLI 新增的 off-peak runtime 模块（`apps/zcode-cli/packages/core/src/runtime/off-peak/*`）代码保留，但 CLI 不注入 OffPeakPort、不恢复旧任务，运行链路仍被上游既有 `off-peak-tool-policy` 与 host 拒绝路径挡住。

## 守卫恢复与补齐清单（收尾提交）

### 遥测与监控

| 位置                                                                | 动作                                                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/services/src/telemetry/telemetryCore.ts`                  | 恢复上游删除的三处 `ZCODE_TELEMETRY_ENABLED` 早返回（reportEvent / reportAppLaunch / reportAppDailyActive）                                                         |
| `packages/desktop/src/main/desktopHostProcess.ts`                   | 恢复 `McpResourceSamples` / `McpTelemetry` / `SessionCreateTelemetry` 三分支开关；新增 `PluginTelemetry` 分支补同款开关                                             |
| `packages/desktop/src/host/index.ts`                                | `reportPluginTelemetryEvent` 注入点包进遥测开关，关闭时不构造跨进程载荷                                                                                             |
| `packages/desktop/src/main/desktopRemoteUsageArmsTelemetry.ts`      | 恢复 5 分钟 ARMS gauge 的遥测开关（上游重写该文件，类型以 main 的 `IntervalHandle` 为准）                                                                           |
| `packages/desktop/src/host/database-startup/hostDatabaseStartup.ts` | 保持 dev 的 `ZCODE_TELEMETRY_ENABLED` 守卫，`StartupDiskSampler` 不启动                                                                                             |
| `packages/desktop/src/main/index.ts`                                | 保持 ARMS 启动模块删除态（`appARMSBootstrap.ts` 等不入构建）；`createTelemetryUserIdLoader` / `createTelemetryAuthorizationLoader` 为本地凭据只读，不构成出网，保留 |

### 弃用域

| 域                      | 动作                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bots                    | `createLocalServices` / `remoteWorkspaceServiceCollection` 不注册 `IBotsService`、不构造 `BotsRepo`，启动不执行 Provider `refresh()`；Host 侧消费方用 `getOptional`                                                                    |
| 闲时任务                | `IOffPeakTaskService` 不注册、`startSync()` 不调用；`App.tsx` 不挂载 `useOffPeakTaskNotifications`；CLI off-peak runtime 不注入端口                                                                                                    |
| 手机远控                | Main 不创建 Web 远控管理器、不执行 `restorePreviouslyEnabled`；Web `/remote` 路由 404；`createWebRemoteControlFeatureGate` 默认参数改 false                                                                                            |
| 远程 workspace          | 不构造 `SourceServerConnectionManager` / `SourceServerDirectory`，不执行 `runStartupReconnectBatch`；`remoteDevices` 设置页从导航隐藏（`HIDDEN_SETTINGS_SECTIONS`），任何 `sourceServerId` 跳转入口在触发处返回；`remoteAssets` 不下发 |
| 会话分享                | `ConversationShareMenu` 点击在触发处返回；`conversationShareHttpClient` / `feedbackHttpClient` / `marketingTouchService` 守卫保留；Web `/share` 路由 404                                                                               |
| 首次引导                | `createHasExistingLocalTask` 的会话库/CLI 配置证据源不接入（返回 false 语义下不读盘），自动弹窗路径不启用，引导仅手动打开                                                                                                              |
| Highspeed / Coding Plan | `node.ts` 套餐/高速/权益注册保持守卫内；模型网关不改写；`SettingsUsageTabTarget` 的 codingPlan tab 不出现                                                                                                                              |

### 后台资源

| 位置                                                    | 动作                                                                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/services/src/project/autoArchiveScheduler.ts` | `taskAutoArchiveEnabled=false`（默认）时不创建定时器（只做一次策略探测）；设置开启时启动（间隔 1 小时），关闭时 `stop()` 释放定时器并保留实例供再次开启；Host 退出时 `dispose()` 终态释放 |
| `packages/ui/src/App.tsx`                               | 不挂载闲时任务 30 秒轮询                                                                                                                                                                  |
| `Root.tsx`                                              | 不挂载 `useSourceServerUpdateNotifications`                                                                                                                                               |
| 市场自动刷新                                            | `officialMarketplaceAutoRefresh` 守卫保持                                                                                                                                                 |
| 远控中继心跳/看门狗                                     | 随管理器不构造而不可达，代码保留                                                                                                                                                          |

### Web 路由

- `packages/web/src/main.tsx`：`/remote`（含新 `/remote/*` 路由判定）与 `/cn/share/*`、`/share/*` 分支在路由判定处直接 404；`/web-remote`、`?remote=`、`/web-remote/callback` 等既有守卫保持。
- `packages/server`：`/api/connect-remote` 与 `/ws/remote/:id` 守卫保持；普通 `/ws` 与 `entry-http.js` 静态托管不动。

## 依赖与工具链

保留 dev 侧升级（不得回退）：Electron `44.7.2`、electron-builder `^26.17.0`、electron-updater `^6.8.10`、`@electron/rebuild` `^4.2.1`、pnpm `11.27.1`（root + CLI `packageManager`）、Node `>=24.21.0`（engines、mise、.nvmrc、CLI 版本声明）、Electron/builder 二进制官方 GitHub Releases 镜像、pnpm 配置在 `pnpm-workspace.yaml`（`.npmrc` 仅保留 registry）、根 `yaml` 显式 devDep、`verify:pre-push` 不含单测。

接收上游新增：`@zcode/zcode-cua@0.6.5`（占位包，`build:cua` 仅类型检查，无原生编译、无下载）、`@zcode/office-runtime` 与四文档插件 0.2.x、`@radix-ui/react-popper`、`ws`、`@radix-ui/react-collapsible` 补丁、`scripts/bootstrap-patched-dependencies.mjs`、`db:schema:*` 脚本资产、上游 typecheck 扩展清单（含 `tsconfig.remote-main.json`、zcode-cua）。

丢弃 main 侧：`package.json#pnpm` 块与 `.npmrc` 的 `node-linker`（改用 workspace YAML）、`packageManager`/engines 旧值、npmmirror 镜像、`build:web-remote-control:v3/v4` 脚本随 Web 路由 404 决策移除。

锁文件：root `pnpm-lock.yaml` 与 `apps/zcode-cli/pnpm-lock.yaml` 都不接受任何一侧，以 pnpm 11.27.1 按合并后 manifest 重新生成。

远程资产守卫迁移：`scripts/prepare-prebuilds.mjs` 被上游删除（modify/delete 冲突，接受删除）。dev 的 `REMOTE_ASSETS_DISABLED` 早返回迁移到新入口 `packages/zcode-server-cli` 的 `stage:remote-assets` / bootstrap staging 路径（按 `.mjs` 无法 import `.ts` 的既有惯例保留硬编码常量）；`spec/remote-disable.md` 的引用同步更新。

## 静态消融记录

- 不为 `remoteDevices`、`SourceServer*`、插件遥测新增第二套「禁用版实现」；守卫全部写在上游代码的同一位置。
- 归档「按需启动」只改调度判据与间隔常量，不动 `archiveInactive` 与迁移。
- Web 404 用路由判定处早返回实现，不新增错误页组件与状态。
- featureGate 默认值改动只有一处（工厂默认参数），不逐调用点补判断。
- 分组视图移除仅从导航/入口层移除挂载，`workspace-grouped-tasks` 组件与 `task_groups` 数据不删。

## 上游同步复核（merge 后逐条执行）

1. `git diff aac47556..HEAD -G'ZCODE_TELEMETRY|ARMS|RUM'` 新增命中项全部位于守卫内。
2. 十一个编译期常量（六个 vendor 域 + 三个 remote 域 + `MEMORY_DIAGNOSTICS_ENABLED` + `ZCODE_AUTO_UPDATE_ENABLED`）值未回退。
3. 无为禁用域新增的常驻子进程、定时器、长轮询、重连或采样器。
4. `off_peak_tasks` 校验内容字节不变。
5. `attachRemoteWorkspaceSessionHost` 仍无调用方。
6. root/CLI 双锁文件由 pnpm 11.27.1 生成且与 manifest 一致。

## 人工验收（本轮不执行）

1. 升级后侧边栏按项目组织，旧分组完整迁移，无弹窗打断；分组视图不再出现。
2. 自动归档默认关闭且无周期扫描；开启后按 1 小时生效，关闭后停止。
3. 远程连接、Bot、Web 远控、分享入口点击均无反应，不弹设置页/对话框。
4. 首次启动不读取 CLI 配置与会话库；帮助菜单可手动打开引导。
5. Word/PDF/PPT/Excel 预览可用，无中文字体的系统显示正常。
6. 自建 Web 部署访问 `/remote`、`/share/...` 返回 404；普通 `/ws` 与 Web 模式不受影响。
7. 打包产物冷启动无 ARMS 初始化、无遥测请求、无中继心跳、无 SSH/WSL/Docker 探测进程。
