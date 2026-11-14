import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRuntimeHostBuild, verifyRuntimeHostPe } from "../build-windows-runtime-host.mjs";
import {
  resolveWindowsCmakeGenerator,
  resolveWindowsCmakeGeneratorFromVsVersion,
} from "../windows-visual-studio.mjs";

test("Windows builds both supported architectures with the matching MSVC target", () => {
  assert.deepEqual(resolveRuntimeHostBuild("x64", "win32").configureArgs, [
    "-G",
    "Visual Studio 17 2022",
    "-A",
    "x64",
  ]);
  assert.deepEqual(resolveRuntimeHostBuild("arm64", "win32").configureArgs, [
    "-G",
    "Visual Studio 17 2022",
    "-A",
    "ARM64",
  ]);
  assert.deepEqual(
    resolveRuntimeHostBuild("x64", "win32", undefined, "Visual Studio 18 2026").configureArgs,
    ["-G", "Visual Studio 18 2026", "-A", "x64"],
  );
  assert.throws(() => resolveRuntimeHostBuild("ia32", "win32"), /architecture/);
});
test("Windows generator follows the installed Visual Studio major", () => {
  assert.equal(
    resolveWindowsCmakeGeneratorFromVsVersion("18.11.12328.437"),
    "Visual Studio 18 2026",
  );
  assert.equal(resolveWindowsCmakeGeneratorFromVsVersion("17.14.36518.9"), "Visual Studio 17 2022");
  assert.equal(resolveWindowsCmakeGeneratorFromVsVersion(""), null);
  assert.equal(
    resolveWindowsCmakeGenerator({
      platform: "win32",
      env: { ProgramFiles: "C:\\definitely-missing" },
      vswhere: "vswhere.exe",
      execFileSync: () => "18.11.12328.437\r\n",
    }),
    "Visual Studio 18 2026",
  );
  assert.equal(
    resolveWindowsCmakeGenerator({
      platform: "win32",
      env: { ProgramFiles: "C:\\definitely-missing" },
      vswhere: "vswhere.exe",
      execFileSync: () => "",
    }),
    "Visual Studio 17 2022",
  );
  assert.equal(
    resolveWindowsCmakeGenerator({
      platform: "win32",
      env: { ZCODE_WINDOWS_CMAKE_GENERATOR: "Custom VS" },
    }),
    "Custom VS",
  );
  assert.equal(
    resolveWindowsCmakeGenerator({ platform: "linux", env: {} }),
    "Visual Studio 17 2022",
  );
});
test("cross builds explicitly select a Windows compiler", () => {
  assert.ok(
    resolveRuntimeHostBuild("x64", "linux").configureArgs.includes("-DCMAKE_SYSTEM_NAME=Windows"),
  );
  assert.ok(
    resolveRuntimeHostBuild("arm64", "linux", "example-clang++").configureArgs.includes(
      "-DCMAKE_CXX_COMPILER=example-clang++",
    ),
  );
});
test("packaging rejects wrong-architecture and corrupt PE binaries", () => {
  const bytes = Buffer.alloc(128);
  bytes.write("MZ");
  bytes.writeUInt32LE(64, 60);
  bytes.write("PE\0\0", 64);
  bytes.writeUInt16LE(0x8664, 68);
  verifyRuntimeHostPe(bytes, "x64");
  assert.throws(() => verifyRuntimeHostPe(bytes, "arm64"), /architecture/);
  assert.throws(() => verifyRuntimeHostPe(Buffer.from("bad"), "x64"), /PE/);
});
