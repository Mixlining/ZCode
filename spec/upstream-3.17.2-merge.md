# v3.17.2 个人分支同步与适配

## 基线与产品边界

- dev 基线 `0ae5e3d4`，合入 main / origin/main 的 `a9fe401e`（3.17.2）。使用真实 merge，逐处裁决冲突，保留既有 dev 定制。
- 版本跟随上游 3.17.2；Electron 44.7.2、pnpm 11.27.1、Node 24.21.0 与现有打包、默认市场源策略保持。
- `spec/vendor-disable.md` 与 `spec/remote-disable.md` 的全部编译期硬禁用继续成立；实现、协议、文案与上游验收资产保留，已删除的 ARMS 模块不恢复。
- 接收本地 HTML 预览、草稿 MCP 页面、会话重启与 fork 归属、权限收紧、工具与打包改进。新入口同样受官方鉴权、Sites、遥测、远程与 Bot 禁用约束，不为禁用域构造资源或注册监听。
- 只提交到 dev，不打 tag、不 push。只做静态检查及必要工程门禁，不启动应用、不运行 App 单测/E2E、不构建制品。

## 所有者与接口

- 产品开关唯一来源为 shared/env.ts；独立 .mjs 保留已有硬编码决策，不增加运行时开关。
- CLI 持有正文、执行与权限事实；Host 持有项目/分组组织态，fork ACK 返回 UI 前经既有 project repository 完成归属交接，duplicate 重放幂等，不覆盖用户后续移动。
- 草稿预热仍由 DraftSessionPrewarmCoordinator 管理；页面持有显式 retain，关闭/失效释放，首发提升脱离草稿槽位。UI store 只管理打开请求与展示投影，不持有第二份已接受输入队列。
- 本地浏览器协议由 Desktop Main 注册，文件读写走现有平台边界；普通 Web `/ws`、自配模型、手动插件与普通 cron 保留。
- MCP 设置探测的新工作区路由不能恢复官方鉴权：Host 不装配官方身份解析器/可信来源/发放审计，反向请求在入口返回既有不可用结果，凭证边界在读盘前短路。
- 上游 `0010_remote_task_ownership` 迁移登记、描述与校验输入原样保留；`REMOTE_WORKSPACE_DISABLED` 时在业务 apply 源头返回，不扫描/修复旧远端任务。本地首次归属与 fork 逻辑保持。

```text
CLI fork 正文提交 → Host project repository 归属事务 → ACK → Renderer 打开
草稿 owner → 页面 retain → 首发提升为正式会话 / 页面关闭释放
迁移 runner → 保留 ledger/checksum → 远程硬禁用时跳过业务修复
```

## 冲突裁决与静态复核

- Main：合入本地预览协议，同时保留遥测与手机推送/日志的源头守卫，不恢复 ARMS、附件桥、远端连接装配。
- SessionPane：接收草稿 MCP 生命周期与页面路由，保留 Coding Plan/Highspeed/分享守卫及零订阅策略。
- 浏览器 helper：接收预览 URL 解码，保留默认浏览器协议白名单。
- 规格文档：合入新行为，保留 dev 默认市场源与硬禁用说明；E2E 资产接收上游。
- lockfile：按现有 workspace manifest 与 pnpm 11.27.1 重新解析冲突，保持 dev 工具链版本。
- 复核新增/移动的网络、定时器、订阅、缓存、进程启动及官方鉴权调用，核对开关引用与已发布迁移未回退。
- 上游 MCP 鉴权运行时夹具传入当前服务未公开的 `mcpStatusIdleTimeoutMs`，导致根类型检查失败；移除该参数，并将夹具退出等待预算对齐现有 60 秒控制面回收阈值，不向生产构造选项新增测试参数。

## 验收场景

静态核对所有正反路径；下列运行时场景留作人工专项验收，本任务不启动应用：

1. 自配模型下普通本地会话、重启与 fork 可用；fork 保留 cwd、identity、父项目与执行目录快照，重放不改已移动归属。
2. 从手动安装的界面插件打开草稿页面，首发继续使用同一会话；关闭页面或切换工作区后旧请求不误开另一草稿，不遗留预热资源。
3. 本地 HTML 经内置浏览器受控协议打开，系统浏览器仍使用原始 file URL；普通 Web 能力保持。
4. 旧 OAuth、Sites、Data Sync、远程 workspace、手机远控、Bot、闲时任务与遥测数据均不能触发入口、鉴权出网、预热、轮询或采样。
5. 旧数据库正常升级；已发布迁移与闲时任务行不改写；远端归属修复在硬禁用时不读写业务行。
6. 默认个人市场不补种，目录不自动刷新，用户手动市场/下载与自配端点请求保持可用。

## 验证记录

- `pnpm typecheck` 与 Desktop Main `pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit` 通过。首次根检查暴露上述夹具参数错误，修正后完整重跑通过。
- `pnpm lint`（oxlint）：0 error / 0 warning；`pnpm fmt:check` 通过。
- `pnpm architecture:check --changed`：0 violation / 0 baseline / 0 new；工作区及暂存区 `git diff --check` 通过。
- `pnpm db:schema:check`：8 个 schema 门禁用例通过，两库 schema baseline 兼容。
- `pnpm docs:stale-phrases:check` 通过；`check:e2e-remote-targets` 因私有队列不存在按既有规则跳过。
- 定向工程检查：`packagedPlatformDependencyPrune`、`packagedSourcemapCleanup`、`electronBuilderSecurity` 三个文件，18 用例全部通过。
- `pnpm test:architecture`：50 通过、1 跳过（Windows 文件模式检查），0 失败。首次运行把临时目录放在工作区内，未初始化 Git 的夹具向上识别到了真实父仓库；设置仅限检查进程的 `GIT_CEILING_DIRECTORIES` 隔离临时目录后完整重跑通过，不修改测试或 Git 配置。
- 静态对照：shared/env、mise、workspace manifest、Desktop manifest、默认市场源、既有任务迁移与闲时 Repo 七个文件相对原 dev 未变；116 个修改的存量源码保留全部硬禁用常量引用。新增迁移校验描述与 main 一致，ARMS bootstrap 仍不存在。
- 验证使用工作区 `.tmp` 内独立 Node 24.21.0；系统 Node、全局配置不变。临时工具与日志不入库。未启动应用、未运行 App 单测/E2E、未执行制品编译或打包。

## 静态消融记录

- 保留官方鉴权的装配、请求入口、凭证边界三层守卫：去掉装配守卫会创建无消费方缓存；去掉请求守卫会解析无效路由并产生噪声；去掉凭证边界会让额度等其他消费方仍能读取旧登录信息。复用既有不可用结果，不增加服务、开关或缓存。
- 请求守卫放在路由前，移除后段重复判断；官方发放审计只在非禁用分支构造。
- 保留远端修复函数的单一源头守卫：不改迁移 ID、校验描述或 runner；移除会启动业务扫描。共享迁移备份/ledger 继续执行，本地任务归属不增加替代路径。
- 保留草稿失效通知的名单快照：回调可能同步释放其他持有者，直接遍历可跳过本代通知；改用命名快照并说明原因，消除 lint 告警，不引入另一份持久状态。
- 删除上游夹具无效的构造参数与未使用常量，不为验收增加生产配置；沿用现有控制面空闲阈值。
- 相对自动合并内容，四个服务文件的边界适配净增 21 行；草稿快照说明净增 2 行，验收资产清理净减 1 行，合计源码/验收资产净增 22 行（不含上游增量、文档与格式归一化）。上述精简后已重跑类型、Desktop Main、lint、格式、架构及 diff 检查。
