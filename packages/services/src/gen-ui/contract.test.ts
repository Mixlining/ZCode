import { Emitter } from "@zcode/rpc";
import type { GenUiStateChange } from "@zcode/shared/gen-ui";
import { describe, expect, it } from "vitest";
import { exampleGenUiPrepare } from "./contract.example.js";
import { IGenUiService } from "./contract.js";

describe("gen-ui-service contract", () => {
  it("公开描述符与契约示例保持可调用", async () => {
    // CI 的全量架构门禁要求 managed module 自带契约测试工件；用公开接口构造替身，
    // 让后续契约字段变化必须同步示例，而不重复 adapter 的文件与持久化测试。
    const stateChanges = new Emitter<GenUiStateChange>();
    const service: IGenUiService = {
      readDocument: async (target) => ({ path: target.path, html: "<div>Example</div>" }),
      prepareSandbox: async (input) => ({
        instance: {
          runtimeId: "contract-example",
          generation: 1,
          token: "contract-token",
          appIdentity: "a".repeat(64),
        },
        sandboxId: input.instanceKey,
        initId: 1,
        shellUrl: "zcode-sandbox://contract-example/",
        partition: "persist:gen-ui-contract-example",
      }),
      getState: async () => null,
      setState: async () => undefined,
      listState: async () => [],
      onStateChanged: stateChanges.event,
    };

    expect(IGenUiService.channelName).toBe("gen-ui");
    await expect(service.readDocument(exampleGenUiPrepare)).resolves.toEqual({
      path: exampleGenUiPrepare.path,
      html: "<div>Example</div>",
    });
    await expect(service.prepareSandbox(exampleGenUiPrepare)).resolves.toMatchObject({
      sandboxId: exampleGenUiPrepare.instanceKey,
      initId: 1,
    });
    stateChanges.dispose();
  });
});
