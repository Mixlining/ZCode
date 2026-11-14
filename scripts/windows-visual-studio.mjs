import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

// Bugfix: GitHub Actions 在 2026-06 把 windows-latest 迁移到 Visual Studio 2026（v18），
// runner 上不再安装 VS 2022。构建脚本原先硬编码 "Visual Studio 17 2022"，CMake 因此报
// "could not find any instance of Visual Studio"，Windows 打包在 runtime host 步骤中断。
// 这里按 vswhere 读到的实际 VS 主版本选择 generator，保留 VS 2022 兼容，并允许
// ZCODE_WINDOWS_CMAKE_GENERATOR 显式覆盖（本地多版本或自定义工具链）。
// 注意：Visual Studio 18 2026 generator 需要 CMake >= 4.2；GitHub windows-latest
// 的 CMake 4.4.5 满足，VS 2022 仍由 CMake 3.x 支持。
export const DEFAULT_WINDOWS_CMAKE_GENERATOR = "Visual Studio 17 2022";

const VS_MAJOR_GENERATORS = new Map([
  [18, "Visual Studio 18 2026"],
  [17, "Visual Studio 17 2022"],
  [16, "Visual Studio 16 2019"],
]);

const INSTALL_ROOT_GENERATORS = [
  ["2026", "Visual Studio 18 2026"],
  ["2022", "Visual Studio 17 2022"],
  ["2019", "Visual Studio 16 2019"],
];

export function resolveWindowsCmakeGeneratorFromVsVersion(version) {
  const major = Number.parseInt(
    String(version ?? "")
      .trim()
      .split(".")[0],
    10,
  );
  return Number.isInteger(major) ? (VS_MAJOR_GENERATORS.get(major) ?? null) : null;
}

function resolveVswherePath(env) {
  const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const programFiles = env.ProgramFiles || "C:\\Program Files";
  const candidates = [
    join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe"),
    join(programFiles, "Microsoft Visual Studio", "Installer", "vswhere.exe"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function queryInstalledVsVersion(vswhere, env, execFileSyncImpl) {
  try {
    return execFileSyncImpl(
      vswhere,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property",
        "installationVersion",
      ],
      { encoding: "utf8", env, stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
    ).trim();
  } catch {
    // vswhere 缺失或查询失败时退回安装目录探测，不能让 generator 探测本身阻断构建。
    return "";
  }
}

function detectGeneratorFromInstallRoots(env) {
  const programFiles = env.ProgramFiles || "C:\\Program Files";
  for (const [year, generator] of INSTALL_ROOT_GENERATORS) {
    if (existsSync(join(programFiles, "Microsoft Visual Studio", year))) return generator;
  }
  return null;
}

export function resolveWindowsCmakeGenerator({
  env = process.env,
  platform = process.platform,
  vswhere = resolveVswherePath(env),
  execFileSync: execFileSyncImpl = execFileSync,
} = {}) {
  const explicit = env.ZCODE_WINDOWS_CMAKE_GENERATOR?.trim();
  if (explicit) return explicit;
  // 非 Windows 宿主走 MinGW 交叉编译，generator 不参与 configure。
  if (platform !== "win32") return DEFAULT_WINDOWS_CMAKE_GENERATOR;
  return (
    resolveWindowsCmakeGeneratorFromVsVersion(
      queryInstalledVsVersion(vswhere, env, execFileSyncImpl),
    ) ??
    detectGeneratorFromInstallRoots(env) ??
    DEFAULT_WINDOWS_CMAKE_GENERATOR
  );
}
