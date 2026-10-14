# v3.15.1 个人分支同步与发布

## 基线与发布规则

- dev 基线为 `f32949a55f4a01a212e6351dd9f44db72f4ec667`，合入 main 的 `aac4755666d09fdcd70272fcf063c077a639015f`，使用真实 merge，不重写历史。
- 已合入的旧 v3.14.3 与上游重推版本只差根版本号。重复冲突按旧 v3.14.3、dev、重推 v3.14.3、v3.15.1 的实际内容消解，不整文件选 ours/theirs。
- 根版本为 `3.15.1`；`v3.15.100` 标签由既有发布流程注入制品版本。Node `24.21.0`、pnpm `11.27.1`、Electron `44.5.1` 不变，根和 CLI 锁文件分别维护。
- 必须完成根 Typecheck、Desktop Main 无输出 Typecheck、Lint、Format、Architecture changed 和 Git whitespace 六项检查，才允许提交、打标签及推送。不执行应用、单测、E2E 或制品构建，不等待 Actions。

## 行为与所有者

隐私边界见 [vendor-disable.md](vendor-disable.md) 和 [remote-disable.md](remote-disable.md)；工作流提供档位由 Main 固定，用户选择由 SettingService 持久化，Host 推导生效模式，UI 只读投影。关闭窗口由 Main 结合平台、托盘可用性与设置决定，见 [desktop-close-to-tray.md](desktop-close-to-tray.md)。

UI Plugin / MCP Apps 使用已有 workspace runtime、实例 generation 和 owner，不占用控制面泳道，见 [control-plane-lane-lifecycle.md](control-plane-lane-lifecycle.md)。模型轨迹继续遵循 [model-trajectory-memory.md](model-trajectory-memory.md) 的 200 条／16 MiB 预算、上下文及 delta 链、默认折叠与测量修复。

```text
SettingService 用户选择 → Host 生效工作流配置 ← Main 固定 offer
                              ↓
                         CLI / 会话 → UI 投影
workspace identity → 原 owner / lease → CommandInbox 串行 admission
                             └→ 实例 generation / stale-run 校验
```

数据库启动沿用原迁移和修复顺序，但禁用闲时任务 Repo 的构造，不修改旧行。迁移、维护或关闭发生异常时，保留首个错误；关闭所有已构造句柄后再传播，不在 finally 中覆盖原异常，也不将失败标记为 prepared。已发布 SQL 和校验内容不变。

## 静态消融记录

- 删除重推旧基线导致的重复声明、重复实现与死 import；不为冲突额外保留一套运行逻辑。
- 新增营销 Provider 包装只负责在挂载前判断硬禁用；原 Provider、协议、组件与文案保留。不增加状态、定时器或配置源。
- Highspeed 复用 Coding Plan 常量，不增设开关；在服务装配、effect、store 订阅与历史分享入口直接关断。
- ARMS 新启动模块依赖已删除的专用模块，故不纳入构建；只移除它们对应的专用测试，其他上游测试资产保留。CLI MCP 遥测 tracker 与官方端点路由在构造前跳过，不保留无用途缓存。
- 不给 UI Plugin 新增保活状态：workspace chat 泳道本来就不做控制面空闲回收。继续由现有实例 owner 处理生命周期。
- 对会在回调中变动的 listener Set 保留迭代快照；直接遍历会改变回调期间的派发集合，因此不消除快照。
- 静态检查修复只调整错误的类型、HTML 示例闭合、未使用声明及格式；不放宽规则、不刷新架构基线、不排除错误文件。第三方 notices/inventory 由最终依赖图重新生成。

## 人工验收（本轮不执行）

1. 打包 Desktop 默认工作流常开；切换按需/关闭并重启后保持选择，环境及远端配置不能绕过禁用域。
2. Windows/Linux 分别覆盖托盘开启、关闭、不可用、显式退出和取消退出；scheduler 空闲自退不改变窗口行为。
3. 营销、遥测、官方套餐/Highspeed、Bot、手机与 Server/SSH/WSL/Docker 远程入口均不可生效，无轮询、连接、采样或孤儿进程。
4. 大模型轨迹保持预算、上下文、默认折叠和滚动/搜索定位；UI Plugin 使用中不被控制面回收，控制面空闲后能退出，插件入口挂载不冷启动。
5. 自配模型、普通 cron、本地会话、普通 Web `/ws`、手动插件目录与下载仍可用；Electron 44 插件截图可写入剪贴板。
6. 旧数据库迁移成功且旧闲时任务行不变；迁移和关闭同时失败时呈现首因，失败不发布 ready。

本轮静态结果与净代码变化在交付报告中记录；运行时与安装包证据由后续 CI 和人工验收提供。
