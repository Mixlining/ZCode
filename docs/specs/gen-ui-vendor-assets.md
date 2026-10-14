# Gen UI 离线资源字节完整性

## 产品规则与所有者

Gen UI 的 standalone export 与 Desktop sandbox 共用仓库内的固定离线资源。资源文件及其
`runtime-manifest.json`、`vendor/manifest.json` 由 visualize plugin 资源目录唯一持有；
Desktop 构建只校验并按原始字节复制，不维护第二份资源或哈希。

- manifest 中的 SHA-256 以 Git blob 的原始字节为准。所有操作系统 checkout 后必须得到
  相同字节，不能因 Git 的文本换行转换产生 CRLF 版本。
- visualize `assets/` 整体按非文本内容 checkout；由 runtime manifest 固定哈希的
  `genUiTweakRuntime.js` 同样按非文本内容 checkout。这里的“非文本”仅约束 Git 不转换
  字节，不改变文件的 JavaScript、CSS、HTML 或 JSON 语义。
- Desktop 生产构建继续逐项验证 vendor 文件和许可证哈希。缺失、篡改或 manifest 漂移
  必须失败；不得自动重算哈希、跳过校验或回退网络下载。
- 资源校验与复制不引入运行时状态、缓存、后台任务或远端连接，也不改变沙箱生命周期。

## 验收场景

| 场景                                     | 结果                                                |
| ---------------------------------------- | --------------------------------------------------- |
| Linux/macOS 默认 checkout                | 工作树资源字节与 Git blob、manifest SHA-256 一致    |
| Windows 或 `core.autocrlf=true` checkout | 不转换资源换行，SHA-256 与 Git blob 保持一致        |
| vendor 文件或许可证被修改                | Desktop 构建后处理仍以 hash mismatch 失败           |
| manifest 哈希被单独修改                  | 严格校验失败，不复制不可信资源                      |
| 正常生产构建                             | plugin sandbox alias 完成后复制同一份已校验离线资源 |

本轮不在本地执行 Desktop 构建。静态验收逐项计算两个 manifest 的文件哈希，并使用
`git cat-file --filters` 模拟 `core.autocrlf=true` checkout，确认过滤后的字节仍与 blob
一致；远程 Windows tag 构建由发布工作流人工查看结果。
