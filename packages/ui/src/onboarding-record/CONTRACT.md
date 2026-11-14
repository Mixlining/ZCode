# 引导完成记录 UI 接缝

公开入口保留 `../hooks/useOnboardingRecordService.ts`。记录事实属于 Host 的既有 onboarding 服务，本模块只读取服务上下文，不读取 Repo，不复制记录。

Hook 在每次渲染固定调用 `useOptionalServices`；没有 Provider、Host 没有该服务或可选代理无法读取时返回 null。获取服务属性的异常处理不包裹 Hook。使用服务的业务流程仍属于既有 onboarding 页面。

人工验收：独立渲染且没有服务上下文时返回 null；有服务的本地窗口仍能读取和写入既有完成记录，不增加上传或轮询。实现只执行静态验证。
