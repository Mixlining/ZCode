# 厂商能力硬禁用

## 产品规则

本构建只支持**自带 API Key 接入**：用户自行配置供应商与模型端点，应用不再提供 ZCode 官方套餐
（Z.ai / BigModel Coding Plan）的任何能力，也不再主动请求厂商账号、套餐、额度、支付、社区、
反馈工单与厂商外链。

这条规则由 `packages/shared/src/env.ts` 里的常量表达。它们都是**编译期硬编码**的布尔常量，
不读取运行时环境变量，因此部署环境注入端点也无法重新启用：

| 常量                                | 值      | 负责的范围                                         |
| ----------------------------------- | ------- | -------------------------------------------------- |
| `ZCODE_VENDOR_ACTIONS_DISABLED`     | `true`  | 社区、反馈工单与附件、分享、产品文档与更新日志外链 |
| `CODING_PLAN_DISABLED`              | `true`  | 套餐域：界面、服务边界、启动账号恢复               |
| `REMOTE_ROLLOUT_DISABLED`           | `true`  | 远端灰度配置（含套餐侧 `dynamicWorkflow`）         |
| `MARKETPLACE_AUTO_REFRESH_DISABLED` | `true`  | 官方商店进入页面时的目录自动刷新                   |
| `ZCODE_TELEMETRY_ENABLED`           | `false` | 数仓事件与 ARMS RUM 出网                           |
| `MEMORY_DIAGNOSTICS_ENABLED`        | `false` | 内存诊断采样定时器                                 |

远程 workspace、手机远控与消息平台 Bot 的硬禁用由 `spec/remote-disable.md` 单独约束，
与上表是相互独立的轴。

Desktop Main 不加载或等待 ARMS 初始化，也不在窗口聚焦、OAuth 回调或启动后更新 ARMS 用户身份。关闭遥测时不允许以诊断名义创建 ARMS SDK、周期采样或远端上报。崩溃本地记录属于稳定性日志，仍保留。

Host 服务装配不创建没有注册或消费方的 commands、hooks、memory 服务对象；这些工厂与公开入口仍保留，真实请求路径按需调用。

### 明确保留的厂商读取（目录例外）

以下读取会请求厂商端点，但**有意保留**，因为它们提供的是内容目录而非账号事实：

- 内置供应商目录：`/api/v1/client/configs` 的 `builtin_provider_config_json`，由
  `providerSettingsService.refresh()` 触发。本地回退为 `config/provider/zcode-builtin.json`，
  其中含 4 个厂商模板与 16 个第三方模板；停用它会连第三方模板一起固定在旧版本。
- 插件市场目录与插件下载（CDN）。
- 用户自行配置的模型端点请求（自带 API Key 的正常业务流量）。

远程工作区运行资产下载（`cdn-zcode.z.ai`）**不再是例外**：远程 workspace 已在
`spec/remote-disable.md` 中整体硬禁用，该下载路径不再触发。

## 三层边界

禁用一个产品域必须同时在**三层**收口。只做界面隐藏会留下后台请求（历史问题即出于此），
只做服务边界会留下无效入口与误导性界面。

```text
1. 入口层   quick pick / 菜单 / 帮助弹窗 / IPC / 桌面命令
                 │  能力探测与命令执行都在这里直接短路，不发请求
                 ▼
2. 服务边界 usageStatsService / codingPlanSubscriptionService / offPeak / clientScenes
                 │  读取返回空值，动作返回中性值，不请求厂商，不写 warn/error 噪声
                 ▼
3. 启动恢复 OAuth 缓存会话、套餐权益与额度查询、账号来源解析
                 │  不读缓存账号、不认 OAuth 凭据、不查权益与定价
                 ▼
```

### 1. 入口层

- 桌面 `PlatformChannels.CanOpenCommunity` 直接返回 `false`；不得调用 `resolveCommunityUrl`，
  因而不得读取远端 help 配置。
- 桌面 `DesktopCommandIds.OpenFeedback` 入口即短路：不读远端配置，也不发送
  `PlatformChannels.OpenFeedbackDialog`（站内表单已无法提交，打开它只会误导）。
- 桌面 `resolveCommunityUrl` / `resolveFeedbackUrl` 自身也短路，避免任何新增调用方绕过入口守卫。
- Web 的 `canOpenCommunity` / `openCommunity` / `openFeedback` 与桌面同构。
- 入口**保留可见**（社区项除外，它由能力探测恒 `false` 自然不显示），点击后无反应；
  与 `helpMenuActions.ts` 既有写法一致。

### 2. 服务边界

`CODING_PLAN_DISABLED` 为真时：

- `usageStatsService` 的权益与额度读取返回**不可用空快照/空值**，不返回旧账户的缓存事实，
  使调用方无需 `try/catch` 即可安全降级。
- `codingPlanSubscriptionService` 的套餐、定价、支付、订单、协议方法返回空值/空列表，
  且**不写**失败日志——界面已隐藏，报错只会污染日志。
- 动作类方法的返回类型是具体接口（如 `CodingPlanAgreementResponse`），必须返回类型合法的
  中性值（空字符串/零值），不得抛出，也不得让调用方把空值误判为成功。
- 闲时任务整个域禁用：不再读取远端灰度配置（返回本地 disabled），入口不渲染，服务拒绝。
- `clientScenesService.list()` 返回空列表且**不写 warn 日志**；建议提示词与自动化模板为空，
  手动创建入口保留。

### 3. 启动恢复

- 启动时跳过**整个** OAuth 缓存会话恢复流程：不读缓存 `user_info`、不做账号刷新、
  不写 `welcomeScreenOpenReason`。
- **必须显式** `setIsRestoringOAuthSession(false)`。该标志的唯一写者就是这条恢复流程，
  漏写会让 `shouldBlockRootRender` 恒为真，启动画面永久挂住、工作区会话永不恢复。
- 账号来源解析不再信任本地 OAuth 凭据：不为 `oauth:active_provider` /
  `oauth:{zai,bigmodel}:access_token` 发起 `getCustomerInfo`、组织 `api_keys` 或套餐权益查询。
- 不删除凭据文件（删除不可逆）；旧凭据只是不再被读取。
- `providerSettingsService.refresh()` 仍照常执行（目录同步属保留例外）。

### 模型请求层

官方 Coding Plan 网关改写停用：指向 `open.bigmodel.cn` / `api.z.ai` 的 anthropic 端点
**直连用户配置的地址**，不再改写到 `zcode.z.ai/api/v1/ultra*`。否则自带 API Key 的请求
与凭证会流经厂商网关，与「只支持自带 API 接入」直接冲突。

## 状态所有者

| 状态                     | 唯一所有者                                                        |
| ------------------------ | ----------------------------------------------------------------- |
| 是否提供套餐（产品开关） | `packages/shared/src/env.ts` 的编译期常量                         |
| OAuth 登录态与恢复中标志 | `packages/ui/src/store/index.ts`，仅由 `useRootOAuthEffects` 写入 |
| 权益与额度事实           | `usageStatsService`（宿主侧），renderer 只经 it 读取              |
| 套餐商品与订单事实       | `codingPlanSubscriptionService`（宿主侧）                         |
| 闲时任务准入             | host `zcodeAgentService`（`offpeak_disabled`）                    |

## 闲时任务运行链路硬禁用

`CODING_PLAN_DISABLED = true` 时，闲时任务在 Host、Desktop Main、共用 scheduler 和 Agent CLI
均无运行入口。Host 不装配 `IOffPeakTaskService`、Repo、远端 client 或同步定时器；scheduler
不创建闲时任务 Repo 与在途/退避状态，不恢复、认领、计数、派发或以旧任务决定进程存活。
Main 不因闲时任务唤醒 scheduler，也不把闲时任务派发给 Host；Host 拒绝迟到或伪造的
`OffPeakRun`。CLI 不接受启用闲时工具的旧策略或会话参数，不注入 OffPeakPort。
Main 与 scheduler 的消息类型由 shared 统一声明，历史协议导入路径不再需要保留兼容。
`offpeak/create` 返回现有 `offpeak_disabled` 结果，`offpeak/list` 返回空列表；未注册的
直接服务 RPC 可以报告不可用，不得因此启动闲时任务资源。

```text
旧 off_peak_tasks 行 ── 保留原值；不恢复、不轮询、不派发、不结算
普通 cron 写入 ── Host 唤醒 Main ── 共用 scheduler 认领与派发 ── 无工作后自退
闲时任务入口 ── Host/CLI 硬禁用 ── 无 Repo、同步 timer、额外进程或远端请求
```

旧版数据库必须能直接升级：保留 `off_peak_tasks` 表、列、索引、历史迁移及其校验内容。
共享 tasks-index 迁移仍执行，但禁用时跳过会改写旧闲时任务状态行的 Repo 初始化修复；
旧行保持原值且不被读取或改写。这不是为将来恢复留路，而是数据库迁移完整性的要求：
表、列、索引与已发布迁移必须保持可升级，业务初始化修复不得改写这些历史行。
普通 cron 自动化与共享数据库准备流程保持可用。

遥测与内存诊断均硬关闭时，Agent CLI 保留 resident session 收敛和事件存储淘汰的
60 秒维护节拍，但不构造资源采样器、不读取 CPU/RSS/heap 或生成采样标识。

静态验收：无任务时 scheduler 沿现有机制自退；只有 cron 任务时正常派发；只有旧闲时
任务行时不延长 scheduler 存活、不改写旧行、不触发 Host 同步或 Agent 工具。
上述场景只记录为人工验收清单，不在本项目修改流程中运行应用、单测或 E2E。

## 验收场景

静态可验证：

1. `CanOpenCommunity` 的处理器体内不出现 `resolveCommunityUrl` 调用。
2. `openFeedback` 在读取远端配置之前返回。
3. `useRootOAuthEffects` 的早退分支显式调用 `setIsRestoringOAuthSession(false)`。
4. `usageStatsService` 与 `codingPlanSubscriptionService` 的每个方法在 `CODING_PLAN_DISABLED`
   为真时都有短路返回，且不出现 `throw` 与失败日志。
5. `providerSettingsService.refresh()` 路径仍会调用内置目录同步。
6. 空任务列表在重新验证时不回退到 loading 占位符，且前后都为空的列表复用同一数组引用。
7. 不带 `taskMeta`/`taskId` 的 bulk `workspace_task_list_changed` 事件按工作区去重。

运行时（人工）验证：

- 冷启动应用，网络面板中不出现 help/community 的 `/api/v1/client/configs` 读取，
  也不出现 `/api/biz/*`（账号、套餐、定价、支付、订单）与
  `/api/v1/coding-plan/reset/*`、`/api/v1/mcp/usage` 调用。
- 旧版本登录过的配置启动后侧边栏显示未登录，且不出现登录门禁永久 loading。
- 无任务工作区停留观察，侧边栏「任务」区不闪烁。

## 禁用是永久的

上表的豁免能力**永不恢复**。这些常量表达的是本构建的永久产品边界，不是临时开关：
后续改动不需要为「将来打开」预留入口、参数、分支或迁移路径，也不要写「恢复时改回」之类的
说明。唯一例外是 `MEMORY_DIAGNOSTICS_ENABLED`——它不是产品能力开关，而是排查内存增长时的
本地取证开关，默认保持 `false`，需要取证时才临时置 `true`。

### 为什么保留实现而不是删掉

被禁用能力的实现代码、组件、协议与 i18n 文案**保留**。理由不是留待恢复，而是**降低同步上游的
成本**：上游仍在持续改动这些文件，一旦删除，上游对它们的每次改动都会变成 modify/delete 冲突，
逐轮合并都要人工裁决；保留一份被守卫包住的实现，上游改动原逻辑时能自然合并。

由此产生三条修改约束：

1. **不要删除被禁用能力的实现文件。** 认为「反正不用」而清理掉，是下一轮合并冲突的来源。
   已删除的文件仅限以下三类，其余一律保留：ARMS 启动与专用共享源文件
   （`appARMSBootstrap.ts`、`armsEventRedaction.ts`、`armsUserIdentity.ts`、
   `armsRumShared.*`——ARMS 属另一条产品线，按要求整体删除，含其编译产物）、
   `useOffPeakTaskNotifications.ts`（闲时任务通知 hook），以及仓库无关的
   `.vscode/*` 与 `third-party/upstream/*.txt`。
2. **守卫写成「常量 + 原逻辑并列」，不要为了简洁重排原逻辑结构。** 守卫只是新增分支，
   原逻辑保持原本的写法与顺序，上游 diff 才能落在原逻辑上并被干净合并。
3. **不要新增第二套实现或兜底路径。** 禁用时直接在守卫处返回；不要再写一套「禁用版逻辑」，
   既会与上游漂移，也违反「一个所有者、一条路径」。

### 功能与资源：两个都必须「完全禁用」

禁用必须同时满足两个维度，缺一不可：

| 维度             | 要求                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| **功能完全禁用** | 无任何可用入口与生效路径：界面触发、IPC/命令、服务装配、启动恢复四类入口全部在源头短路。       |
| **资源零占用**   | 不新增进程/线程/协程，不留定时器、轮询、重连、订阅与常驻缓存，不忙等、不空转，也不让别处空转。 |

**从源头禁用，而不是在半路拦截。** 优先级从高到低：

1. **不构造**：服务装配、对象构造处直接跳过。这是最彻底的一层——不构造就不会挂监听、
   不会分配内部集合、不会起预热。典型：`createLocalServices` 不注册 `IBotsService`，
   同时不构造其远端桥接（该桥接构造即 `parentPort.on("message")`）。
2. **不注册**：无法避免构造时，至少不注册常驻监听/订阅（`setInterval`、`on("message")`、
   广播订阅、IPC 事件订阅）。判据是「事件的发送方是否也随之禁用」——发送方不存在时，
   订阅就是纯空跑，应在注册处跳过。
3. **不进入**：UI 触发、IPC handler、命令入口、启动恢复在**源头**返回。
   打开一个会探测环境的弹窗、进入一个会建连的向导，都算进入——弹窗挂载本身就可能
   spawn 子进程或发请求，必须在打开它的动作处拦住，而不是在弹窗内部逐项判断。
4. **半路拦截（仅作纵深防御）**：在已进入的路径上逐层返回。这层可以保留以免遗漏调用方，
   但**不能只做这一层**——它意味着资源已经付出（进程已 spawn、定时器已起、请求已发）。

**空转与忙等**：禁用后不允许任何周期性或条件性空跑。具体判据——
没有消费者的事件订阅、永不触发的重连与轮询、靠超时兜底的探测、为已禁用能力保留的
定时器/采样器/健康检查，都属于空转，必须在源头关掉。scheduler 的「无待触发工作时自退、
需要时唤醒」是既有正确机制，不属于空转，保持不动。

**不要用超时兜底禁用**：禁用判定必须是编译期常量，不能写成「等一会儿没响应就当禁用」。
超时会把禁用变成延迟 + 噪声（例如调用未注册的 RPC channel 会等满 `ChannelServer` 超时
才 reject，并在 Host 留下 `Unknown channel` 日志），既不是完全禁用，也白白占用时间。

## 已知的间接守卫（复核要点）

以下出口**没有**自己的常量判断，只依赖调用方在 `ZCODE_TELEMETRY_ENABLED` 关断时不装配
上报 context。当前不可出网，但新增调用方即可绕过，属复核时要盯住的薄弱点：

- `packages/desktop/src/main/desktopResourceTelemetry.ts` 的 `reportResourceCustom`
  与 `ingestToolExecResource`：只判断 `globalContext`，而该变量唯一写点是
  `configureDesktopResourceTelemetry`，只在 `main/index.ts` 的
  `if (ZCODE_TELEMETRY_ENABLED && ZCODE_ARMS_RUM_ENDPOINT)` 内调用。
- `packages/desktop/src/main/desktopNetworkTelemetry.ts` 的 `reportNetworkCustom`
  与 `ingestHostNetworkObservations`：同构，context 由
  `configureDesktopNetworkTelemetry` 在同一守卫内装配。

给这两处新增调用方前，必须确认它不在关断路径上；不要用「反正不会出网」代替判断。

`packages/desktop/src/preload/index.ts` 仍保留 `scheduleArmsEventBridgePatch()` 调用，
但构建已无 `appARMSBootstrap`，`window.ArmsEventBridge` 永不建立、也没有
`arms:rum-bridge` IPC 处理器，因此不会上报；不要因为该调用仍在就认为 ARMS 已启用。

## 上游同步复核清单

每次把上游并入本分支后，除 `AGENTS.md` 的通用要求外，按此清单核对本 spec：

1. `git diff <merge-base> <merged> -G'ZCODE_TELEMETRY|ARMS|RUM|telemetry'` 为空，
   或新增命中项全部位于守卫内。
2. 上表六个常量值未被回退，且 `spec/remote-disable.md` 的三个常量同样未被回退。
3. 新代码没有为已禁用能力新增常驻子进程、定时器、长轮询、重连或采样器。
4. `off_peak_tasks` 的表/列/索引/已发布迁移与校验值保持字节不变。
