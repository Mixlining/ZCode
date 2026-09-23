## 核心原则

- 新增或修改行为前，先更新对应 spec；目录不存在时按需创建。先明确产品规则、状态所有者、接口和验收场景，再实现代码。
- 以当前检出的源码、`package.json` 和架构策略为准。说明中只保留当前仓库提供的功能、命令和文件；删除功能时同步清理指令和技能中的引用。
- 定位问题时，未明确要求修改代码就先调查原因。结合源码、日志和运行时证据，区分已确认原因与待验证假设。
- 保留与任务无关的本地改动，不自行恢复已移除的模块或内部依赖。

## 项目背景与硬禁用边界

- 本项目基于开源项目改造。厂商能力通过编译期硬编码关闭，保留原有实现以便追踪和维护；ARMS 启动模块及其专用代码已按用户要求移除。不得仅隐藏 UI、改用运行时环境变量或远端配置重新启用这些能力。具体产品规则和目录例外见 `spec/vendor-disable.md`。
- 必须保持 `packages/shared/src/env.ts` 中的 `ZCODE_TELEMETRY_ENABLED = false`：不向厂商发送数仓事件、ARMS RUM 等远程遥测，也不启动无用途的上报队列和采样器。`MEMORY_DIAGNOSTICS_ENABLED = false` 保持内存诊断定时采样关闭。
- Desktop Main 不得启动 ARMS SDK 或更新 ARMS 用户身份；本地崩溃记录可以保留，但不得因此恢复远端遥测或采样。
- 必须保持 `CODING_PLAN_DISABLED = true`：官方 Coding Plan 的登录 OAuth、缓存会话恢复、权益与额度、套餐/支付查询及官方模型网关改写均不可恢复出网。入口、服务边界和启动恢复三层守卫应保持一致。
- 保持现有 `REMOTE_ROLLOUT_DISABLED`、`ZCODE_VENDOR_ACTIONS_DISABLED` 与 `MARKETPLACE_AUTO_REFRESH_DISABLED` 的硬禁用语义。用户自行配置的模型端点、内置供应商目录、手动插件目录/下载及远程工作区运行资产下载遵循 `spec/vendor-disable.md` 的明确例外。
- 不为已禁用能力或空闲状态新增常驻子进程、定时器、轮询、采样器或无用途的缓存。保留 scheduler 无待触发工作时自退、需要时唤醒的机制；窗口托盘驻留由用户设置决定，不由 scheduler 是否运行推断。
- 闲时任务属于官方 Coding Plan，必须在 Host、Desktop Main、scheduler 和 Agent CLI 全链路硬禁用：不装配服务、Repo、同步定时器或工具，不恢复、读取、轮询、派发、结算旧任务；旧 `off_peak_tasks` 行原样保留。普通 cron 自动化及共用 scheduler 的既有启动、自退机制继续可用。
- 保留闲时任务数据库表、列、索引和所有已发布迁移及其校验内容，确保旧版数据库可直接升级；禁用时跳过会修改旧闲时任务行的业务初始化修复。详见 `spec/vendor-disable.md`。
- 遥测和内存诊断关闭时，CLI 仍可用既有节拍维护 resident session，但不应为无消费者的资源样本采集 CPU/内存或创建采样标识。

## 命令与仓库结构

开工前运行 `node scripts/check-workspace-freshness.mjs` 检查基线。Node 版本以 `mise.toml` 为准。

以下命令从仓库根目录执行：

| 用途             | 命令                                      |
| ---------------- | ----------------------------------------- |
| 类型检查         | `pnpm typecheck`                          |
| Lint             | `pnpm lint` / `pnpm lint:fix`             |
| 格式检查         | `pnpm fmt:check`                          |
| 桌面开发         | `pnpm dev:desktop`                        |
| Web 开发         | `pnpm dev:web`                            |
| 提交前检查       | `pnpm verify:pre-push`（Lint 与架构检查） |
| 架构检查         | `pnpm architecture:check --changed`       |
| 模块阅读包       | `pnpm architecture:context <module-id>`   |
| 未使用依赖与导出 | `pnpm knip`                               |
| 导出引用查询     | `pnpm dep:refs --list-exports <file>`     |

静态检查入口以当前 `package.json` 为准；本项目修改后的验证不运行单测或 E2E。

- `packages/desktop`：Electron main、host、renderer。
- `packages/web`、`packages/server`：Web 客户端与服务端。
- `packages/ui`：共享 React 组件、hooks 与 Zustand store。
- `packages/services`：业务服务；`packages/rpc`：RPC 框架。
- `packages/shared`：共享协议与类型；`packages/client`：Agent 客户端 SDK。
- `apps/zcode-cli`：Agent CLI 与运行时。
- `CONTEXT.md`：插件商店领域词汇；修改相关 UI 前阅读。
- `DESIGN.md`：UI 设计规范；修改 UI 前阅读。

## 实现与验证

- 代码改动使用 `.agents/skills/architecture-governance/SKILL.md`，先运行架构检查，再读取目标模块的受控上下文。
- 避免重复状态和多条写入路径。明确唯一所有者、接口、依赖方向、事件顺序与幂等边界，不能用超时掩盖同步问题。
- 有行为改动时先在对应 spec 记录正反路径、状态边界和验收场景；交互改动写明人工验收步骤。本项目修改后只执行静态检查，不启动应用、运行单测/E2E，或直接编译、打包 Desktop 与 CLI 制品。
- 修复 bug 时用中文注释说明原因和修复依据。发现设计缺陷时先与用户对齐，不不断增加兜底分支。
- 涉及状态、时序、远端或异步同步的方案，用图展示所有者及事件顺序。
- 每次修改后执行 `pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`、`pnpm architecture:check --changed` 和 `git diff --check`，报告真实结果，不将已有失败写成通过。`pnpm typecheck` 是允许的现有检查流程；Desktop Main 改动另用 `pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit` 静态核对，并区分其已有错误与新增错误。
- CI 的 Typecheck 门禁在根类型检查后执行 Desktop Main `tsc --noEmit`。CLI bootstrap 的直接检查依赖未入库的 workspace 声明产物，建立无构建的干净检出检查入口前，不把本地偶然存在的 `dist` 作为 CI 前提。
- 每次修改后对本次变更链路做静态消融实验：逐项审视新增或保留的条件、参数、状态、封装和依赖，尝试去掉无必要部分；核对调用点和行为边界后重跑静态检查，记录保留理由及净代码变化。不得借消融扩大到无关模块或新增兜底层。
- 使用异步文件和网络 IO；跨包导入使用公开入口，遵守现有路径别名。
- 禁止 UI 直接调用 Repo、Service 引用 Runtime 具体实现、跨域导入实现细节及循环依赖。

## UI 与平台边界

- 遵守 `DESIGN.md`，复用已有组件，兼顾桌面与手机 Web 的布局、交互、主题和国际化。
- 组件通过 `packages/ui/src/hooks/` 访问服务；平台操作通过 `IPlatformService`（`packages/shared/src/platform.ts`），不直接调用 `window.zcode`。
- 通过依赖注入处理 Desktop、Web、本地和远程环境的差异，并兼顾 Windows、macOS 和 Linux。
- Zustand 状态位于 `packages/ui/src/store/`。广播同步的主题、语言等字段需要防止回环；UI 局部状态不应被误当作服务端事实。
- hooks 中含 JSX 的文件使用 `.tsx`。

## 进程、协议与远程控制

- Desktop app 通过 stdio 与 Agent 通信。协议改动同步更新 `packages/shared/src/zcode-protocol/index.ts`，提供严格类型与运行时校验。
- Main 负责窗口、原生操作、进程调度和消息转发，不承载 task/session 业务状态。
- 每个窗口使用一个 window-scoped Local Host；本地 workspace 共享该 Host。远程 workspace 由窗口内的连接注册表管理，不另建 Desktop Remote Host。
- 手机远控连接桌面已有 Host attachment，复用会话运行时；不为手机另起 Agent、Local Host 或远程会话。
- Desktop 的 `desktop-continuous` 实时链路与手机的 `web-remote-replayable` 恢复链路必须明确区分。修改 stream、snapshot、queue 或重连时，同时验证两种语义。
- 外部 relay 与 Main 只做鉴权、配对、心跳、转发及 attachment 调度，不保存任务队列、快照等业务状态。
- 已接受的 busy/running 输入由 CLI/runtime `CommandInbox` 串行 admission；Renderer 只保留未提交草稿与 pending optimistic overlay，Host owner/lease 负责路由。
- 保留 owner/lease、跨 Host 路由和 stale run 防护，不能仅根据单一路径删除边界判断。

## Workspace Identity

- `workspaceIdentity` 用于身份隔离，`workspacePath` 用于文件操作、命令 cwd、Git 和路径展示。
- 身份 key 统一为 `workspaceIdentity?.trim() || workspacePath`，适用于去重、绑定、缓存、队列、持久化和请求关联。
- 远程链路贯穿传递 `workspaceIdentity` 与 `remoteSessionId`，不得仅按路径匹配。
- 新接口保留本地路径 fallback；远程 identity 复用现有构造和解析工具，不在业务代码中手写格式。

## 日志

- UI 使用 `packages/ui/src/logger.ts`，不直接使用 `console.log` 或 `window.zcode?.log`。
- Agent/session/runtime 相关服务日志使用 `createServiceLogger(scope)`（`packages/services/src/logger/serviceLogger.ts`）。
- `debug` 用于协议原始数据、流式 chunk 和逐条工具更新等高频诊断，生产环境不落盘。
- `info` 用于进程和会话生命周期、权限结果、一次性初始化等生产可用事件。
- `warn` 用于可恢复异常；`error` 用于崩溃、握手失败、鉴权丢失等不可恢复错误。
- 不在日志、示例或提交中写入凭据、真实用户数据和内部服务地址。
