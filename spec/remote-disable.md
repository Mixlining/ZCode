# 远程连接与 Bot 硬禁用

## 产品规则

本构建只支持**本机桌面单机**形态：一个窗口对应一个 window-scoped Local Host，只服务本地
workspace。不再提供手机远控、远程 workspace（SSH / WSL / Docker）与消息平台 Bot
（Telegram / 微信 / 飞书 Lark）能力，也不为它们保留任何常驻进程、定时器、长轮询、
WebSocket 重连、跨进程锁心跳或空闲状态缓存。

这条规则由 `packages/shared/src/env.ts` 里的常量表达。它们都是**编译期硬编码**的布尔常量，
不读取运行时环境变量，因此部署环境注入端点或用户配置凭据都无法重新启用：

| 常量                        | 值     | 负责的范围                                                      |
| --------------------------- | ------ | --------------------------------------------------------------- |
| `BOTS_DISABLED`             | `true` | 消息平台 Bot 域：服务装配、启动预热、投递与远端桥接             |
| `PHONE_REMOTE_DISABLED`     | `true` | 手机远控链路：外部 relay 附件接管、`web-remote-replayable` 通道 |
| `REMOTE_WORKSPACE_DISABLED` | `true` | 远程 workspace：连接注册表、远程服务集合、远程运行资产下载      |

与 `CODING_PLAN_DISABLED` 等既有常量一致：组件、服务、协议与 i18n 文案**全部保留**，只加守卫，
以便追踪与日后恢复。恢复时把常量改回 `false` 并确认三层守卫删干净，不需要重建实现；
另有构建侧的 `REMOTE_ASSETS_DISABLED` 需要一起改回，见下文「构建侧的同名开关」。

`packages/desktop/src/main/attachRemoteWorkspaceSessionHost` 在合并前已无任何调用方（手机
relay 是本仓库之外的上游服务）。禁用后它必须**继续无调用方**：新增调用方即视为破坏本约束。

## 三层边界

与 `spec/vendor-disable.md` 同构：禁用一个产品域必须同时在**三层**收口。只做界面隐藏会留下
后台请求与常驻资源，只做服务边界会留下无效入口与误导性界面。

```text
1. 入口层   UI 入口 / IPC / 桌面命令 / Web `?remote=` / server HTTP 路由
                 │  能力探测与命令执行都在这里直接返回，不建连、不发请求
                 ▼
2. 服务边界 服务集合装配 / Bot 服务 / 远程连接注册表 / 远程 workspace 服务集合
                 │  不注册服务、不构造对象、不建连、不写 warn/error 噪声
                 ▼
3. 启动恢复 服务构造期的预热、存储迁移、重连恢复、资产下载
                 │  不预热、不迁移、不重连、不下载
                 ▼
```

### 1. 入口层

- UI 远程连接入口（`useRemoteConnectionEntryVisibility` 的消费方：`ChatEmptyState`、
  `WorkspaceSidebar`、`useRemoteWorkspaceHistory`）**保持可见**，但点击后在动作入口直接
  return，不打开连接对话框、不发起连接请求。入口可见性策略本身不变（仍受其自身能力探测约束）。
- Bot 入口（Bot 设置弹窗、Web 远控弹窗与其触发按钮）同样**保持可见**，点击后在入口处
  直接 return，不挂载对话框、不启动其轮询。
- 桌面 Main 的 `PlatformChannels.ConnectRemote` 系列 IPC 在处理器体内先返回中性值，
  不解析连接目标、不启动 SSH / WSL / Docker 探测、不做远程资产安装。
- Web 客户端的 `?remote=<id>` 分支忽略该参数，不建立 `/ws/remote/:id` 连接。
- `packages/server` 的 `/api/connect-remote` 与 `/ws/remote/:id` 在守卫内直接返回
  / 关闭连接，不创建远程后端、不桥接远程 services。**注意**：普通 `/ws`（浏览器
  terminal-client 通道，`web-remote-replayable` 只是它既有的客户端模式名）属于保留的
  Web 模式能力，**不得一并关闭**；`entry-http.js` 同时托管 `packages/web/dist`。
  `packages/server` 仍被桌面远程后端引用，禁用后其 `remote` 入口不再被调用，但**不删除包**。

### 2. 服务边界

`BOTS_DISABLED` 为真时：

- `createLocalServices` 不注册 `IBotsService`，因而不构造 `BotsRepo`、Provider 适配器
  与其内部 Map 集合。下游一律用 `services.getOptional(IBotsService)`，跳过注册即可自然降级。
- `remoteWorkspaceServiceCollection` 不注册 `IBotsService`。
- Host 侧 `cronBotDelivery` 不订阅自动化投递；Bot 远端桥接（`botRemoteWorkspaceBridge`）
  不构造，`pendingRemoteReconnectsByKey` 等集合随之消失。
- Bot 远端桥接在构造时就会 `parentPort.on("message", onMessage)` 挂上一条常驻监听，
  因此守卫必须包住**构造**而不只是注册；禁用后该监听不再存在。

`PHONE_REMOTE_DISABLED` 为真时：

- `attachRemoteWorkspaceSessionHost` 拒绝手机附件接管，不设置
  `clientMode: "web-remote-replayable"`，不向 Host 发 `AttachServicePort`。
- Host 拒绝 `scope.kind === "remote"` 且 `clientMode === "web-remote-replayable"` 的附件请求；
  `desktop-continuous` 是远程 workspace 的语义，由 `REMOTE_WORKSPACE_DISABLED` 负责。

`REMOTE_WORKSPACE_DISABLED` 为真时：

- 窗口内不创建远程连接注册表，Main 不创建 `createRemoteWorkspaceSessionManager` 之外的
  连接状态；`createRemoteWorkspaceServiceCollection` 不被调用。
- 远程运行资产下载（`cdn-zcode.z.ai`）不再触发，`resolveRemoteAssetDirs` 不再被连接流程调用。
- `workspaceIdentity` 与 `remoteSessionId` 的贯通逻辑保留（本地链路仍在用 identity），
  但不再接受远程来源。

### 3. 启动恢复

- 不执行 Bot 的三类 Provider `refresh()` 与 `ensureBotStorageMigrated()`：禁用时
  `createBotsService` 根本不构造，因此启动期不再读取 Bot 配置与状态 JSON。
- 不恢复历史远程连接：不读取上次连接的 `RemoteTarget`、不重连、不重建远程会话。
  具体由 `useRemoteWorkspaceHistory` 把 `allowRemoteWorkspaceRestore` 收敛为 `false`
  （`canUseRemoteWorkspace && !REMOTE_WORKSPACE_DISABLED`），复用
  `restorePersistedRemoteWorkspaceSessions` 既有的「入口被隐藏时不恢复远程 tab」分支。
  `setting.json` 里的远程快照原样保留（与旧 `off_peak_tasks` 行同理，不删数据），
  本地 workspace tab 的恢复不受影响。
- 不触发远程资产下载与 `prepare-prebuilds` 的远程 bundle staging。

## 状态所有者

| 状态                         | 唯一所有者                                           |
| ---------------------------- | ---------------------------------------------------- |
| 是否提供远程/Bot（产品开关） | `packages/shared/src/env.ts` 的编译期常量            |
| 连接目标与凭据事实           | 用户配置文件；禁用时不再被读取                       |
| Bot 配置与运行状态           | `BotsRepo`（禁用时不再构造）                         |
| 远程会话生命周期             | Main 的 remote session manager（禁用时不再接受来源） |

## 构建产物

运行时禁用必须同时停掉只服务远端/手机的构建产物：

- 不再 stage 远程 agent bundle：`scripts/prepare-prebuilds.mjs` 的 `main()` 在
  `REMOTE_ASSETS_DISABLED` 为真时整轮跳过（该脚本只产出远端部署用的 mock CDN 资产：
  node 运行时、server bundle、node-pty、远端 agent bundle 与 native-search 工具，
  仅由 `packages/server/src/remote/*` 的部署与安装链路消费）。本地桌面运行时不依赖该脚本，
  `mock-cdn` 也只是开发态可选离线缓存，缺失时正常运行。

**有意保留**（不可一并停掉，停掉会破坏保留能力）：

- `packages/server/dist/entry-http.js` 与 `scripts/build-zcode.mjs` 对它的断言：它同时是
  保留的 Web 模式入口（`http.ts` 的 `staticRoot` 由它托管 `packages/web/dist`），
  不只是手机链路入口。手机/远程 workspace 的收口改在路由层：`/api/connect-remote` 与
  `/ws/remote/:id` 加守卫，普通 `/ws`（浏览器 terminal-client 通道）保持可用。
- 本地桌面的 agent bundle staging（`packages/desktop/scripts/stage-agent-bundle.mjs`、
  `prepare-agent-node-bundle.mjs`）与 `bundle.mjs` 的 `requiredRuntimeModules` 断言：
  桌面打包态自身需要 `resources/glm/zcode.cjs`。

禁用后 `@larksuiteoapi/node-sdk` 仍是 workspace 声明依赖（Bot 实现保留），其
lockfile、`third-party/inventory.json` 与 `THIRD-PARTY-NOTICES.md` 记录保持不变。

## 验收场景

静态可验证：

1. `createLocalServices` 的 bots 注册位于 `!BOTS_DISABLED` 守卫内。
2. `remoteWorkspaceServiceCollection` 的 bots 注册位于同一守卫内。
3. `attachRemoteWorkspaceSessionHost` 在函数体首部对 `PHONE_REMOTE_DISABLED` 直接返回，
   且全仓库除定义与导出外无调用方；`desktop/src/host/index.ts` 的 `AttachServicePort`
   分支拒绝 `clientMode === "web-remote-replayable"`。
4. `packages/server/src/http.ts` 的 `/api/connect-remote` 与 `/ws/remote/:id` 位于
   `REMOTE_WORKSPACE_DISABLED` 守卫内；普通 `/ws` 路由不带该守卫（保留的 Web 模式）。
5. 远程连接动作入口在 `REMOTE_WORKSPACE_DISABLED` 为真时直接 return
   （`ChatEmptyState` 的菜单项与 `useRemoteWorkspaceHistory.connectRemoteWorkspaceTarget`）；
   `useRemoteConnectionEntryVisibility` 仍按自身可用性策略返回，不用于隐藏入口。
6. `scripts/prepare-prebuilds.mjs` 在禁用时不执行远程 bundle staging 与 mock CDN 产出；
   而 `scripts/build-zcode.mjs` 仍断言 `entry-http.js`（Web 模式入口）。
7. 远程运行资产下载不可达：`resolveRemoteAssetDirs`（唯一触发 `cdn-zcode.z.ai` 的路径）
   只被 `createRemoteWorkspaceSession` 调用，而后者只经上述守卫过的入口到达；
   窗口重载触发的 `reattachRemoteWorkspaceSessionsForWindow` 只遍历空的
   `routesBySessionId`，不产生连接、定时器或网络请求。
   插件市场 CDN（`plugin-marketplaces.ts`、`featureSuggestedPrompts.ts`）属
   `spec/vendor-disable.md` 的保留例外，不受本约束影响。

运行时（人工）验证：

- 冷启动应用，进程列表无额外子进程；网络面板无 Telegram / 微信 / 飞书域名请求，
  无 relay WebSocket 连接，无 `cdn-zcode.z.ai` 请求。
- 空闲停留观察，CPU 无周期性占用（无长轮询与锁心跳）。
- Bot 配置与远程连接入口可见但点击无反应，不弹窗、不发起连接。

上述运行时场景只记录为人工验收清单，不在本项目修改流程中运行应用、单测或 E2E。

## 构建侧的同名开关

`scripts/prepare-prebuilds.mjs` 是纯 `.mjs`，无法 import `packages/shared/src/env.ts` 的
`.ts` 常量，因此它保留自己的 `const REMOTE_ASSETS_DISABLED = true`，与
`REMOTE_WORKSPACE_DISABLED` 表达同一决策。这是本仓库既有惯例（另有
`MODEL_TELEMETRY_HARD_DISABLED`、`AUTO_ONBOARDING_DISABLED` 等独立硬禁用常量），
不要为了「单一事实来源」把它改成运行时读文件解析——那只是把简单常量换成解析脆弱性。

代价是**恢复远程 workspace 时两处都要改回**：`env.ts` 的 `REMOTE_WORKSPACE_DISABLED`
与 `prepare-prebuilds.mjs` 的 `REMOTE_ASSETS_DISABLED`。漏改后者的表现是远端资产静默不生成，
构建不报错但远端部署缺资产，排查成本高，因此此处与上游同步清单都记这条。

不得把任一开关改写成读取运行时环境变量——硬禁用语义与 `spec/vendor-disable.md` 一致。

## 上游同步复核清单

每次把上游并入本分支后，除 `AGENTS.md` 的通用要求外，按此清单核对本 spec：

1. 三个常量值未被回退；`IBotsService` 的注册仍留在
   `createLocalServices` 与 `remoteWorkspaceServiceCollection` 的守卫内。
2. 上游新增代码若引用 `IBotsService`，必须经 `getOptional` 并容忍 `undefined`；
   经 `services.get(...)` 直取会在未注册时抛错。
3. `scripts/prepare-prebuilds.mjs` 的 `REMOTE_ASSETS_DISABLED` 仍为 `true`；
   上游若改写该文件，确认这一守卫没被合并冲掉。
4. `attachRemoteWorkspaceSessionHost` 仍未新增调用方；`AttachServicePort` 的
   `web-remote-replayable` 拒绝分支仍在。
5. `packages/server` 的 `/api/connect-remote` 与 `/ws/remote/:id` 守卫仍在，
   且普通 `/ws` 与 `entry-http.js` 未被一并关闭。
6. UI 侧 `REMOTE_WORKSPACE_DISABLED` 的启动恢复分支（`allowRemoteWorkspaceRestore`）
   仍在；否则断连态远程 tab 会被凭空拉回。
7. 上游若新增远程/Bot 的构建产物入口，同样要在本 spec 记录保留或停用决定。
