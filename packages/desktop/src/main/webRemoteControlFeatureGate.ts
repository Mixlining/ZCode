export interface WebRemoteControlFeatureGate {
  isEnabled(): boolean;
  assertEnabled(): void;
}

/**
 * 默认关闭：本构建不支持手机远控（PHONE_REMOTE_DISABLED 永久为真），
 * 任何忘记传参的新调用方都必须得到「不可用」，而不是静默打开 relay 连接。
 */
export function createWebRemoteControlFeatureGate(enabled = false): WebRemoteControlFeatureGate {
  return {
    isEnabled: () => enabled,
    assertEnabled: () => {
      if (!enabled) {
        throw new Error("Web remote control is disabled in this build");
      }
    },
  };
}
