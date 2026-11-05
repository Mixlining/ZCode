import type { IPlatformService } from "@zcode/shared";

/**
 * 2026-11 OTel 移除后的显式 no-op。
 *
 * 本地 TTFT 观测已按 spec/dependency-upgrade-2026-11.md 永久关闭：这里不读取 platform 的
 * trace 配置/batch 方法，不创建 LocalTtftObserver，不注册监听或定时器，也不发送 batch。
 * 保留函数签名与 contract.ts 入口，避免改变 architecture policy 的 `local-ttft-desktop`
 * 模块边界。
 */
export function initializeDesktopLocalTtft(_platform: IPlatformService): () => void {
  return () => {};
}
