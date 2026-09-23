# 控制面 Agent 进程泳道的生命周期

## 产品规则

- 本机 Agent runtime（`app-server --stdio`）按用途分三条泳道，各自独立管理，不共享请求队列：
  - **chat**：workspace 级会话运行时，每个活跃 workspace 一个，承载会话与交互。
  - **plugin**：插件管理控制面。`plugins/*` 全部方法都走这条泳道。
  - **mcp-status**：MCP 状态探测控制面。`mcp/list` 的慢握手会占住串行 stdio 队列，必须与插件命令隔离。
- **控制面泳道（plugin、mcp-status）共用 1 分钟空闲回收阈值**：连接上无在飞请求持续 1 分钟，就回收整棵进程树（含其下 MCP 子进程），下次操作透明冷启动。理由是这两条泳道都是「按需冷启动、用完即可回收」的控制面，不应长期常驻内存。
- **chat 泳道不做空闲回收**：它承载会话状态与预热，回收时机由 workspace 生命周期决定（切走 workspace 的预热回收、workspace 重载、应用退出），不由空闲计时决定。
- 插件能力**只支持手动触发**，没有手动操作就不启动插件控制面进程。不存在自动更新、自动检查更新或挂载即初始化的调用路径。用户主动打开插件页/执行插件操作时按需冷启动。
- 插件目录自动刷新由 `MARKETPLACE_AUTO_REFRESH_DISABLED` 硬禁用（见 `spec/vendor-disable.md`），进入商店页不自动发目录请求。
- **不落盘插件列表快照**：插件事实源是 CLI 进程，Host 不保存第二份可展示副本，避免与 CLI 漂移。因此应用重启后插件页需要一次用户主动操作才能拿到列表。

## 状态所有者与事件顺序

- **Agent 子进程的唯一所有者是对应的 `ZCodeAgentProcessManager` 实例**（`packages/services/src/zcode-agent/zcodeAgentProcessManager.ts`）。UI 与服务层只持有协议 client，不持有、不结束进程。
- 三条泳道各用一个 manager 实例，在 `createZCodeAgentService`（`packages/services/src/zcode-agent/zcodeAgentService.ts`）内装配。空闲阈值是构造选项 `idleTimeoutMs`；**chat 泳道的选项类型刻意 `Omit` 掉该字段**，从类型层面禁止把空闲回收传给 chat。
- plugin 与 mcp-status 共用同一个合成管理面 workspace（`ensurePluginManagementWorkspacePath()`），但泳道由不同 manager 实例区分，各持独立的注册表与记账。
- 管理面合成 workspace **不进入**会话的 active client map（`activeClientsByWorkspaceKey`）。该 map 只记录真实 workspace 路径。
- 回收归因为 `idle-timeout` / `expected`，不被进程监控当作崩溃；只有请求超时才是 `watchdog_recycle`。

```text
用户主动插件操作（打开插件页 / 更新 / 安装 / 卸载 / 启停 / 配置 / 查询）
  → getPluginManagementClient() → pluginProcessManager.getClient()
      ├─ 已有存活子进程 → 复用（不重复 spawn）
      └─ 无 → spawn app-server --stdio
  → 请求入队（pendingOperationRequestCount += 1）
  → 响应返回 → pending 归零 → onPendingRequestsDrained → scheduleIdleReclaim
      └─ 1 分钟定时器（unref，不把 host 钉在事件循环里）
          到点复核：disposed / exited / 已换代 / pending > 0 / storageStartup.isWaiting
             ├─ 任一命中 → 放弃本轮，等下次归零重新计时（不中断在飞操作）
             └─ 全通过 → 摘除注册项 → cleanupManagedProcessWithRetry("idle-timeout")
                        → 整棵树回收（含 MCP 子进程）
  下次插件操作 → getClient 透明冷启动

chat 泳道：不参与上面的计时
  → 回收来源：切走 workspace 的预热回收 / workspace 重载 / workspace 移除 / 应用退出

插件 store 初始化（挂载期自动触发）
  → 已移除：输入框电脑控制入口挂载不再调用 initializePlugins
  → 只保留：用户主动打开插件页或执行插件操作
```

## 不变量与失败语义

- **不误杀在飞操作**：定时器到点必须复核无在飞请求且不在存储准备中；命中即放弃本轮并等下次归零重新计时，不打断进行中的安装/更新。
- **不重复 spawn**：同一泳道同一 workspace 的并发 `getClient` 由 manager 的 single-flight 去重。
- **进程数与 UI 无关**：UI 不得因渲染某个按钮而冷启动 Agent runtime。渲染所需的插件启用态只能来自已有 store 快照，不能反推为「必须发起一次插件查询」。
- **回收失败不永久泄漏**：清理失败保留在 `ownedProcesses` 中并重试一次；仍失败时进程树由后续应用退出收口。
- **不做超时兜底**：空闲回收判定不依赖运行时环境变量或远端配置，阈值是编译期常量，无运行时覆盖入口。

## 边界说明

- 本构建的 Computer Use（`@zcode/zcode-cua`）是 API 兼容占位实现：Helper host 的 `start`/`restart`/`checkHealth` 全部 fail-closed，`isOfficialCuaPluginEnabledForWorkspace()` 恒为 false，且不打包任何 native Helper 产物。因此本 spec **不为 CUA 新增编译期禁用常量**——不存在需要收口的 CUA 进程或常驻内存。本次只在 UI 侧去掉输入框入口挂载期的插件 store 初始化。
- 远程 workspace 已硬禁用（见 `spec/remote-disable.md`）；本 spec 只覆盖本机桌面单机形态的三条泳道。
- 插件更新沿用现有协议参数：UI 始终传 `pluginId`。**不新增**「必须显式指定目标」的校验约束；一次性更新全部已安装插件的能力（省略 `pluginId`）作为既有协议语义保留，但当前没有 UI 调用方。

## 验收场景

1. 打开插件页执行一次更新：更新完成后 1 分钟内插件泳道进程自行退出（含其下 MCP 子进程）。
2. 大插件安装/更新进行中不被中途回收；操作完成后才开始计时。
3. 连续操作间隔小于 1 分钟时复用同一进程，不反复冷启动。
4. 启动应用后不打开设置页、不执行任何插件操作：除活跃 workspace 的 chat 泳道外，不存在第二个 Agent 进程。
5. 「电脑控制」输入框入口在插件未启用时不渲染，且其挂载不再引发任何插件查询或进程启动。
6. MCP 设置页手动刷新后，mcp-status 泳道进程在 1 分钟内自行退出。
7. 保存在全局范围的已存工作流仍可用（首次触发时冷启动一次控制面进程，之后按 1 分钟空闲回收）。
8. 应用退出时三条泳道均随 `disposeAllAndWait` 收口，不遗留孤儿进程。

本次按项目约定只执行静态检查；上述场景作为人工验收清单记录，不运行应用、单测或 E2E。
