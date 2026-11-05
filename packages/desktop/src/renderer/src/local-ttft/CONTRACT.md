# local-ttft-desktop

> 2026-11 起：本地 TTFT 观测为 hard-disable no-op（见 `spec/dependency-upgrade-2026-11.md`）。
> `initialize.ts` 不读取平台 trace 配置、不创建 `LocalTtftObserver`、不创建定时器、不发送 batch。
> `contract.ts` / `module.ts` / `contract.example.ts` 与 architecture policy 条目保留，仅用于维持模块边界。
> 依赖该观测数据的 local-logs E2E 已按 e2e-case-lifecycle 退役；历史时序与字段说明见
> `docs/monitoring/ttft-stage-telemetry.md`（已标注为历史）。
