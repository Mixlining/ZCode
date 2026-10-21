import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@zcode/shared";
import { BigModelCodingPlanSubscriptionProvider } from "../src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.js";
import { createCodingPlanSubscriptionService } from "../src/coding-plan-subscription/codingPlanSubscriptionService.js";

// 动态工作流快照的 Host 侧读取：本构建不读远端也不读环境变量（REMOTE_ROLLOUT_DISABLED
// 硬关闭，见 spec/vendor-disable.md 的变动历史），provider 直接返回缺省档位且不发请求。
// 用户选择由 codingPlanSubscriptionService 套在「提供」上。

function createProvider(apiClient: ApiClient) {
  return new BigModelCodingPlanSubscriptionProvider({
    apiClient,
    credentialService: { load: vi.fn() },
  });
}

const DEFAULT_CONFIG = {
  mode: "onDemand",
  enabled: true,
  source: "default",
  offeredMode: "onDemand",
};

describe("getDynamicWorkflowClientConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("硬关闭远端灰度：直接返回缺省 onDemand，不发任何请求", async () => {
    const apiClient: ApiClient = {
      request: vi.fn(async () => {
        throw new Error("must not request remote client config");
      }),
    };
    const provider = createProvider(apiClient);

    await expect(provider.getDynamicWorkflowClientConfig()).resolves.toEqual(DEFAULT_CONFIG);
    await expect(provider.getDynamicWorkflowClientConfig({ forceRefresh: true })).resolves.toEqual(
      DEFAULT_CONFIG,
    );
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it("环境变量不再影响档位", async () => {
    const apiClient: ApiClient = {
      request: vi.fn(async () => {
        throw new Error("must not request remote client config");
      }),
    };
    vi.stubEnv("ZCODE_DYNAMIC_WORKFLOW_MODE", "alwaysOn");

    await expect(createProvider(apiClient).getDynamicWorkflowClientConfig()).resolves.toEqual(
      DEFAULT_CONFIG,
    );
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it("service 把用户选择套在缺省提供上", async () => {
    const apiClient: ApiClient = {
      request: vi.fn(async () => {
        throw new Error("must not request remote client config");
      }),
    };
    const service = createCodingPlanSubscriptionService({
      apiClient,
      credentialService: { load: vi.fn() },
      resolveDynamicWorkflowUserMode: async () => "alwaysOn",
    });

    await expect(service.getDynamicWorkflowClientConfig()).resolves.toMatchObject({
      mode: "alwaysOn",
      enabled: true,
      offeredMode: "onDemand",
      userMode: "alwaysOn",
    });
    expect(apiClient.request).not.toHaveBeenCalled();
  });
});
