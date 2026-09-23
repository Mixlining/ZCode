import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, type RefObject } from "react";
import type { ZCodeModelTrajectoryRecord } from "@zcode/services";
import {
  type TrajectorySearchMatch,
  type TrajectorySearchTimelineItem,
} from "@/ModelTrajectorySearch.js";
import {
  applyTrajectorySearchHighlights,
  clearTrajectorySearchHighlights,
  isTrajectorySearchTargetMounted,
  scrollTrajectorySearchRangeIntoView,
} from "@/ModelTrajectorySearchHighlight.js";
import { CallCard, type IntlShape } from "@/ModelTrajectoryPaneParts.js";

export function ModelTrajectoryTimeline({
  items,
  searchQuery,
  searchMatches,
  activeSearchMatch,
  intl,
  scrollContainerRef,
}: {
  items: TrajectorySearchTimelineItem[];
  searchQuery: string;
  searchMatches: TrajectorySearchMatch[];
  activeSearchMatch: TrajectorySearchMatch | null;
  intl: IntlShape;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  // 上一次触发 measure() 的搜索条件与命中签名；用来把清空测高缓存限制在搜索语义真正变化时。
  const measuredRevealSignatureRef = useRef<string | null>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    getItemKey: (index) => items[index]?.key ?? index,
    estimateSize: () => 240,
    overscan: 3,
  });
  // 搜索切换会同时收起旧命中并展开新命中；此时禁止 virtualizer 根据每次测高回调连续
  // 修正滚动锚点，由下方文本级定位在布局稳定后一次完成滚动。
  // 判据必须与 @tanstack/react-virtual 的默认语义一致（只补偿视口上方的项）：轨迹卡片高度
  // 远大于 estimateSize，屏外项测高同样会回调这里，无条件返回 true 会把滚动位置持续向前推，
  // 触发滚动观察者清零 scrollAdjustments 后再次测高，形成自维持的挂载窗口前移。
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) =>
    !searchQuery && item.start < (scrollContainerRef.current?.scrollTop ?? 0);
  const roleWidthLabels = ["system", "user", "assistant", "tool"].map((role) =>
    intl.formatMessage({ id: `modelTrajectory.role.${role}` }),
  );
  const virtualItems = virtualizer.getVirtualItems();
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems.at(-1);
  const topSpacerHeight = firstVirtualItem?.start ?? 0;
  const bottomSpacerHeight = lastVirtualItem ? virtualizer.getTotalSize() - lastVirtualItem.end : 0;
  // 只跟踪挂载集合。把 start 放进依赖会让每次动态测高都重新安排一次精确滚动。
  const mountedRowsKey = virtualItems.map((item) => item.key).join("|");

  useEffect(() => () => clearTrajectorySearchHighlights(), []);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (
      !activeSearchMatch ||
      !root ||
      isTrajectorySearchTargetMounted(root, activeSearchMatch.expansionKey)
    ) {
      return;
    }
    // 目标已经挂载时跳过 Call 级预滚动，否则随后文本级定位会造成连续两次跳动。
    virtualizer.scrollToIndex(activeSearchMatch.callIndex, { align: "center" });
  }, [activeSearchMatch, scrollContainerRef, virtualizer]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || !searchQuery) {
      measuredRevealSignatureRef.current = null;
      clearTrajectorySearchHighlights();
      return;
    }
    // measure() 会清空整个 itemSizeCache。它只能由「搜索条件或当前命中变化」驱动：
    // 若跟随 mountedRowsKey 每次挂载集合变化都执行，就会形成
    // 清空缓存 → 重新测高 → 挂载集合变化 → 再次清空的自我维持循环。
    // 纯滚动引起的挂载集合变化由各行挂载时的 measureElement 自行上报，无需清空缓存。
    // 签名在真正执行 measure() 之后才记录：若本轮 rAF 被下一次依赖变化取消，签名保持未记录，
    // 下一轮仍会补做一次清空，避免「标记已清空但实际从未清空」。
    const revealSignature = `${searchQuery}\u0000${activeSearchMatch?.expansionKey ?? ""}`;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      if (measuredRevealSignatureRef.current !== revealSignature) {
        virtualizer.measure();
        measuredRevealSignatureRef.current = revealSignature;
      }
      secondFrame = window.requestAnimationFrame(() => {
        const activeRange = applyTrajectorySearchHighlights({
          root,
          query: searchQuery,
          matches: searchMatches,
          activeMatch: activeSearchMatch,
        });
        if (activeRange) scrollTrajectorySearchRangeIntoView(activeRange, root);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [
    activeSearchMatch,
    mountedRowsKey,
    scrollContainerRef,
    searchMatches,
    searchQuery,
    virtualizer,
  ]);

  return (
    <ol
      data-trajectory-timeline=""
      className="grid grid-cols-[max-content_minmax(0,1fr)_auto] gap-x-2"
    >
      {roleWidthLabels.map((label) => (
        <li
          key={label}
          aria-hidden="true"
          className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap font-mono text-ui-sm"
        >
          {label}
        </li>
      ))}
      {topSpacerHeight > 0 ? (
        <li aria-hidden="true" className="col-span-full" style={{ height: topSpacerHeight }} />
      ) : null}
      {virtualItems.map((virtualItem) => {
        const item = items[virtualItem.index];
        if (!item) return null;
        return (
          <li
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-trajectory-virtual-row=""
            className="col-span-full grid w-full grid-cols-subgrid"
          >
            <CallCard
              record={item.record}
              index={virtualItem.index}
              inputMessages={item.inputMessages}
              expansionKeyPrefix={item.key}
              intl={intl}
            />
          </li>
        );
      })}
      {bottomSpacerHeight > 0 ? (
        <li aria-hidden="true" className="col-span-full" style={{ height: bottomSpacerHeight }} />
      ) : null}
    </ol>
  );
}

export function resolveTrajectoryTimelineItems(records: ZCodeModelTrajectoryRecord[]) {
  let previousConversationMessageCount = 0;

  return records.map((record, index) => {
    const resolvedInput = resolveTrajectoryInputMessages({
      index,
      previousConversationMessageCount,
      record,
    });
    previousConversationMessageCount = resolvedInput.nextConversationMessageCount;

    return {
      key: `${record.requestId}:${index}`,
      record,
      inputMessages: resolvedInput.inputMessages,
    };
  });
}

export function resolveTrajectoryInputMessages({
  record,
  index,
  previousConversationMessageCount,
}: {
  record: ZCodeModelTrajectoryRecord;
  index: number;
  previousConversationMessageCount: number;
}): {
  inputMessages: ZCodeModelTrajectoryRecord["request"]["messages"];
  nextConversationMessageCount: number;
} {
  const messages = record.request.messages;
  const usesConversationDelta = shouldUseConversationDelta(record);
  const deltaMessages = usesConversationDelta
    ? computeDeltaMessages(messages, previousConversationMessageCount, index)
    : messages;

  return {
    // 首条展示完整起始上下文；后续主会话只展示非 assistant 的新增（assistant 由上一条 Output 呈现）。
    // sidecar/compact 等辅助请求有独立 prompt，不能套用主会话的消息数 delta，否则会隐藏标题生成 prompt。
    inputMessages: usesConversationDelta
      ? index === 0
        ? deltaMessages
        : deltaMessages.filter((message) => message.role !== "assistant")
      : deltaMessages,
    nextConversationMessageCount: usesConversationDelta
      ? messages.length
      : previousConversationMessageCount,
  };
}

function shouldUseConversationDelta(record: ZCodeModelTrajectoryRecord): boolean {
  const kind = record.callSource?.kind;
  return kind === undefined || kind === "main" || kind === "subagent";
}

function computeDeltaMessages(
  messages: ZCodeModelTrajectoryRecord["request"]["messages"],
  previousMessageCount: number,
  index: number,
): ZCodeModelTrajectoryRecord["request"]["messages"] {
  if (index === 0) return messages;
  if (messages.length > previousMessageCount) return messages.slice(previousMessageCount);
  if (messages.length < previousMessageCount) return messages;
  return [];
}
