import { cpSync, existsSync, mkdirSync } from "node:fs";
import { access, cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";

const require = createRequire(import.meta.url);

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function ensureStagedTargetNodePtyPrebuild({
  desktopPackageRoot,
  stagingDir,
  targetPlatform,
}) {
  const stagedPackageRoot = resolve(stagingDir, "node_modules", "node-pty");
  const stagedPrebuildDir = resolve(stagedPackageRoot, "prebuilds", targetPlatform.key);
  const packagePresent = await pathExists(resolve(stagedPackageRoot, "package.json"));
  const prebuildPresent = await pathExists(resolve(stagedPrebuildDir, "pty.node"));
  if (packagePresent && prebuildPresent) return;

  let sourcePackageRoot;
  try {
    sourcePackageRoot = dirname(
      require.resolve("node-pty/package.json", { paths: [desktopPackageRoot] }),
    );
    if (!prebuildPresent) {
      await access(resolve(sourcePackageRoot, "prebuilds", targetPlatform.key, "pty.node"));
    }
  } catch (error) {
    // 修复：pnpm 11 的 hoisted 布局可能让 builder 漏装 node-pty；源包缺失时必须在替换 asar 前明确失败。
    throw new Error(`重打包缺少 ${targetPlatform.key} 的 node-pty 包或 pty.node`, {
      cause: error,
    });
  }

  if (!packagePresent) {
    await mkdir(dirname(stagedPackageRoot), { recursive: true });
    await cp(sourcePackageRoot, stagedPackageRoot, {
      recursive: true,
      filter: (sourcePath) => {
        const firstSegment = relative(sourcePackageRoot, sourcePath)
          .replaceAll("\\", "/")
          .split("/")[0];
        // 只恢复 JS 包本体；native 与构建缓存分别按目标平台处理，避免把其他平台资产带回 asar。
        return !["prebuilds", "build", "bin", "node_modules"].includes(firstSegment);
      },
    });
  }

  if (!prebuildPresent) {
    await mkdir(dirname(stagedPrebuildDir), { recursive: true });
    await cp(resolve(sourcePackageRoot, "prebuilds", targetPlatform.key), stagedPrebuildDir, {
      recursive: true,
    });
  }
}

export function restoreTargetNodePtyPrebuild({ desktopPackageRoot, targetPlatform }) {
  if (targetPlatform.os !== "linux") {
    console.log(`[beforePack] node-pty prebuild restore skipped for ${targetPlatform.key}`);
    return;
  }

  const platformKey = targetPlatform.key;
  const sourcePackageName = `@lydell/node-pty-${platformKey}`;
  let sourceBinaryPath;

  try {
    sourceBinaryPath = resolveSourceNodePtyPrebuildPath({ sourcePackageName, platformKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`缺少 ${sourcePackageName}，无法为 ${platformKey} 打包 node-pty: ${message}`);
  }

  const nodePtyPackageRoot = dirname(
    require.resolve("node-pty/package.json", { paths: [desktopPackageRoot] }),
  );
  const targetPrebuildDir = resolve(nodePtyPackageRoot, "prebuilds", platformKey);
  const targetBinaryPath = resolve(targetPrebuildDir, "pty.node");

  // Linux 包中 node-pty 本体只会查自己的 prebuilds/linux-*/pty.node，
  // 但 Linux 预编译文件实际来自 @lydell/node-pty-linux-* 平台包；若排除该平台包，
  // 而 node-pty 自身目录没有 linux prebuild，最终安装包里会缺 pty.node，终端启动失败。
  // 这里在 beforePack 阶段恢复依赖资产，让后续 asarUnpack 按标准链路处理 native addon。
  mkdirSync(targetPrebuildDir, { recursive: true });
  cpSync(sourceBinaryPath, targetBinaryPath);

  if (!existsSync(targetBinaryPath))
    throw new Error(`node-pty 预编译产物恢复失败: ${targetBinaryPath}`);

  console.log(`[beforePack] node-pty prebuild restored: ${targetBinaryPath}`);
}

export function resolveSourceNodePtyPrebuildPath({ sourcePackageName, platformKey }) {
  const sourcePackageEntry = require.resolve(sourcePackageName);
  let currentDir = dirname(sourcePackageEntry);

  while (currentDir !== dirname(currentDir)) {
    const candidatePath = resolve(currentDir, "prebuilds", platformKey, "pty.node");
    if (existsSync(candidatePath)) return candidatePath;

    currentDir = dirname(currentDir);
  }

  // @lydell/node-pty-linux-* 通过 package exports 只暴露 lib/index.js，
  // 不能再解析 package.json。这里从公开入口向上寻找 prebuilds，兼容 exports 限制。
  throw new Error(
    `缺少 node-pty 预编译产物: ${sourcePackageName}/prebuilds/${platformKey}/pty.node`,
  );
}

export function resolvePackagedNodePtyPrebuildPath({ resourcesDir, platformKey }) {
  return resolve(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
    "node-pty",
    "prebuilds",
    platformKey,
    "pty.node",
  );
}
