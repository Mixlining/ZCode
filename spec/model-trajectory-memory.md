# 模型调用轨迹的内存边界

侧边栏「查看调用轨迹」（`model-trajectory`）的内存行为约束。该面板是可长时间停留、
可按任务多开的常驻 UI，任何随窗口条数、上下文规模或停留时间增长的资源都必须有上限。

## 产品规则

- **窗口 = 条数与字节预算取小**。轨迹结果最多返回 `DEFAULT_TRAJECTORY_LIMIT`（200）条；
  同时受 `MODEL_TRAJECTORY_MAX_RESULT_BYTES`（16 MiB，与
  `PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes` 对齐）约束。两者任一触发都置
  `truncated: true`，UI 复用既有文案 `modelTrajectory.truncatedNotice`，不新增字段与文案。
  预算取 16 MiB 而非更小值，依据是本机实测：开启完整保留时 32 MiB 尾部的常规结果为
  4–12 条、6.8–8.0 MiB，预算低于该区间会让用户直接少看到调用记录；而 16 MiB 相对未限幅时的
  数百 MB 与 `RangeError` 仍有量级优势。
- **首条保留完整起始上下文**。窗口内第一条记录必须携带完整 `request.messages`，这是排障
  「第一次请求到底发了什么」的产品语义，不做单条限幅、不做中段省略。
- **窗口选择不得改变幸存记录的内容**。model-io 的 delta 记录（`messagesKind: "delta"` +
  `messageOffset`）必须按链式依赖展开：第 _i_ 条依赖第 _i-1_ 条的完整上下文，一直链到最近的
  `kind: "tail"` 基线。因此禁止「先 slice 最新 N 条再展开」——那会让幸存记录的上下文缺头。
- **先定窗口再物化**。禁止对尾部全部记录先展开成完整上下文、再逐条映射、最后才截断。
  窗口外的记录只参与推进展开链，展开后立即丢弃，不进入映射结果。
- **结果必然可序列化**。任何输入（含超长会话、超大单条上下文）下，
  `getModelTrajectory` 的返回值都必须能被 `JSON.stringify` 序列化；不得抛出
  `RangeError: Invalid string length`。
- **折叠是默认态**。轨迹消息体默认折叠，正文不进入 DOM。展开入口保持可用：表头「展开全部」
  与按角色展开菜单。
- **禁用 CSS 离屏占位来减 DOM**。轨迹卡片不得使用 `content-visibility: auto` 或
  `contain-intrinsic-size`：virtualizer 以卡片外层 `<li>` 的 `offsetHeight` 为测量基准
  （`@tanstack/virtual-core` 的 `measureElement` 默认实现），离屏占位高度会让卡片被测量成
  占位值，产生与本次修复同类的滚动跳变。该场景需要真实布局，仓库既有先例见
  `packages/ui/src/ToolCallBlocks/renderers/node-repl.tsx` 的 `COLLAPSIBLE_CODE_LAYOUT_STYLE`。
- **虚拟列表的滚动补偿只对视口上方生效**。滚动锚点补偿判据不得对屏幕下方的项返回真值；
  搜索期抑制补偿的既有语义保持不变。
- **清空测高缓存必须由搜索条件驱动**，不得随挂载集合变化重复执行（`measure()` 会清空整个
  `itemSizeCache`，形成「清空 → 重测 → 挂载集合变 → 再清空」的自维持循环）。

## 状态所有者

| 状态                     | 唯一所有者                                                         |
| ------------------------ | ------------------------------------------------------------------ |
| 窗口选择（条数/字节）    | Host 的 `readModelTrajectory`（`packages/services`）               |
| 是否截断                 | 同上，经 `ZCodeModelTrajectory.truncated` 单向投影给 UI            |
| 轨迹数据（已取回的窗口） | `useModelTrajectory` 的 React state，面板卸载即释放                |
| 展开/折叠状态            | UI 本地（`TrajectoryExpansionCommandContext` / override registry） |
| 虚拟列表测量与滚动补偿   | `@tanstack/react-virtual`，判据由 `ModelTrajectoryTimeline` 提供   |

## 事件顺序

窗口选择在 Host 内单次完成，UI 只消费结果：

```text
请求 → readdir/读取 32MiB 尾部 → JSON.parse → 过滤 sessionId → rawRecords
                                  │  排序（startedAt，requestId 兜底）
                                  ├─ 预判：累计「各条自身消息切片字节」→ 窗口内最小值 × 窗口长度
                                  │         = 真实序列化大小的下界 → 用下界收紧 startIndex
                                  └─ 单次正向遍历：previousExpanded 全程只保留 1 份
                                        < startIndex 的记录：仅展开，不映射（仅推进 delta 链）
                                       >= startIndex 的记录：展开 + mapRecord
                                                            累加 utf8JsonByteLength 实测复核
                                                            超预算且已有 >1 条 → 从头部出队
                                               ↓
                                       返回 records(≤200, ≤16MiB) + truncated
                                               ↓
                        RPC 单帧 → useModelTrajectory.state → ModelTrajectoryTimeline
                                               ↓
                        虚拟列表按挂载窗口渲染（消息体默认折叠）
```

`startIndex` 先由条数上限给出（`rawRecords.length - safeLimit`），再由字节预算的下界收紧。
两者都不需要展开或映射任何记录：条数只依赖 `rawRecords.length`，下界只依赖各条自己的消息切片，
后者在页缓存命中下实测约 15 ms（400 条尾部），而逐条映射 200 条真实记录约需数秒。

## 正反路径

- **正**：窗口内条数与字节均在预算内 → 原样返回，`truncated` 只反映 32 MiB 尾部是否截断。
- **反（超条数）**：尾部记录多于 200 条 → 保留最近 200 条，`truncated: true`。
- **反（超字节）**：下界预判先收紧窗口；若实测仍超出 16 MiB，则从窗口头部逐条出队直至进入预算，
  `truncated: true`（判据为 `mapped.length < windowSize`）。出队只减少条数；每条返回记录都在
  同一次遍历里带着完整上下文映射完成，因此首条不会被中段裁剪。
- **反（单条上下文极大）**：即使窗口只剩一条，也允许其为完整上下文；此时不再继续裁剪，
  因为「首条完整」是硬语义。
- **反（展开链缺失基线）**：某条 delta 记录之前没有可用的 `previous` 时，
  `expandMessageCollection` 保持既有语义（直接返回，不拼接），不得因本次窗口化而改变。

## 验收场景

静态可验证：

1. `readModelTrajectory` 不再对尾部全部记录调用 `mapRecord`；窗口起点在映射前确定，
   且窗口起点只依赖 `rawRecords.length` 与各条自身的 `request.messages` 字节。
2. `expandMessageCollection` 的 delta 展开分支与 `"tail"` 基线短路逻辑逐字保持不变。
3. 新增常量 `MODEL_TRAJECTORY_MAX_RESULT_BYTES`；`DEFAULT_TRAJECTORY_LIMIT`（200）与
   `MAX_TRAJECTORY_READ_BYTES`（32 MiB）未被改动。
4. `truncated` 的计算包含尾部截断、条数超限、字节超限三种来源，字段类型与名称不变。
5. 字节计量复用 `utf8JsonByteLength`（`@zcode/shared/zcode-protocol-v4`），未新增同类工具函数。
6. `ModelTrajectoryTimeline` 的 `shouldAdjustScrollPositionOnItemSizeChange` 不再对屏幕下方的项
   返回真值；`!searchQuery` 的搜索期抑制保留。
7. `virtualizer.measure()` 只在搜索条件或当前命中变化时执行，不随 `mountedRowsKey` 重复执行；
   且清空缓存后签名才记录，避免 rAF 被取消时「标记已清空但实际未清空」。
8. `ModelTrajectoryExpandableMessage` 与 `createTrajectoryExpansionCommands` 的默认展开态一致
   （两者同为折叠），表头「展开全部/收起全部」的图标与文案与实际状态一致。
9. `ModelTrajectoryExpandedContent` 未引入 `content-visibility` / `contain-intrinsic-size`。
10. 没有新增进程、定时器、轮询、订阅或常驻缓存；折叠态下消息级 `ResizeObserver` 与
    `window` resize 监听不挂载（`CollapsibleContent` 未传 `forceMount`）。
11. `modelTrajectory.ts` 的行数豁免（`eslint-disable max-lines`）带明确理由：四段流程顺序耦合，
    拆分只会在文件间摊开同一读取契约。

已用真实源码验证（宿主侧，非应用运行）：

- 400 条 delta 记录的构造会话：改动前 `JSON.stringify` 抛 `RangeError: Invalid string length`；
  改动后返回 2 条、14.24 MiB、可序列化、`truncated: true`，且 delta 链完整性成立
  （每条返回记录的上下文长度等于其声明的 `messageCount`，首条保留完整起始上下文）。
- 真实会话（4 个曾打开过的 session）载荷 6.76–7.99 MiB、返回条数与改动前逐条一致、
  字节预算未丢弃任何记录。
- 消融：只按条数定窗口时，映射 200 条需约 4.6 s 而只返回 2 条；加上字节下界预判后同一输入
  降至约 58 ms，输出字节完全一致。

运行时（人工）验证：

1. 打开一个长会话的调用轨迹，观察渲染进程内存曲线：应在首次渲染后趋于平稳，不随停留时间
   持续上涨。
2. 面板内上下滚动：滚动位置不自行前移，滚动条长度不反复跳变。
3. 使用搜索：输入关键词后命中可跳转，清空搜索后滚动行为恢复正常。
4. 点击表头「展开全部」：所有消息展开，正文可读；再点击收起，正文移出 DOM。
5. 默认态：打开面板先看到标题行与预览，正文默认折叠；单条展开与收起均可用。
6. 打开轨迹后关闭侧边栏再重开：面板状态与滚动位置符合预期，无异常内存增长。

上述运行时场景只记录为人工验收清单，不在本项目修改流程中运行应用、单测或 E2E。

## 人工验收步骤

1. 启动桌面端，进入一个包含多次模型调用的会话。
2. 在任务菜单点击「查看调用轨迹」，等待面板加载完成。
3. 打开任务管理器（或开发者工具的 Memory 面板），记录渲染进程初始内存。
4. 保持面板打开 3–5 分钟不做操作，再次记录内存：不应出现数倍增长。
5. 在面板内滚动到顶部再滚到底部，重复数次，观察滚动位置是否自行漂移。
6. 展开若干条消息并复制内容，确认正文与复制文本正确（折叠不改变数据）。
7. 打开搜索输入关键词，确认命中数与跳转可用，然后清空搜索。
8. 关闭侧边栏并重新打开该轨迹面板，确认无异常增长且交互正常。

本次按项目约定只执行静态检查；上述交互场景作为人工验收清单记录，不运行应用、单测或 E2E。

## 已知边界

- 本机「保留完整模型记录」（`modelIoFullRetentionEnabled`）开启时，单条记录即含全量上下文，
  32 MiB 尾部只装 4–7 条，本改动对载荷基本无影响；本机症状的修复来自渲染侧的滚动补偿与
  测高门控，以及默认折叠。
- 该开关关闭（默认值）时记录为 delta 压缩，尾部可含上千条，宿主侧窗口化是避免
  `RangeError` 与数百 MB 返回体的必要条件。关闭该开关只省磁盘（单文件由 64 MiB 上限重置），
  不是本内存问题的解法。
- 折叠默认会改变首屏观感：打开面板先看到标题行预览，需展开才读正文。这是有意取舍，
  不是回归。

## 关闭与收起的资源语义

关闭与收起是两种不同语义，只有前者释放资源：

| 动作                                  | 载荷（`useModelTrajectory` state） | 依据                                                                                                        |
| ------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 关闭 tab（含关闭最后一个）            | **释放**                           | `AnimatedSidePanePanel` 以 `hasRenderedSidePane && sidePaneState` 门住内容；关 tab 后该项不再渲染，面板卸载 |
| 收起面板 / 切到其它 tab（tab 仍存在） | **保留**（有意为之）               | `hasRenderedSidePane` 首次置真后不复位，且每个 `TabsContent` 用 `forceMount`                                |

- **没有需要回收的进程**：轨迹读取发生在窗口级常驻 Host utility process 内，`getModelTrajectory`
  不派生进程或线程，这条路径上也没有定时器、轮询、文件监听或常驻缓存；因此「关闭后释放进程」
  在本特性里不成立，也没有可回收的对象。
- 保留是刻意的，不要改成「隐藏即释放」：那会让每次收起/展开、切 tab 都重新读取
  （本机实测宿主读取 104–178 ms，加 RPC 约 200–400 ms）并丢失滚动位置、展开态与搜索词，
  而这三项正是 `hasRenderedSidePane` 要保住的东西。
- 关闭后仍存活但**不持有载荷**的两处：注入到 `document.head` 的
  `zcode-model-trajectory-find-highlight-style` `<style>`（幂等单例，约 400 字节）；
  「最近关闭」列表（上限 8）与 workspace 级 LRU（上限 50）只存 `taskId` / `title` 元数据。
- **本特性唯一无界的路径是「同时开着的轨迹 tab 数」**：同一 task 复用同一个
  `model-trajectory:${taskId}` tab，但不同 task 各占一个且没有数量上限，每个都持一份载荷，
  收起面板不会释放其中任何一个。当前接受该状态：它由用户显式操作驱动、单份载荷有上限，
  且没有引入新机制的低成本收敛办法。若将来需要收敛，应针对「同时保留的 tab 数」设上限，
  而不是把释放挂到可见性上。
