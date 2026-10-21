// ============================================================
// Dynamic Workflow：取值域、缺省档位与客户端快照
// ============================================================
// 上游由服务端 `/api/v1/client/configs` 下发 `data.configs.dynamicWorkflow.mode`。
// 本构建不读服务端（REMOTE_ROLLOUT_DISABLED 永久关闭该通道），也不读任何环境变量：
// 档位只有用户设置与下面的缺省值两个来源。决策记录见 spec/vendor-disable.md 的变动历史。

// 这里只放三端（Host services、Desktop main、UI）共用的取值域、归一化与快照形状；
// 读取设置与下发都在各自的 owner 里，不在 shared 层发请求。

export const DYNAMIC_WORKFLOW_MODES = ["disabled", "onDemand", "alwaysOn"] as const;
export type DynamicWorkflowMode = (typeof DYNAMIC_WORKFLOW_MODES)[number];

/**
 * 用户没有配置时的档位：「通过命令启用」。
 *
 * 选 `onDemand` 而不是 `alwaysOn`：`/workflow` 命令与技能入口默认可见，但十个工作流工具
 * 要等首次 `/workflow`、Resume 或 Configure 才注册给模型（launch.md「On demand: activation」），
 * 模型不会在普通对话里自行发起工作流。选它而不是 `disabled`：功能入口开箱可见，用户不必
 * 先去设置里找开关。
 */
export const DEFAULT_DYNAMIC_WORKFLOW_MODE: DynamicWorkflowMode = "onDemand";

export function normalizeDynamicWorkflowMode(value: unknown): DynamicWorkflowMode | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return (DYNAMIC_WORKFLOW_MODES as readonly string[]).includes(trimmed)
    ? (trimmed as DynamicWorkflowMode)
    : undefined;
}

/**
 * 「功能是否提供」的折叠：`onDemand` 与 `alwaysOn` 同为开启——目录里的 `/workflow`、技能、
 * 自动化页的工作流 tab 与 Resume 入口在两种模式下都在。两者的差别只在模型工具面的注册时机
 * （launch.md「On demand: activation」），由 CLI 侧按 mode 本身裁决，这里不参与。
 */
export function isDynamicWorkflowModeEnabled(mode: DynamicWorkflowMode): boolean {
  return mode !== "disabled";
}

/** 快照的来源：观测用，UI 与日志据此区分「服务端关」与「本地覆盖」。只描述「提供」来自哪里。 */
export type DynamicWorkflowClientConfigSource = "remote" | "override" | "default";

/**
 * 灰度快照（launch.md「Gray release」「The user's choice」）。两层：
 *   - 提供（offer）：服务端 key 或本地覆盖决定默认是哪个模式，记在 `offeredMode`（disabled 也只是默认值）；
 *   - 生效（effective）：用户在设置里的明确选择永远取代提供的模式，记在 `mode` / `enabled`。
 * 旧消费者读 `mode` / `enabled` 即得生效值；设置页读 `offeredMode` 决定「默认」标签。
 */
export interface DynamicWorkflowClientConfig {
  /** 生效模式：用户有选择时是用户选择，否则等于 offeredMode。 */
  readonly mode: DynamicWorkflowMode;
  /** 等于 isDynamicWorkflowModeEnabled(mode)；单独落字段免得每个消费者各写一遍折叠规则。 */
  readonly enabled: boolean;
  readonly source: DynamicWorkflowClientConfigSource;
  /** 服务端（或本地覆盖）提供的模式：用户没选时的生效模式，也是设置页的「默认」选项。 */
  readonly offeredMode: DynamicWorkflowMode;
  /** 实际生效的用户选择；缺席表示跟随提供的模式（未选择或非法值）。 */
  readonly userMode?: DynamicWorkflowMode;
}

export function createDynamicWorkflowClientConfig(
  offeredMode: DynamicWorkflowMode,
  source: DynamicWorkflowClientConfigSource,
): DynamicWorkflowClientConfig {
  return {
    mode: offeredMode,
    enabled: isDynamicWorkflowModeEnabled(offeredMode),
    source,
    offeredMode,
  };
}

/**
 * 读快照里服务端提供的默认模式（与用户选择无关）；设置行与中枢的「工作流设置」只在读得到时出现。
 * disabled 也是合法的默认值：此时行照样出现，「默认」标签落在「关闭」上。
 *
 * 快照可能来自没有 offeredMode 的旧 Host（新 UI——例如手机远控 bundle——连旧桌面）。旧 Host 不认
 * 用户选择，摆出设置行只会把选择写进一个不生效的设置，所以缺席或读不懂的 offeredMode 返回 undefined：
 * 只有认用户选择的 Host 才会写这个字段。
 */
export function readDynamicWorkflowOfferedMode(
  config: DynamicWorkflowClientConfig,
): DynamicWorkflowMode | undefined {
  return normalizeDynamicWorkflowMode(config.offeredMode);
}

/**
 * 「服务端给默认、用户选择永远生效」规则的唯一实现（launch.md「The user's choice」）：
 *   - 合法的用户选择取代提供的模式，提供的是 disabled 也一样——功能已全量，服务端只决定默认值；
 *   - 缺席或非法值（旧文件、未来版本写入的新值）按跟随提供的模式处理。
 * 只从 `offeredMode` 推导，所以对已应用过选择的快照再次应用是覆盖而不是叠加：Host 闩住的是提供，
 * 每次使用都用最新选择重新应用。
 */
export function applyDynamicWorkflowUserMode(
  config: DynamicWorkflowClientConfig,
  userMode: unknown,
): DynamicWorkflowClientConfig {
  const offer = createDynamicWorkflowClientConfig(config.offeredMode, config.source);
  const choice = normalizeDynamicWorkflowMode(userMode);
  if (!choice) return offer;
  return {
    ...offer,
    mode: choice,
    enabled: isDynamicWorkflowModeEnabled(choice),
    userMode: choice,
  };
}

/**
 * 纯函数：把远端 envelope 的 `configs.dynamicWorkflow` 折叠成「提供」，再应用用户选择。
 * 提供的优先级：远端合法值 > 缺省。远端成功但**未下发**该 key 也按缺省处理。
 *
 * 本构建没有环境变量覆盖层：`REMOTE_ROLLOUT_DISABLED` 让调用方永远传 `remote: undefined`，
 * 于是缺省值就是唯一的「提供」。`remote` 入参与其分支保留，只为降低上游同步成本。
 */
export function resolveDynamicWorkflowClientConfig(input: {
  remote: unknown;
  userMode?: unknown;
}): DynamicWorkflowClientConfig {
  return applyDynamicWorkflowUserMode(resolveDynamicWorkflowOffer(input), input.userMode);
}

function resolveDynamicWorkflowOffer(input: { remote: unknown }): DynamicWorkflowClientConfig {
  const remoteMode = normalizeDynamicWorkflowMode(
    typeof input.remote === "object" && input.remote !== null
      ? (input.remote as { mode?: unknown }).mode
      : undefined,
  );
  if (remoteMode) return createDynamicWorkflowClientConfig(remoteMode, "remote");
  return createDynamicWorkflowClientConfig(DEFAULT_DYNAMIC_WORKFLOW_MODE, "default");
}
