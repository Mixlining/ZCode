import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
// dev 固定的 Oxlint 版本使用规范化规则名，旧 eslint-plugin 前缀会让断言漏报。
const dependenciesRule = "react-hooks(exhaustive-deps)";
const hooksRule = "react-hooks(rules-of-hooks)";

async function lint(source, file = "packages/ui/src/Example.tsx", packageDirectory = ".") {
  const cwd = await mkdtemp(join(tmpdir(), "zcode-hooks-lint-"));
  try {
    await writeFile(join(cwd, ".oxlintrc.json"), await readFile(join(root, ".oxlintrc.json")));
    await mkdir(dirname(join(cwd, file)), { recursive: true });
    await writeFile(join(cwd, file), source);
    const target = packageDirectory === "." ? file : file.slice(packageDirectory.length + 1);
    const result = await exec(
      process.execPath,
      [join(root, "node_modules/oxlint/bin/oxlint"), "--format", "json", target],
      { cwd: join(cwd, packageDirectory) },
    ).catch((error) => {
      if (error.code !== 1 || !error.stdout) throw error;
      return error;
    });
    return { code: result.code ?? 0, diagnostics: JSON.parse(result.stdout).diagnostics };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("missing and unnecessary dependencies are warnings from root and package lint", async () => {
  const source = `import { useCallback } from "react";
export function useMissing(value: number) { return useCallback(() => value, []); }
export function useExtra(value: number) { return useCallback(() => 1, [value]); }`;
  for (const directory of [".", "packages/ui"]) {
    const result = await lint(source, "packages/ui/src/Example.tsx", directory);
    const diagnostics = result.diagnostics.filter((item) => item.code === dependenciesRule);
    assert.equal(diagnostics.length, 2);
    assert.ok(diagnostics.some((item) => item.message.includes("missing dependency")));
    assert.ok(diagnostics.some((item) => item.message.includes("unnecessary dependency")));
    assert.ok(diagnostics.every((item) => item.severity === "warning"));
    assert.equal(result.code, 0);
  }
});

test("conditional Hooks block new files and all previously admitted legacy files", async () => {
  const source = `import { useState } from "react";
export function Example({ enabled }: { enabled: boolean }) {
  if (enabled) return useState(0)[0];
  return null;
}`;
  const regular = await lint(source);
  assert.equal(regular.code, 1);
  assert.equal(regular.diagnostics.find((item) => item.code === hooksRule)?.severity, "error");
  for (const file of [
    "packages/ui/src/hooks/useZCodeAgentService.ts",
    "packages/ui/src/hooks/useZCodeSessionService.ts",
    "packages/ui/src/hooks/useZCodeTaskService.ts",
    "packages/ui/src/hooks/useOnboardingRecordService.ts",
    "packages/ui/src/ToolCallBlocks/renderers/resume-workflow-run.tsx",
    "packages/ui/src/project-sidebar/grouped/task-row.tsx",
    "packages/desktop/test/e2e/helpers/web-remote-visibility-browser.ts",
  ]) {
    const legacy = await lint(source, file);
    assert.equal(legacy.code, 1, file);
    assert.equal(
      legacy.diagnostics.find((item) => item.code === hooksRule)?.severity,
      "error",
      file,
    );
  }
});

test("precise callbacks and whole-object dependencies keep the native rule semantics", async () => {
  const result = await lint(`import { useCallback } from "react";
type Props = { onOpen: () => void; unrelated: number };
declare function open(props: Props): void;
export function usePrecise({ onOpen }: Props) { return useCallback(() => onOpen(), [onOpen]); }
export function useBroad(props: Props) { return useCallback(() => open(props), [props]); }`);
  assert.deepEqual(
    result.diagnostics.filter((item) => item.code === dependenciesRule),
    [],
  );
});

test("CLI package lint inherits rules and scans sources while root commands keep their own scope", async () => {
  const result = await lint(
    `import { useState } from "react";
export function Example({ enabled }: { enabled: boolean }) {
  if (enabled) return useState(0)[0];
  return null;
}`,
    "apps/zcode-cli/packages/example/src/Example.tsx",
    "apps/zcode-cli/packages/example",
  );
  assert.equal(result.code, 1);
  assert.equal(result.diagnostics.find((item) => item.code === hooksRule)?.severity, "error");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  for (const script of ["lint", "lint:fix"]) {
    assert.match(manifest.scripts[script], /oxlint --ignore-pattern apps\/zcode-cli(?: |$)/u);
  }
});

test("adding Hooks checks preserves existing plugins without enabling other React defaults", async () => {
  const result = await lint(`export const values = [...[1, 2]];
export function List({ items }: { items: string[] }) { return items.map(item => <div>{item}</div>); }`);
  assert.ok(result.diagnostics.some((item) => item.code === "unicorn(no-useless-spread)"));
  assert.ok(!result.diagnostics.some((item) => item.code?.includes("jsx-key")));
});
