import { createContext } from "react";
import type { TrajectoryVisualRole } from "@/ModelTrajectoryRoleStyles.js";

export interface TrajectoryExpansionCommand {
  expanded: boolean;
  version: number;
}

export type TrajectoryExpansionCommands = Record<TrajectoryVisualRole, TrajectoryExpansionCommand>;

export const TRAJECTORY_EXPANSION_KINDS: readonly TrajectoryVisualRole[] = [
  "system",
  "user",
  "reasoning",
  "assistant",
  "tool-call",
  "tool-result",
];

export function createTrajectoryExpansionCommands(): TrajectoryExpansionCommands {
  // 与 ExpandableTrajectoryMessage 的默认折叠态保持一致：表头「展开全部/收起全部」的图标
  // 由 willExpandAll 从这里的 expanded 推出，两处默认值不一致会让图标与文案和实际状态相反。
  return Object.fromEntries(
    TRAJECTORY_EXPANSION_KINDS.map((kind) => [kind, { expanded: false, version: 0 }]),
  ) as TrajectoryExpansionCommands;
}

export const TrajectoryExpansionCommandContext = createContext<TrajectoryExpansionCommands | null>(
  null,
);

export interface TrajectoryExpansionOverride {
  open: boolean;
  commandVersion: number;
}

interface TrajectoryExpansionRegistry {
  overrides: ReadonlyMap<string, TrajectoryExpansionOverride>;
  setOverride: (key: string, override: TrajectoryExpansionOverride) => void;
}

export const TrajectoryExpansionRegistryContext = createContext<TrajectoryExpansionRegistry | null>(
  null,
);
