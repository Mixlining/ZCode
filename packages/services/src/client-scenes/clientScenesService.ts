import { CODING_PLAN_DISABLED, type ApiClient } from "@zcode/shared";
import { readApiJson } from "../providers/api/apiJson.js";
import { ZCODE_CLIENT_SCENES_URL } from "../providers/api/apiEndpoints.js";
import type { ClientScenesResponse, IClientScenesService } from "./clientScenes.js";

export function createClientScenesService(dependencies: {
  apiClient: ApiClient;
}): IClientScenesService {
  return {
    list: () =>
      // 厂商读取硬关闭：建议提示词与自动化模板整体停用，不再请求 /api/v1/client/scenes。
      // 返回空列表而不是错误，且不写 warn 日志——调用方已经能自然降级为空态，
      // 手动创建入口保留；这里报错只会产生用户无法处置的噪声。
      CODING_PLAN_DISABLED
        ? Promise.resolve({ code: 0, msg: "", data: [] } satisfies ClientScenesResponse)
        : readApiJson<ClientScenesResponse>(dependencies.apiClient, ZCODE_CLIENT_SCENES_URL, {
            method: "GET",
          }),
  };
}
