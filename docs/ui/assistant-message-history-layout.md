# Assistant Message History Layout

> **历史状态**：本文记录 V4 迁移前 `ChatMessage` 的 DOM 方案，不是当前实现规范。
> 当前 assistant 内容由 `packages/ui/src/v4/ConversationTurnGroup.tsx` 与
> `packages/ui/src/v4/ConversationRowView.tsx` 按 projection rows/render units 渲染。

## 目标

调整 assistant 消息 DOM 结构，让同一条 `.is-assistant` 内部可以稳定区分“历史片段”和“最新片段”，方便样式和行为按层处理。

## 历史结构

- `packages/ui/src/ChatMessage.tsx`
  - `.is-assistant` 仍然是单条 assistant 消息的根容器
  - 任务运行中，所有片段统一包进 `.history-message`
  - 任务结束后，最后一个普通文本响应 `content part` 才会从 history 提升到 `.latest-message`
  - `.history-message` 现在使用 `Collapsible` 承载
  - 当前轮运行时历史区强制展开且不可收起，trigger 文案为 `Working for ...`
  - 当前轮结束后历史区默认收起且可手动展开，trigger 文案为 `Worked for ...`
  - 被提升出来的最后一个普通文本响应作为最新片段，挂在 `.history-message` 后面
  - `MessageChangeSummaryPanel` 继续挂在 assistant 容器尾部，不进入 `.history-message`

## DOM 语义

```html
<div class="is-assistant">
  <div class="history-message">
    <button>Worked for 1m 18s ></button>
    <div>...</div>
  </div>
  <div class="latest-message">latest part</div>
  <div>change summary</div>
</div>
```

## 约束

- `.history-message` 只在存在历史片段时渲染
- 单片段 assistant 消息保持原样，不额外制造空容器
- `latest-message` 只承载普通 assistant 文本响应，不承载 thought 或 tool block
- `change summary` 仍然归属于当前 assistant 消息，但语义上独立于 history/latest 分层
- 工作时长按语言使用自然的单位间距：英文数字与单位紧贴（如 `Worked for 7m 30s`），中文数字与单位之间保留空格（如 `已工作 7 分 30 秒`）；多个时长片段之间统一用一个空格分隔

## 2026-10-25：折叠内容的计算生命周期

工具历史的分组/过滤与 React 工作项树构建必须位于 CollapsibleContent 实际挂载的内容子组件内。关闭动画完成、Radix 卸载内容后不再执行；不得仅隐藏 DOM 而在外层继续派生。展开与关闭动画由原 Radix Presence/Collapsible 持有，不另加计时器或同步 open 副本。过滤后为空时，内容容器不能残留 padding、兄弟间距或高度；正常流 running tail 与滚动锚点不改变。

时序：用户展开 → Radix 挂载内容 → 派生工作项 → 有内容才创建内层间距；用户收起 → 原关闭动画 → Radix 卸载 → 停止工作项派生。后续历史行更新不得重建未挂载的工作项。

文件摘要文本仅在非 Office 模式且该轮存在 fileChanges、确有摘要面板消费时拼接；复制文本与代码评论投影仍走原逻辑。

人工验收：大量工具历史折叠后继续流式输出，无隐藏列表分组计算；展开/收起动画、滚动及工具分组正常；隐藏 reasoning/CUA 消费后为空不留空白；无文件变更或 Office 模式不拼接摘要文本，显示摘要时内容正确。只执行静态检查，不自动跑应用/单测/E2E。合并上游时复核派生是否被移回外层或加入 forceMount。
