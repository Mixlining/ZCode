# Desktop Main 静态契约

## 规则与所有权

- Desktop Main 的独立 TypeScript 检查必须覆盖窗口、浏览器、存储及下载等入口；类型错误不能因为根工程检查通过而被视为通过。
- Main 创建 Local Host 的初始化消息必须包含内置供应商配置文件路径。窗口生命周期只生成其余字段，由 Main 的进程装配入口补齐路径后再发送给 Host。
- 跨包类型从公开入口导入；共享消息类型以 `@zcode/shared` 为事实源。类型修复不得新增运行时导入、常驻进程、轮询或遥测。
- 远程文件下载必须在请求前检查全部 DNS 解析结果，并将通过检查的地址绑定到实际连接；缺少下载数据时不得继续写入。
- 浏览器动作按判别字段缩小类型后执行；关闭或已销毁的页面不能继续派发动作。

## 静态验收

1. `pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit --pretty false` 的诊断按文件与原因归类；修复后与原有 81 条诊断比较。
2. 窗口创建消息的必需字段由 Main 补齐，Host 接收的完整消息类型保持严格。
3. DNS 校验与连接地址绑定、浏览器动作分支、已销毁页面处理保持上述规则。
4. 只运行静态检查，不运行应用、单测、E2E 或构建。

## CI 静态门禁

- `.github/workflows/check.yml` 的 Typecheck job 先运行现有根 `pnpm typecheck`，再在同一 job 运行 Desktop Main 的 `tsc --noEmit`。后一步依赖前一步生成的 shared/services 声明；两步必须顺序执行，不新增桌面制品构建。
- Windows 发布工作流在现有根类型检查之后也执行 Main 的无输出检查，避免长时间打包之后才发现 Main 类型错误。
- CLI bootstrap 的本地 `tsc --noEmit` 虽通过，但它依赖多个 CLI workspace 包的 `dist/*.d.ts`。这些声明不入库，干净的 CI 安装又跳过构建脚本；本次不能把该命令直接作为 PR 门禁。保持 CLI 构建/类型检查策略不变，待建立无产物的依赖解析入口后再加入。
- 两个 workflow 都通过 `jdx/mise-action` 读取根目录 `mise.toml`，固定 Node `24.14.0` 和 pnpm `10.33.2`；这是项目工具链版本。GitHub Action 自身的 Node runtime 独立于项目 Node，应使用支持 Node 24 的 checkout、cache 和 artifact action。
- pnpm store 按 runner OS 与 `pnpm-lock.yaml` 哈希恢复。恢复与保存分开：依赖安装成功后立即保存 store，使后续类型检查或桌面打包失败也不会丢失已下载依赖。矩阵 job 并发争用同一 key 时允许一个 job 保存，其他 job 复用已存在条目。
- Electron 与 electron-builder 缓存按 runner OS 和桌面依赖恢复；安装器构建尝试结束后执行显式保存，使构建失败时已下载的文件仍能缓存。缓存 action 会跳过空目录。首次运行的 `Cache not found` 是冷缓存提示；已保存的相同 key 可在同一分支/ref 内恢复。
- GitHub 将 tag 缓存按 tag 名隔离，两个不同 release tag 不能互相读取缓存；tag 可以读取默认分支缓存。要让首次 release tag 也命中 Windows 缓存，应先在默认分支运行现有 `workflow_dispatch` 编译工作流一次，此后各 tag 可复用默认分支缓存。

## 本次诊断处理

- 81 条原有 Main 诊断中，窗口初始化消息、公开类型入口、下载地址与数据校验、浏览器动作与页面生命周期、存储 Worker 类型、Chrome helper 进程类型等均可按现有所有者修正；保持现有运行顺序和进程数量。
- ARMS 是远程遥测。当前构建删除 Main 的 ARMS 启动模块与专用共享源文件，不等待 SDK 初始化，也不更新 ARMS 用户身份；其他遥测入口继续由编译期关闭开关约束。
- 实时流的 `taskStreamMirrorableEventSchema` 只校验公共字段并允许额外字段，不能证明解码后的对象满足 `TaskStreamMirrorableEvent` 的全部分支。两个 Host 消息分发调用点沿用既有宽松运行时协议，按用户授权使用有原因的 `@ts-expect-error` 标记这项已知类型债务，不用 `as` 强制断言，也不改变消息内容或校验行为。后续类型契约对齐后，这两个标记必须因变成未使用而被移除；收紧协议时须保持 Desktop 实时流与手机恢复流的兼容性。
