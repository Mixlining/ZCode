# 2026-11 依赖升级与 OTel 移除

## 背景

本规范记录 2026-11 的第三方依赖升级方案。目标是在不跨 major、不引入大范围接口变更的前提下，升级桌面版及其运行链路，并移除所有第一方 `@opentelemetry` 声明与运行时使用。

关键约束：

- 只做当前 major 内的低风险升级；Electron 45、TypeScript 7、undici 8、tsup 9、`@electron/asar` 4、`dotenv` 18、`@types/yauzl` 3、`ai` 7 等跨 major 项不在本轮。
- 本机全局 Node 不变；项目 pin 同步到 Node `24.22.2`，与 Electron `44.10.2` 内置 Node 一致。
- `ZCODE_TELEMETRY_ENABLED = false`、ARMS 现状与既有硬禁用边界不变。
- `ai@6.x` 硬依赖 `@opentelemetry/api`，`ai@7` 才移除该依赖。本轮接受 `ai@6` 的传递依赖，验收口径为“无第一方声明、无运行时 OTel import”，不是“依赖图零 `@opentelemetry`”。
- Desktop 的 `react-scan` devDependency 还会通过 `react-doctor → @sentry/node` 引入 dev-only OTel 链；生产 inventory 不覆盖 devDependencies，但 `pnpm why @opentelemetry/api` 会显示它。验收时必须区分生产与 dev。
- 本轮只做静态检查，不启动应用、不运行 App 单测、不运行 E2E、不构建制品。

## 决策记录

| 决策                | 结论                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| OTel 范围           | 桌面 + CLI 全量移除第一方声明与运行时使用；`@zcode/telemetry` 保留包名/接口，改为 no-op                                              |
| `ai` 传递依赖       | 接受 `ai@6` 的 `@opentelemetry/api` 传递依赖；不升 `ai` 7，不删 `ai`                                                                 |
| Node pin            | `mise.toml`、根 `.nvmrc`、CLI `.nvmrc/.node-version`、engines 全部到 `24.22.2`；本机全局 Node 不动                                   |
| Playwright / WDIO   | Playwright `1.64.1`、WDIO `9.33.1` 纳入；`wdio-electron-service` 保持 `9.2.1`                                                        |
| zod                 | 全仓 zod 4.x 精确版本统一到 `4.6.7`；zod 3 不动                                                                                      |
| MCP                 | client/core/server `2.4.0`、ext-apps `2.0.4`、sdk `1.32.2` 全仓同步                                                                  |
| Node 库             | `@types/node` 25.x 声明统一到 `25.9.9`；CLI `^24.0.0` 留 24.x；`node-abi` override `4.40.0`                                          |
| GitHub CI           | 三个 workflow 零改动；Docker E2E 的 Node 24.14/pnpm 10.33 漂移只记录，不本轮处理                                                     |
| UI wrapper          | `@zcode/ui` 的 `runUserAction/startUserAction` 保留，改为 no-op；删除 desktop main/renderer 的 OTel 传输链路                         |
| Renderer local TTFT | 保留 `packages/desktop/src/renderer/src/local-ttft` 模块与 architecture policy 条目；`initialize.ts` 改为 no-op；local-logs E2E 退役 |
| 策略例外            | 在 `AGENTS.md` 与 `spec/vendor-disable.md` 显式记录 OTel 移除是对“保留禁用实现”规则的例外                                            |

## 版本矩阵

### 工具链

| 依赖                    |            当前 |    目标 |
| ----------------------- | --------------: | ------: |
| Node（mise + 全部 pin） |         24.21.0 | 24.22.2 |
| Electron                |          44.7.2 | 44.10.2 |
| electron-builder        |         26.17.0 | 26.18.0 |
| electron-updater        |          6.8.10 |  6.8.11 |
| electron-to-chromium    |         1.5.452 | 1.5.477 |
| node-abi override       |          4.37.0 |  4.40.0 |
| @types/node（25.x）     |          25.6.0 |  25.9.9 |
| TypeScript              |           6.0.2 |   6.0.3 |
| oxlint                  | 1.60.0 / 1.67.0 |  1.91.0 |
| pnpm                    |         11.27.1 |    不变 |

### 桌面运行时与构建

| 依赖                            |    当前 |     目标 |
| ------------------------------- | ------: | -------: |
| React / React DOM override      |  19.2.7 |   19.3.1 |
| @types/react                    | 19.2.14 |   19.3.0 |
| @types/react-dom                |  19.2.3 |   19.3.0 |
| Vite                            |   8.0.8 |    8.3.6 |
| @vitejs/plugin-react            |   6.0.1 |    6.2.1 |
| tailwindcss / @tailwindcss/vite |   4.2.2 |    4.3.4 |
| @babel/runtime                  |  7.29.7 |  7.29.13 |
| @types/semver                   |   7.7.1 |    7.8.0 |
| @types/ws                       |  8.18.1 |   8.18.2 |
| node-forge                      |   1.4.0 |    1.4.3 |
| semver                          |   7.7.4 |    7.8.6 |
| ws                              |  8.20.0 |   8.22.1 |
| yaml                            |   2.9.0 |    2.9.1 |
| yauzl                           |   3.3.0 |    3.4.0 |
| undici                          |  6.24.1 |   6.29.1 |
| @puppeteer/browsers             |  2.13.0 |   2.13.2 |
| playwright-core                 |  1.59.1 |   1.64.1 |
| @wdio/\* / webdriverio          |  9.27.0 |   9.33.1 |
| wdio-electron-service           |   9.2.1 |     不变 |
| @wdio/electron-types            |   9.2.1 |     不变 |
| MCP client/core/server          |   2.0.0 |    2.4.0 |
| MCP ext-apps                    |   2.0.0 |    2.0.4 |
| @modelcontextprotocol/sdk       |  1.29.0 |   1.32.2 |
| zod（4.x）                      |   4.6.5 |    4.6.7 |
| @opentelemetry/\* 第一方声明    |   14 个 | 全部移除 |

## 任务拆分

### T1：工具链与 Node pin

文件：

- `mise.toml`
- `.nvmrc`
- `apps/zcode-cli/.nvmrc`
- `apps/zcode-cli/.node-version`
- 根 `package.json`：`engines.node` → `>=24.22.2`
- `apps/zcode-cli/package.json`：`engines.node` → `24.22.2`
- `README.md`、`README.en.md`
- `GITHUB-ACTIONS.md`
- `docs/development-mise-runtime.md`
- `spec/desktop-main-static-contracts.md`
- `spec/toolchain-electron44-pnpm11.md`
- `third-party/runtime/sources.json` + Node 24.22.2 LICENSE 文件

要求：

- 全局 Node 不变；不执行 `mise install`。
- `third-party/runtime` 增加 Node `24.22.2` 条目与对应 LICENSE/sha256。Node 24.22.2 与 24.21.0 的 LICENSE 原文相同，仍需独立文件和 sha256 记录。
- 历史 `spec/upstream-*.md` 与 `docs/electron/electron-44-upgrade.md` 的旧 smoke 证据保留，不重写历史；只更新“当前 pin”段落。
- 本机 Node 24.22.1 低于目标 `24.22.2`，`pnpm install` 的 engine 警告是预期现象，不视为失败。

### T2：Electron / builder / 原生模块

文件：

- `packages/desktop/package.json`
- `pnpm-workspace.yaml`
- `scripts/electron-builder-binaries-macos.json`
- `packages/desktop/test/electronBuilderSecurity.test.ts`
- `packages/desktop/test/e2eElectronBinary.test.ts`
- `packages/desktop/test/chromedriverPreflight.test.ts`
- `packages/desktop/scripts/prepare-agent-node-bundle.mjs`
- `packages/desktop/scripts/bundled-npm-assets.mjs`
- `docs/electron/electron-44-upgrade.md`
- `docs/electron/electron-builder-26.17-upgrade.md`

要求：

- Electron `44.10.2`、electron-builder `26.18.0`、electron-updater `6.8.11`、electron-to-chromium `1.5.477`。
- `pnpm-workspace.yaml` 同步 `electron-to-chromium` override、`node-abi` override `4.40.0`、React override `19.3.1`。
- `scripts/electron-builder-binaries-macos.json`：
  - toolchain 更新到 `26.18.0`；
  - 资产已核对不变：`dmg-builder@1.2.5`、`7zip@1.0.0` 及现有 size/sha256 保持；
  - 注释从 26.17 更新到 26.18。
- `electronBuilderSecurity.test.ts` 的五处断言全部更新：
  - Electron `44.10.2`
  - `electron-builder` `^26.18.0`
  - `electron-updater` `^6.8.11`
  - installed builder `26.18.0`
  - installed updater `6.8.11`
- `e2eElectronBinary.test.ts`：Electron `44.10.2` → Chromium `152.0.7977.169`。
- `chromedriverPreflight.test.ts`：
  - 两处 `electronVersion: "44.7.0"` 输入都改为 `44.10.2`；
  - cache 记录路径 `zcode-chromedriver-44.7.0-linux.json` 同步改为 `44.10.2`；
  - Chromium fixture 改为 `152.0.7977.169`；
  - `152.0.7977.82` 的 patch 级 fixture 保持不变。
- `prepare-agent-node-bundle.mjs` 与 `bundled-npm-assets.mjs` 中 Electron 44 / Node 24.21 的注释更新到 Node 24.22。
- `docs/electron/electron-44-upgrade.md` 与 `electron-builder-26.17-upgrade.md` 更新当前 pin；旧 smoke/artifact 证据标注为历史，不删除。
- `spec/toolchain-electron44-pnpm11.md` 的 Electron `44.7.2` / `44.5.1–44.7.2` 当前状态段落同步到 `44.10.2` / `44.7.2–44.10.2`；历史证据保留。
- `node-pty` 保持 1.1.0；`@lydell/node-pty-*` 保持 `1.2.0-beta.10`。

### T3：TypeScript、zod、MCP、oxlint

文件：

- 所有 `^6.0.2` 的 `typescript` 声明改为 `^6.0.3`；`packages/rpc` 的 `^5.9.3` 与 CLI 的 `^5.9.0` 不动。
- 所有 zod 4.x 精确 `4.6.5` 改为 `4.6.7`；zod 3 不动。
- MCP 全仓同步：client/core/server `2.4.0`、ext-apps `2.0.4`、sdk `1.32.2`。
- 根 `package.json` 与 `apps/zcode-cli/package.json` 的 `oxlint` 改为 `^1.91.0`；`oxfmt` 不变。

要求：

- `@types/node` 25.x 声明（根、e2e-report、provider-node、server、services、stream-animate、zcode-server-cli）统一到 `25.9.9`；CLI 的 `^24.0.0` 保持 24.x，不升 25。
- 不改变 `@modelcontextprotocol/sdk` 的 1.x major。
- 不手改 `packages/desktop/bundled-agents/**` 生成产物。
- `apps/zcode-cli/packages/tui/package.json` 的 React/React DOM 精确 pin 更新到 `19.3.1`；其 `ws: 8.18.0` 与 `@types/react: 19.2.0` 属 CLI 独立工具链，本轮保持不动并记录。
- `apps/zcode-cli/packages/debug/package.json` 的 Vite 7 / `@vitejs/plugin-react` 5 保持不动。

#### T3.1 MCP 2.4.0 的 zod 收口

`@modelcontextprotocol/client/core/server@2.4.0` 声明 `zod: ^4.2.0`。旧 lockfile 会把它们的嵌套 zod 保留在 `4.6.5`，而工作区第一方包已升到 `4.6.7`，从而在 `src/mcp/server.ts` 的 `registerTool` 重载中出现 `StandardSchemaWithJSON` 与 `ZodRawShape` 双重 zod 类型不兼容，导致 `@zcode/android-emulator-plugin` / `@zcode/ios-simulator-plugin` 的 `tsc && build-mcp.mjs` 失败。

修复：

- 在根 `pnpm-workspace.yaml` 与 `apps/zcode-cli/pnpm-workspace.yaml` 同时增加 scoped overrides：
  ```yaml
  "@modelcontextprotocol/client>zod": 4.6.7
  "@modelcontextprotocol/core>zod": 4.6.7
  "@modelcontextprotocol/server>zod": 4.6.7
  ```
- 不使用全局 `zod: 4.6.7` override，避免破坏 `apps/zcode-cli/packages/contracts` 的 zod 3。
- 重新生成两个 lockfile 后，确认 `node_modules/@modelcontextprotocol/core/node_modules/zod` 与 CLI 对应路径不再存在（或为 4.6.7），并运行两个插件的 `build` 验证。

### T4：桌面运行时依赖

**重要：只跑 `pnpm install` 不会把仍在 range 内的依赖升到目标版本。** 必须对每个目标包执行以下之一：

- 把 manifest 的 range 下限抬到目标版本（例如 `^8.3.6`、`^7.29.13`、`^25.9.9`、`^9.33.1`），或
- 在对应 workspace filter 下执行 `pnpm update -r <pkg>@<target>`，并确认 lockfile 解析到目标版本。

验收以 `pnpm list` / lockfile 解析结果为准，不以 manifest 文本为准。

必须显式抬高的 range floor（仅靠 install 不会更新）：

- `apps/zcode-cli/packages/node-repl-host/package.json`：`zod ^4.4.3` → `^4.6.7`（CLI lockfile 当前解析 4.4.3）。
- `packages/zcode-cua/package.json`：`@modelcontextprotocol/sdk ^1.27.1` → `^1.32.2`（root lockfile 当前解析 1.29.0）。
- 根 `package.json`：`yaml ^2.9.0` → `^2.9.1`。
- `packages/zcode-server-cli/package.json`：`ws ^8.20.0` → `^8.22.1`，`yauzl ^3.3.0` → `^3.4.0`，`@types/ws ^8.18.1` → `^8.18.2`。
- CLI adapters 的 `@types/semver` 若仍为 `^7.7.1`，抬到 `^7.8.0`。
- `packages/desktop`、`packages/ui`、`packages/e2e-report` 的 `@types/react` / `@types/react-dom` range floor 抬到 `^19.3.0`。
- `packages/desktop`、`packages/shared`、`packages/server` 的 `@types/ws` 抬到 `^8.18.2`；`packages/desktop` 的 `@types/semver` 抬到 `^7.8.0`。
- 其余目标包（electron-builder/updater、node-forge、semver、ws、yaml、yauzl、undici、@types/semver 等）同样要把 manifest floor 抬到目标版本，或用精确 `--filter` 更新；不得只跑 `pnpm install`。

**禁止无过滤 `pnpm update -r`**：它会顺带升级 `typescript`（CLI `^5.9.0` / rpc `^5.9.3` 必须保持）、`@types/node`（CLI `^24.0.0` 必须保持）、`zod`（`apps/zcode-cli/packages/contracts` 的 zod 3 必须保持）、`ws` / `@types/react`（`tui` 的精确 pin 必须保持）、`vite` / `@vitejs/plugin-react`（`apps/zcode-cli/packages/debug` 的 Vite 7 / plugin-react 5 必须保持）。使用 manifest 编辑或精确 `--filter` 更新。

文件：

- `packages/desktop/package.json`
- `packages/ui/package.json`
- `packages/services/package.json`
- `packages/server/package.json`
- `packages/shared/package.json`
- `packages/provider/package.json`
- `packages/provider-node/package.json`
- `packages/zcode-cua/package.json`
- `packages/web/package.json`、`apps/dev-docs/package.json`、`packages/e2e-report/package.json`、`packages/stream-animate/package.json`、`packages/web-share/package.json`、`packages/share-ui/package.json`、`packages/formal-proof/package.json`
- CLI Playwright pins：`apps/zcode-cli/packages/adapters`、`cli`、`browser-use-plugin`、`office-runtime`

要求：

- React/React DOM override 19.3.1；精确 pin 的 `share-ui`、`web-share`、`office-runtime`、`tui` 同步到 19.3.1。
- Vite 8.3.6、@vitejs/plugin-react 6.2.1、tailwind 4.3.4；`apps/zcode-cli/packages/debug` 保持 Vite 7 / plugin-react 5。
- @babel/runtime 7.29.13、@types/semver 7.8.0、@types/ws 8.18.2。
- node-forge 1.4.3、semver 7.8.6、ws 8.22.1、yaml 2.9.1、yauzl 3.4.0、undici 6.29.1。
- @puppeteer/browsers 2.13.2、playwright-core 1.64.1（所有精确 pin）。
- @wdio/\* 与 webdriverio 9.33.1；`wdio-electron-service` 与 `@wdio/electron-types` 保持 9.2.1。
- 更新 `docs/browser-use/2026-07-10-browser-use-spec.md` 与 `docs/browser-use/2026-07-13-cli-headless-cdp-backend-spec.md` 的 Playwright pin 说明；明确 1.64.1 相对 1.59.1 的 `ariaSnapshot` 行为差异属于本轮接受的残余风险，静态检查不覆盖浏览器行为。
- 升级后运行 `pnpm update -r` 仅限目标包，避免顺带升 `ai`、`radix`、`lexical` 等未列入本轮的 UI 依赖。

### T5：@opentelemetry 移除

#### T5.1 删除声明

`packages/desktop/package.json` 删除：

```text
@opentelemetry/api
@opentelemetry/exporter-metrics-otlp-proto
@opentelemetry/exporter-trace-otlp-proto
@opentelemetry/resources
@opentelemetry/sdk-metrics
@opentelemetry/sdk-trace-base
```

`apps/zcode-cli/packages/telemetry/package.json` 删除：

```text
@opentelemetry/api
@opentelemetry/context-async-hooks
@opentelemetry/exporter-metrics-otlp-proto
@opentelemetry/exporter-trace-otlp-proto
@opentelemetry/otlp-exporter-base
@opentelemetry/resources
@opentelemetry/sdk-metrics
@opentelemetry/sdk-trace-base
```

同时从 `packages/desktop/package.json` 删除 `module-details-from-path`（当前无源码 import，仅 OTel instrumentation 链使用）。

#### T5.2 Desktop main / renderer / preload

删除：

- `packages/desktop/src/main/localTtftExporter.ts`
- `packages/desktop/src/main/localTtftSpans.ts`
- `packages/desktop/src/main/localTtftExportDedupe.ts`
- `packages/desktop/src/main/rendererActionTraceExporter.ts`
- `packages/desktop/src/main/rendererActionTraceBroker.ts`
- `packages/desktop/src/main/rendererActionTraceIpc.ts`
- `packages/desktop/src/main/rendererActionTraceRollout.ts`
- `packages/desktop/src/renderer/src/userActionTraceBootstrap.ts`
- `packages/shared/src/rendererActionTrace.ts`

修改：

- `packages/desktop/src/main/index.ts`：删除 local TTFT exporter / renderer action trace 的 import、构造、shutdown、IPC 注册与 `ReportLocalTtftBatch` listener；**保留** `flushLocalTtftLogs()` 与本地 TTFT 日志队列（hard-disable 下无生产者，队列为空）。
- `packages/desktop/src/renderer/src/main.tsx`：
  - 删除 `initializeDesktopUserActionTrace` 的 import 与调用；
  - 保留 `initializeDesktopLocalTtft(desktopPlatform)` 调用。
- `packages/desktop/src/renderer/src/local-ttft/initialize.ts`：
  - 改为显式 no-op：不读取 `platform.reportLocalTtftBatch` / `platform.getRendererActionTraceConfig`，不创建 `LocalTtftObserver`，不创建定时器，不发送 batch；
  - 保留 `contract.ts` / `module.ts` / `CONTRACT.md` / `contract.example.ts` 与 `architecture-policy.yaml` 的 `local-ttft-desktop` 条目；
  - 更新 `CONTRACT.md`，说明 2026-11 后本地 TTFT 观测为 hard-disable no-op，local-logs E2E 已退役。
- `packages/desktop/src/renderer/src/desktopPlatform.ts`：删除 `getRendererActionTraceConfig`、`onRendererActionTraceConfigChanged`、`reportRendererActionTraceBatch`、`reportLocalTtftBatch` 映射。
- `packages/desktop/src/preload/index.ts`：删除上述 4 个方法及 `RendererActionTraceBatchV1` / `RendererActionTraceConfigV1` 类型 import。
- `packages/client/src/globals.d.ts`：删除 `RendererActionTraceBatchV1` / `RendererActionTraceConfigV1` import 与 3 个 trace 方法声明。
- `packages/shared/src/index.ts`：删除 `export * from "./rendererActionTrace.js"`。
- `packages/shared/src/platform.ts`：删除 `RendererActionTraceBatchV1` / `RendererActionTraceConfigV1` import 与对应可选方法。
- `packages/shared/src/channels.ts`：删除 trace 类型 import、`ReportLocalTtftBatch`、`GetRendererActionTraceConfig`、`RendererActionTraceConfigChanged`、`ReportRendererActionTraceBatch` 及类型映射条目。
- **保留** `packages/shared/src/local-ttft/contract.ts`：它是 v4 协议契约，被 `zcode-protocol-v4`、`zcode-protocol`、services、UI local-ttft observer、CLI bootstrap 与 desktop logger 使用。

#### T5.3 UI wrapper no-op

`packages/ui/src/lib/userActionTelemetry.ts`：

- 保留 `startUserAction`、`runUserAction`、`runUserActionAsync`、`UserActionHandle`、`StartUserActionInput`、`UserActionResult`、`UserActionFailure` 等公共 API。
- 将以下从 `RendererActionTraceAttributes` 派生的类型改为本地字面量联合：
  - `UserActionTrigger`
  - `UserActionResultSource`
  - `StartUserActionInput.workspaceKind` / `remoteKind` / `automationKind`
  - `UserActionResult.stateAfter` / `admissionResult`
- 删除 `RendererUserActionTelemetry`、`setUserActionTelemetry`、队列/flush/timer、`sendBatch` 与共享 trace 类型依赖。
- 默认实现直接执行 action，不构建 span、不发送 batch。
- 20+ 个组件调用点不改。
- **保留** `packages/ui/src/lib/userActionTraceCatalog.ts`，但将其 `RendererActionTraceGroup` import 替换为本地字面量联合 `"core" | "settings"`（或完整本地 union）。
- `packages/ui/src/index.ts` 删除 `RendererUserActionTelemetry` / `setUserActionTelemetry` 导出，保留 catalog 导出。

#### T5.4 Build / 打包 / E2E

- `packages/desktop/scripts/bundle.mjs`：
  - 删除 3 个 `@opentelemetry/*` `requiredRuntimeModules`；
  - 删除 `module-details-from-path`；
  - 保留 `@babel/runtime`、`undici`、`node-forge`、`yazl`、`yauzl` 等非 OTel 条目。
- `packages/desktop/electron-builder.config.js`：
  - 删除 `@opentelemetry/api-logs`、`sdk-metrics`、两个 exporter；
  - 删除 `module-details-from-path`；
  - 保留 `@larksuiteoapi/node-sdk` 与 `protobufjs` 相关闭包；
  - 保留 `pnpm-workspace.yaml` 的 `allowBuilds.protobufjs: true`。
- `packages/desktop/tsup.config.ts`：
  - 删除 `resolveBuildPackagedAgentTelemetryEnv`、`ZCODE_PACKAGED_AGENT_OTEL_*` 注入与 release 构建缺 OTLP 配置 throw；
  - 删除仅被该逻辑使用的 `resolveZCodeEnv`；
  - 删除 `__ZCODE_PACKAGED_AGENT_TELEMETRY_ENV__` define。
- `packages/desktop/src/main/desktopRuntimeEnv.ts`：
  - 删除 `declare const __ZCODE_PACKAGED_AGENT_TELEMETRY_ENV__`；
  - `loadHostProcessEnvFromLocalFiles` 的 packaged 分支返回 `{}`；
  - 删除 `resolvePackagedAgentTelemetryEnv`；
  - 删除 `readZCodeAgentTelemetryEnv` / `ZCODE_TELEMETRY_ENABLED` import、`buildHostProcessEnv` 中的 `agentTelemetryEnv` 构造与 spread；
  - 删除 identity-key delete loop 中对 `ZCODE_TELEMETRY_DEVICE_MID` 等 telemetry 键的处理（若该 loop 还保护其他身份键，保留其他键）。
- `packages/services/src/zcode-agent/agentTelemetryEnv.ts`：
  - 删除 `buildAgentTelemetrySpawnEnv`；
  - `packages/services/src/node.ts` 删除其 import 与调用，并清理 `telemetryEnv` / `telemetryConfigured` / `telemetryProfile` / `telemetryDeviceMid` 等仅被该调用使用的局部变量；
  - **保留** `packages/shared/src/runtimeEnv.ts` 的 `readZCodeAgentTelemetryEnv` 与 OTel env sanitize 键作为安全边界。
- `packages/desktop/scripts/ensure-e2e-desktop-build.mjs`：删除 3 个 OTLP 环境变量 fingerprint。
- `packages/desktop/test/tsupChunkIsolation.test.ts`：删除/重写 `resolveBuildPackagedAgentTelemetryEnv` 的 3 个测试块、import 与 define 断言。
- 删除 `packages/desktop/scripts/ttft-otlp-receiver.mjs`、`packages/desktop/test/e2e/helpers/ttft-otlp-fixture.ts`。
- 删除 OTLP TTFT E2E 与 local-logs E2E：
  - `packages/desktop/test/e2e/conversation-session/conversation-session-ttft-stages.test.ts`
  - `packages/desktop/test/e2e/conversation-session/conversation-session-ttft-diagnostics.test.ts`
  - `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-ttft-local-logs.test.ts`
  - `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-ttft-{stages,diagnostics,local-logs}.json`
  - `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-ttft-{stages,diagnostics,local-logs}.json`
- `packages/desktop/wdio.conf.ts` 删除 4 处 fixture 钩子：import、`stopTtftOtlpFixture` 声明、prepare、teardown。
- 更新 `docs/testing/conversation-session-e2e-coverage-matrix.md` 与 `docs/conversation-session-case-catalog.md`，移除 TTFT stages/diagnostics/local-logs 行。

#### T5.5 CLI telemetry no-op

删除：

- `src/otlp-exporter.ts`
- `src/agent-metrics.ts`
- `src/agent-trace-support.ts`
- `src/compatibility-adapters.ts`
- `src/request-observation-target.ts`
- `src/request-security-edition/index.ts`
- `src/model-api-recorder.ts`
- `src/provider-endpoint.ts`

重写：

- `src/agent-trace-runtime.ts`：只保留 `NoopAgentExecutionTelemetry` 与 bootstrap 所需类型/常量；删除 `@opentelemetry/api` import、`recordRequestObservation`、`agent-trace-support`、`agent-metrics`、`compatibility-adapters`、`error-sanitizer` import。
- `src/bootstrap.ts`：保留 `createModelTelemetry`、`prepareModelTelemetryEnv`（直接返回 env，不做 device-MID 文件 I/O）、`shutdownPreparedModelTelemetry`；删除 OTLP endpoint/header 解析、device-MID 状态机、动态 `import("./otlp-exporter.js")`。
- `src/index.ts`：只导出 no-op 实现、`error-sanitizer`（若保留）与仍被 bootstrap 使用的类型；删除 `agent-trace-runtime` 之外的 OTel 实现导出。
- `tests/`：
  - 删除 `agent-metrics.test.ts`、`agent-trace-runtime.test.ts`、`model-api-recorder.test.ts`、`otlp-cost-controls.test.ts`、`otlp-integration.test.ts`、`compatibility-adapters.test.ts`、`provider-endpoint.test.ts`；
  - `bootstrap.test.ts` 删除 `parseOtlpHeaders` / `resolveOtlpTraceEndpoint` / `resolveOtlpMetricEndpoint` 的 import 与测试块，并重写 device-MID 断言；
  - `apps/zcode-cli/packages/bootstrap/tests/telemetry-bootstrap.test.ts` 重写 device-MID/state-file 断言；
  - `error-sanitizer.test.ts` 仅在 `error-sanitizer.ts` 保留时保留。

边界：

- `ZCODE_TELEMETRY_DEVICE_MID` 的其他生产者/消费者（`cli-device-mid.ts`、`desktopDeviceMid.ts`、`telemetryCore.ts`、`stdioDeviceMid.ts`、`provider-endpoint-routing-source-headers.ts`）不在本轮删除；只移除 `@zcode/telemetry` 自己的 device-MID 生成。
- `packages/shared/src/runtimeEnv.ts` 的 OTel env capture/sanitize 键保留，作为安全边界。
- `zcode-protocol-entrypoint.ts` 的 `telemetryDeviceMid` 传递若因 no-op 变为空值，保留调用点并接受空值；不新增分支。

#### T5.6 规范、策略与文档

- `AGENTS.md`：在“项目背景与硬禁用边界”中增加 OTel 例外说明：第一方 `@opentelemetry` 声明与运行时实现已按本规范移除；`@zcode/telemetry` 与 UI wrapper 只保留 no-op 接口；`ai@6` 的传递 `@opentelemetry/api` 是已记录例外；不得重新引入第一方 OTel 实现。
- `spec/vendor-disable.md`：更新为 OTel 已移除，并说明这是对“保留禁用实现”规则的显式例外；删除/改写 `OTLP_DIAGNOSTIC_EXPORT_DISABLED` 与 renderer initializer 的现行描述。
- `docs/trace/README.md`、`docs/trace/cli-agent-telemetry.md`、`docs/trace/reference/otel-concepts.md`、`docs/trace/desktop-renderer-user-action-trace.md`、`docs/trace/reference/runtime-and-operations.md`：标注 2026-11 已移除；保留历史内容，不删除历史证据；移除“当前仍运行”的表述。
- `docs/monitoring/local-ttft-queries.md`、`local-ttft-rollout-checklist.md`、`ttft-stage-telemetry.md`、`docs/monitoring/README.md`、`docs/monitoring/performance-telemetry-catalog.md`：更新对已删除 receiver / E2E spec / CLI OTLP 通道的引用；`dashboards/local-ttft.json`、`local-ttft-platform-evidence.json` 等历史证据保留并标注。
- `docs/desktop/build-time-optional-capabilities.md`：删除 OTLP 构建期注入说明。
- `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml`：
  - 移除/改写 `RendererUserActionTelemetry` 与 `createRendererActionTraceBroker` 条目；
  - 更新 `service.cli-agent-telemetry` 节点（删除 `AgentExecutionTelemetryRuntime` 等已删 symbol）；
  - 更新“CLI agent OTLP traces remain distinct”一类 edge/描述，改为“第一方 OTel 已移除，仅保留 no-op 接口与 `ai@6` 传递依赖”。
- `docs/monitoring/local-ttft-rollout-checklist.md`：删除对 `resolveBuildPackagedAgentTelemetryEnv` 的现行引用。
- `docs/monitoring/local-ttft-trace-reading.md` 与 `apps/zcode-cli/docs/plan/trajectory/mid-conversation-system-projection-plan.md`：把已删实现/当前行为改成历史说明或删除。
- 可选但建议：更新 `docs/cua/windows-source-development.md`、`apps/zcode-cli/docs/design/v2/mcp-node-fallback.md`、`apps/zcode-cli/docs/usage/01-quickstart.md`、`apps/zcode-cli/docs/design/v2/sea-cross-target-packaging.md`、`docs/electron/electron-builder-26.17-upgrade.md` 的旧 Node/Electron 文案。
- 重新生成 `third-party/inventory.json` 与 `THIRD-PARTY-NOTICES.md`：
  - `node scripts/licenses.mjs notices`
  - `node scripts/licenses.mjs check`
- 不手改 `packages/desktop/bundled-agents/**`、`apps/zcode-cli/packages/*/dist/**`、`packages/*/dist/**`；这些是生成产物。

### T6：CI 检查与基线

- 三个 GitHub workflow 不改：Node/pnpm 由 `jdx/mise-action` 读取 `mise.toml`；Electron 缓存键已 hash `packages/desktop/package.json`；无 OTel 硬编码。
- `scripts/electron-builder-binaries-macos.json` 必须更新；升级后运行 `pnpm ci:verify-electron-builder-mirror`。
- Docker E2E 的 Node 24.14.0 / pnpm 10.33.2 漂移只记录，不修改：
  - `Dockerfile.desktop-e2e`
  - `apps/zcode-cli/e2e/compact-microcompact/Dockerfile`
  - `apps/zcode-cli/packages/browser-use-plugin/e2e/headless-linux.Dockerfile`
  - `scripts/test-desktop-e2e-container.sh`
- `package-lock.json` 是陈旧文件，不修改。
- 根 `typecheck` 脚本不新增 renderer/preload/scheduler 项目：基线 `tsc -p packages/desktop/tsconfig.renderer.json` 与 `tsconfig.preload.json` 已有既存错误（`window.zcode`、`@zcode/ui/styles.css`、`@zcode/shared` 导出），不在本轮修复范围。验证时对比基线，不把既存错误算作新增。
- `apps/zcode-cli` 的独立 typecheck 依赖 `@zcode/contracts` 的 dist 声明，且当前存在既存 `ModelRequestObservation` 漂移；不把它作为本轮 CI 门禁。只对改写后的 `@zcode/telemetry` 做定向 `tsc` 对比。

## 验证门禁

严格按以下顺序执行，避免 pnpm 隐式 install 污染 CLI workspace：

```bash
# 1. 根 workspace
pnpm install

# 2. CLI workspace：先更新 lockfile，禁止 build scripts 写 allowBuilds 占位
pnpm --dir apps/zcode-cli install --ignore-scripts

# 3. 静态门禁
pnpm typecheck
pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit
pnpm lint
pnpm --dir apps/zcode-cli lint
pnpm fmt:check
pnpm architecture:check --changed
pnpm docs:stale-phrases:check
pnpm audit:conversation-session-coverage
pnpm ci:verify-electron-builder-mirror
node scripts/licenses.mjs check
git diff --check
```

补充检查：

- `node scripts/licenses.mjs notices` 后提交更新后的 `third-party/inventory.json` 与 `THIRD-PARTY-NOTICES.md`。
- `rg` 检查限定源码与 manifest，排除生成产物：
  ```bash
  rg "@opentelemetry" --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/out/**' --glob '!**/bundled-agents/**' --glob '!pnpm-lock.yaml' --glob '!apps/zcode-cli/pnpm-lock.yaml' --glob '!package-lock.json' --glob '!third-party/**' --glob '!spec/**' --glob '!docs/**' --glob '!THIRD-PARTY-NOTICES.md'
  ```
  预期：第一方 `package.json` 与运行时源码为 0；lockfile 与 `third-party` 清单仍会记录 `ai@6` 的 `@opentelemetry/api`；`spec/`、`docs/`、`THIRD-PARTY-NOTICES.md` 中的历史说明不计入零命中。
- `pnpm why --prod -r @opentelemetry/api`：预期显示 `ai@6` 的生产传递依赖；不得出现第一方 `packages/desktop` / `@zcode/telemetry` 声明。
- `pnpm --dir packages/desktop why @opentelemetry/api`：允许显示 `react-scan → react-doctor → @sentry/node` 的 dev 链；这是已记录的 dev-only 残余，不进入生产 inventory。
- 定向工程测试：
  - `packages/desktop/test/electronBuilderSecurity.test.ts`
  - `packages/desktop/test/e2eElectronBinary.test.ts`
  - `packages/desktop/test/chromedriverPreflight.test.ts`
  - `packages/desktop/test/node-pty-rebuild.test.ts`
  - `packages/desktop/test/tsupChunkIsolation.test.ts`
  - `packages/desktop/test/telemetryFieldContract.test.ts`（若保留）
- Renderer/preload 基线对比：
  - `pnpm exec tsc -p packages/desktop/tsconfig.renderer.json --noEmit`
  - `pnpm exec tsc -p packages/desktop/tsconfig.preload.json --noEmit`
  - 只允许既存错误，不允许新增。
- CLI telemetry 定向对比：
  - `pnpm exec tsc -p apps/zcode-cli/packages/telemetry/tsconfig.json --noEmit`
  - 改写后应清理与 OTel 相关的错误；若仍有 `@zcode/contracts` 既存漂移，记录为既存。

不运行：应用启动、App 单测、E2E、制品构建。

## 验收场景

1. 项目 pin 全部为 Node `24.22.2`，本机全局 Node 未改变；`mise.toml` 驱动 GitHub Actions。
2. 根 `pnpm-lock.yaml` / `packages/desktop` 解析 Electron `44.10.2`、electron-builder `26.18.0`、electron-updater `6.8.11`、electron-to-chromium `1.5.477`、node-abi `4.40.0`；桌面直接 devDependencies `@wdio/cli`、`@wdio/globals`、`@wdio/local-runner`、`@wdio/mocha-framework`、`@wdio/spec-reporter` 与 `webdriverio` 解析 `9.33.1`（`@wdio/electron-types` 保持 `9.2.1`；传递 `@wdio/logger` / `@wdio/protocols` 等按各自版本解析，不要求 9.33.1）。CLI `apps/zcode-cli/pnpm-lock.yaml` 解析 zod `4.6.7`、MCP sdk `1.32.2`、Playwright `1.64.1` 等 CLI 侧目标版本。CLI lockfile 没有 Electron runtime 包，但可能包含 `browserslist` 传递的 `electron-to-chromium`；不要用裸 `grep -i electron` 判定失败。
3. React `19.3.1`、Vite `8.3.6`、Tailwind `4.3.4`、TypeScript `6.0.3`、zod `4.6.7`、MCP `2.4.0/2.0.4/1.32.2` 在目标包中解析正确。
4. 第一方 `@opentelemetry` 声明为 0；desktop main/renderer/preload/shared 不再有 OTel import；CLI telemetry 包为 no-op。`ai@6` 的传递 `@opentelemetry/api` 与 desktop `react-scan` 的 dev-only 链作为已记录例外保留。
5. UI `runUserAction/startUserAction` 调用点不变且行为为 no-op；无新增常驻定时器/队列。
6. Renderer local TTFT 模块保留为 no-op，architecture policy 仍可解析；`flushLocalTtftLogs` 与共享 local-ttft 契约保留；local-logs E2E 已按 e2e-case-lifecycle 退役并更新文档。
7. `scripts/electron-builder-binaries-macos.json` toolchain 为 `26.18.0`，资产校验通过。
8. 三个 GitHub workflow 无差异；`mise.toml`、`.nvmrc`、CLI pin、engines、README/spec 的 Node 版本一致。
9. 所有静态门禁通过；无新增 type/lint/fmt/architecture 错误；既存 renderer/preload/CLI 类型错误有基线记录。
10. 第三方 inventory 不再包含第一方 `@opentelemetry` sdk/exporter 声明；仅保留 `ai@6` 的传递 `@opentelemetry/api`，并在清单中如实记录；Node runtime license 为 `24.22.2`。

## 非目标

- Electron 45、TypeScript 7、undici 8、tsup 9、`@electron/asar` 4、`dotenv` 18、`@types/yauzl` 3、`@lydell` beta.18、`wdio-electron-service` 10、`ai` 7。
- ARMS 移除、手机远控、远程 workspace、Data Sync、Sites 等既有硬禁用域。
- Docker E2E 工具链升级。
- 修复 renderer/preload/CLI 的既存类型基线问题。
- 应用启动、App 单测、E2E、制品构建。
