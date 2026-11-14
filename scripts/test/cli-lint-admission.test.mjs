import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyLintDiagnostics,
  parseLintCommand,
  resolvePnpmInvocation,
} from "../cli-lint-admission.mjs";

test("pnpm JavaScript 与独立可执行入口分别启动，保留空格路径和参数", () => {
  const args = ["exec", "oxlint", "src folder", "--format", "json"];
  assert.deepEqual(resolvePnpmInvocation("C:/pnpm store/pnpm.cjs", args, "C:/Node/node.exe"), {
    command: "C:/Node/node.exe",
    args: ["C:/pnpm store/pnpm.cjs", ...args],
  });
  for (const executable of ["C:/pnpm store/pnpm.exe", "/opt/pnpm bin/pnpm"]) {
    assert.deepEqual(resolvePnpmInvocation(executable, args, "node"), {
      command: executable,
      args,
    });
  }
});

test("只接纳原样上游的行数诊断，其他错误与修改过的文件仍阻断", () => {
  const diagnostics = [
    { filename: "src/original.ts", code: "eslint(max-lines)", severity: "error" },
    { filename: "src/edited.ts", code: "eslint(max-lines)", severity: "error" },
    { filename: "src/original.ts", code: "typescript(no-explicit-any)", severity: "error" },
    { filename: "src/original.ts", code: "eslint(no-unused-vars)", severity: "warning" },
  ];
  const result = classifyLintDiagnostics(diagnostics, {
    relativeDirectory: "apps/zcode-cli/packages/example",
    pristine: new Set(["apps/zcode-cli/packages/example/src/original.ts"]),
  });
  assert.deepEqual(result.accepted, [diagnostics[0]]);
  assert.deepEqual(result.errors, diagnostics.slice(1, 3));
  assert.deepEqual(result.warnings, [diagnostics[3]]);
});

test("保留包原有参数；不默默绕过未知或复合命令", () => {
  assert.deepEqual(parseLintCommand("oxlint src tests --no-ignore"), [
    "src",
    "tests",
    "--no-ignore",
  ]);
  for (const command of [
    "tsc --noEmit",
    "oxlint src && echo done",
    "oxlint 'src path'",
    "oxlint --format text src",
  ])
    assert.throws(() => parseLintCommand(command), /不支持/);
});
