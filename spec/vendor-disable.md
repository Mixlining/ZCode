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

### 明确保留的厂商读取（目录例外）

以下读取会请求厂商端点，但**有意保留**，因为它们提供的是内容目录而非账号事实：

- 内置供应商目录：`/api/v1/client/configs` 的 `builtin_provider_config_json`，由
  `providerSettingsService.refresh()` 触发。本地回退为 `config/provider/zcode-builtin.json`，
  其中含 4 个厂商模板与 16 个第三方模板；停用它会连第三方模板一起固定在旧版本。
- 插件市场目录与插件下载（CDN）。
- 远程工作区运行资产下载（`cdn-zcode.z.ai`）。
- 用户自行配置的模型端点请求（自带 API Key 的正常业务流量）。

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

## 恢复步骤

1. 把上表中需要恢复的常量改回 `false`。
2. 恢复 `CODING_PLAN_DISABLED` 时，需同时确认三层守卫都能编译通过：入口层短路分支、
   服务边界短路分支、启动恢复早退分支都是「守卫 + 原逻辑」并列结构，删守卫即可复原。
3. 不需要恢复被删除的模块——本方案只加守卫，不删除组件、i18n 或服务实现。
