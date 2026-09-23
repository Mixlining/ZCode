# GitHub Actions 说明

本仓库的 GitHub Actions 目前有两个工作流：[`.github/workflows/check.yml`](.github/workflows/check.yml) 在每次 push（以及 `pull_request`）时于 Ubuntu runner 上并行跑四项静态检查（`pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`、`pnpm architecture:check`），**不产出任何产物**；[`.github/workflows/build-desktop-windows.yml`](.github/workflows/build-desktop-windows.yml) 用于在 GitHub 托管的 Windows runner 上编译**桌面版（Windows x64，含远程工作区能力）**并产出可安装的 NSIS 安装包——下文只讲构建流。

本仓库此前没有任何 CI 配置（`git ls-files` 里没有 `.github/`，源码注释引用过的 `.gitlab/ci/00-workflow.yml` 与 `scripts/ci/ci-repo-hygiene.mjs` 都不在本仓库内），因此这份工作流是从零新增的，不替代任何既有流水线。

## 触发方式

| 方式     | 行为                                                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 手动触发 | Actions 页面选择 `Build Desktop (Windows)` → `Run workflow`。不需要填任何参数；选择 tag 时使用 tag 版本，选择分支时使用该分支根 `package.json` 版本。产物作为 workflow artifact 上传。 |
| 推送 tag | `git tag v3.14.0 && git push origin v3.14.0`。tag 必须是稳定版 `vX.Y.Z`；除 artifact 外，还会用该 tag 创建 **prerelease** 并附上安装包与校验和。                                       |

tag 是 tag 构建的产品版本来源。打包时 workflow 将去掉 `v` 前缀后的版本临时写入根 `package.json`，使应用 metadata 与安装包文件名使用 tag 版本；打包结束后恢复原文件，不提交版本改动。手动选择分支时保留该分支根 `package.json` 的版本。

同一 ref 的新运行会取消尚未完成的旧运行（`concurrency`），单次运行上限 90 分钟。

## 产物

- 安装包：`packages/desktop/dist/ZCode-<version>-win-x64.exe`（NSIS，非 oneClick）
- 校验和：`packages/desktop/dist/SHA256SUMS.txt`
- 下载位置：手动触发在 Actions 运行的 Artifacts 区（保留 14 天）；tag 触发同时出现在对应 prerelease 的 Assets 里

产物**未签名**（除非你配置了签名 secret，见下），首次安装会出现 SmartScreen 提示，需要手动选择「仍要运行」。它的 `appId` 与官方发行包相同，因此在同一台机器上会与官方安装共用/覆盖同一份安装目录与数据目录；想让两者共存请参考文末「想改的时候改哪里」。

## 需要在仓库里配置什么（全部可选）

`Settings → Secrets and variables → Actions`：

| 类型     | 名称                              | 作用                                                                                                               |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Secret   | `CSC_LINK`                        | Windows 代码签名证书（base64 的 PFX 或证书路径）。配置后 electron-builder 自动签名；不配置则跳过签名，构建不失败。 |
| Secret   | `CSC_KEY_PASSWORD`                | 上面证书的密码（如需要）。                                                                                         |
| Variable | `ZCODE_BASE_URL`                  | 模型/业务后端地址。留空则用仓库内置默认值。                                                                        |
| Variable | `ZCODE_CDN_BASE_URL`              | 构建期写入 bundle 的 CDN 基址。                                                                                    |
| Variable | `ZCODE_REMOTE_ASSET_CDN_BASE_URL` | **远程工作区**部署到远端主机时下载运行时资产的地址。                                                               |
| Variable | `ZCODE_DEPS_BASE_URL`             | 私有依赖/镜像基址（可选）。                                                                                        |

只有**非空**的 variable 会被写进构建用的 `.env`；四个都留空时，产物使用仓库内置默认端点，与官方发行一致。要覆盖更多端点（例如 `BIGMODEL_API_BASE_URL`、`ZAI_OAUTH_ORIGIN`），在 `.env` 写入那一步的 `$mapping` 里加一行即可。

## 工作流做了什么

| 步骤     | 命令                                                                         | 说明                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 工具链   | `jdx/mise-action@v4`                                                         | 读 `mise.toml` 安装 node `24.21.0` 与 pnpm `11.27.1`，与项目锁定版本一致（该 action 自 v2.1.0 起支持 Windows runner；如需供应链加固可把 tag 换成 commit SHA）。    |
| 缓存     | `actions/cache/restore@v6` / `actions/cache/save@v6`                         | 缓存 pnpm store、Electron 与 electron-builder 二进制；key 跟随根 `pnpm-lock.yaml` / `packages/desktop/package.json`。                                              |
| 安装依赖 | `pnpm install --frozen-lockfile`                                             | 一次安装即覆盖根 workspace 与 `apps/zcode-cli`；三个 `patches/*.patch` 在此生效。                                                                                  |
| 门槛     | `pnpm typecheck`、Desktop Main `tsc --noEmit`、`pnpm lint`                   | 根类型检查、Desktop Main 无输出类型检查与仓库 Lint；静态检查工作流另外执行格式和架构检查。                                                                         |
| 端点     | 写 `.env`                                                                    | 见上一节的 variable 表。                                                                                                                                           |
| 构建     | `pnpm run bundle:desktop -- --os win --arch x64`                             | 唯一入口：内部依次执行 `prepare:runtime-assets` → 生产构建（`tsup` + `vite build`）→ `electron-builder --win --x64` → asar 运行时依赖闭包校验 → 500 MiB 体积审计。 |
| 包校验   | `node packages/desktop/scripts/bundle.mjs --verify-only --os win --arch x64` | 上传前再次核对最终 `app.asar` 中 Main、Host、scheduler 和 preload 的外置包导入及依赖闭包；缺包时阻止发布。                                                         |
| 产物     | `Get-FileHash` + `upload-artifact`                                           | 生成 `SHA256SUMS.txt` 并上传安装包。                                                                                                                               |
| 发布     | `gh release create/upload`                                                   | 仅 tag 触发：创建 prerelease（`--generate-notes`）或向已存在的 Release 追加资产。                                                                                  |

## 关键环境变量（工作流已设，改动前请先读这里）

| 变量                                        | 取值                                                      | 为什么                                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ZCODE_ENV`                                 | `production`                                              | 只有 `production` 才得到 `ZCode` 身份与不带 `_TEST` 后缀的产物名；不设会退化为 `ZCode Preview` + `dev.zcode.app.preview`。                                                          |
| `ZCODE_SKIP_REMOTE_ASSETS`                  | `1`                                                       | 打包后的桌面端**不嵌入** `mock-cdn` 远端资产（`electron-builder` 的 `extraResources` 里没有它）：开发态读仓库里的 `mock-cdn`，生产态统一走 CDN + 本地缓存。跳过可显著缩短构建时间。 |
| `ZCODE_TARGET_OS` / `ZCODE_TARGET_ARCH`     | `win32` / `x64`                                           | 与 `--os win --arch x64` 一致，供各 prepare 脚本解析目标平台。                                                                                                                      |
| `ELECTRON_MIRROR`                           | `https://github.com/electron/electron/releases/download/` | Electron 平台二进制从官方 GitHub Releases 下载；npm 包仍由项目 `.npmrc` 指向官方 npm。                                                                                              |
| `ELECTRON_CACHE` / `ELECTRON_BUILDER_CACHE` | 工作区内的 `.electron-cache`、`.electron-builder-cache`   | 收进工作区才能被 `actions/cache` 命中；这两个目录名已在 `.gitignore` 中预留。                                                                                                       |

## 本地复现同样的产物

```bash
pnpm install --frozen-lockfile
ZCODE_ENV=production ZCODE_SKIP_REMOTE_ASSETS=1 pnpm run bundle:desktop -- --os win --arch x64
node packages/desktop/scripts/bundle.mjs --verify-only --os win --arch x64
```

产出一致落在 `packages/desktop/dist/`。Windows 目标必须在 Windows 宿主上打包（`electron-builder.config.js` 的 `resolveElectronBuilderWindowsTarget` 有宿主断言），这也是工作流跑 `windows-latest` 的原因。

## 已知边界

- **只覆盖 Windows x64**：不产出 macOS/Linux 包，也不做 macOS 签名与公证（仓库的 `notarize: false` 是刻意设置，另需独立签名流程）。
- **远程工作区依赖运行时的 CDN**：安装包不含远端运行时资产，部署到远端主机时按 `ZCODE_REMOTE_ASSET_CDN_BASE_URL` 拉取对应平台的运行时。若你要部署的版本在目标 CDN 上不存在，需要自备分发源（用 `ZCODE_REMOTE_ASSET_CDN_BASE_URL` 覆盖，或先跑 `bootstrap:with-remote` 生成 `mock-cdn` 自行分发）。
- **不覆盖手机/浏览器远控链路**（`server` + `web`）：那是另一条分发通道（`pnpm build:zcode`），本工作流不涉及。
- **远端资产、远端 Node 版本**：`prepare:remote-assets` 会下载各平台 Node 与 node-pty 预编译产物，本次已显式跳过；若将来要出内嵌远端资产的包，去掉 `ZCODE_SKIP_REMOTE_ASSETS` 并预留更长超时。
- **不自动提交版本 bump**：tag 构建只在打包期间临时把 tag 版本写入根 `package.json`，随后恢复原文件；分支手动构建继续使用仓库版本。`.release-it.mjs` 的 `release` 流程与 CI 未打通（release-it 不创建 GitHub Release）。

## 故障排查

**构建报 `'pnpm.cmd' is not recognized as an internal or external command`（出现在 `prepare:runtime-assets` 阶段）**

原因：`packages/desktop/scripts/prepare-runtime-assets.mjs` 曾在 win32 上把 pnpm 硬编码成 `pnpm.cmd`，而只有 npm 安装的 pnpm 才提供这个文件；工作流里的 pnpm 来自 mise，PATH 上没有 `pnpm.cmd`，于是子进程一启动就报错。现已改为裸命令名 `pnpm`，由 [`scripts/spawn-command.mjs`](scripts/spawn-command.mjs) 交给 `cmd.exe` 按 `PATHEXT` 解析（npm 布局解析到 `pnpm.cmd`，mise 布局解析到 `pnpm.exe`），与 `bundle.mjs` 等较新脚本的写法一致。

同类残留（本工作流不经过，仅出现在本地 dev / bootstrap / remote-assets 路径）：`scripts/bootstrap.mjs`、`scripts/dev-desktop-env.mjs`、`scripts/dev-desktop-remote-prod.mjs`、`scripts/prepare-prebuilds.mjs`、`scripts/mise-run.mjs`、`packages/desktop/scripts/ensure-local-runtime-assets.mjs` 仍写死 `pnpm.cmd`。若将来在 mise 环境下跑到并报同样的错，用 `grep -rn "pnpm.cmd" scripts packages` 找出来按同一方式改掉即可。

**其他常见情况**

- 安装包能装但系统提示「未知发布者」：未配置签名 secret，配置 `CSC_LINK` / `CSC_KEY_PASSWORD` 后重新运行。
- 缓存导致的怪异失败：到 Settings → Actions → Caches 删掉对应缓存后重跑；pnpm store 缓存的 key 绑定 `pnpm-lock.yaml`，Electron 缓存的 key 绑定 `packages/desktop/package.json`。
- 首次运行超时：无缓存时需要下载 Electron 与 electron-builder 工具包，可把 `timeout-minutes` 提到 120。
- 产物名带 `_TEST` 后缀或 productName 变成 `ZCode Preview`：`ZCODE_ENV` 不是 `production` 了。
- 远程工作区部署时找不到远端运行时：目标 CDN 上没有当前版本的资产，用 `ZCODE_REMOTE_ASSET_CDN_BASE_URL` variable 指向你自己的分发源。

## 想改的时候改哪里

| 想做的事                   | 改哪里                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 加 macOS / Linux 产物      | 在工作流里加 `strategy.matrix`（`macos-latest` / `ubuntu-latest`）并把 `--os`/`--arch` 参数化；macOS 还需按 `ZCODE_ENABLE_MAC_SIGN` 与 `APPLE_SIGNING_IDENTITY` 准备证书。 |
| 与官方安装共存             | 设 `ZCODE_PREVIEW_IDENTITY=1`，产物变成 `ZCode Preview`（appId `dev.zcode.app.preview`）。                                                                                 |
| 让产物带上你自己的默认端点 | 在仓库 Variables 里配置上一节的四个变量。                                                                                                                                  |
| 调门槛                     | 增删 `Typecheck (root)` / `Lint (root)` 两个 step，或补上 `pnpm --dir apps/zcode-cli ...` 这类包级检查。                                                                   |
| 换 runner 或超时           | 工作流顶部的 `runs-on` / `timeout-minutes`。                                                                                                                               |

## 相关文件

- 检查工作流：[`.github/workflows/check.yml`](.github/workflows/check.yml)
- 构建工作流：[`.github/workflows/build-desktop-windows.yml`](.github/workflows/build-desktop-windows.yml)
- 打包入口：[`packages/desktop/scripts/bundle.mjs`](packages/desktop/scripts/bundle.mjs)
- 打包配置：[`packages/desktop/electron-builder.config.js`](packages/desktop/electron-builder.config.js)
- 运行时资产：[`packages/desktop/scripts/prepare-runtime-assets.mjs`](packages/desktop/scripts/prepare-runtime-assets.mjs)、[`scripts/prepare-prebuilds.mjs`](scripts/prepare-prebuilds.mjs)
- 工具链版本：[`mise.toml`](mise.toml)
- 本地构建说明：[`README.md`](README.md) 的「打包」章节
