import { createRequire, isBuiltin } from "node:module";

const require = createRequire(import.meta.url);
const { extractFile, listPackage } = require("@electron/asar");
const ts = require("typescript");
const packagedRuntimeOutputPattern = /^\/out\/(main|host|scheduler|preload)\/.+\.(?:js|cjs)$/;

function resolveExternalPackageName(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(specifier) ||
    isBuiltin(specifier) ||
    specifier === "electron"
  ) {
    return null;
  }
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}

export function collectPackagedRuntimeImports(appAsarPath) {
  const packageSources = new Map();
  const scannedTargets = new Set();

  for (const rawEntry of listPackage(appAsarPath)) {
    const entry = rawEntry.replaceAll("\\", "/");
    const match = packagedRuntimeOutputPattern.exec(entry);
    if (!match) continue;
    scannedTargets.add(match[1]);

    const contents = extractFile(appAsarPath, rawEntry.slice(1)).toString("utf8");
    const sourceFile = ts.createSourceFile(
      entry,
      contents,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.JS,
    );
    const record = (specifier) => {
      const moduleName = resolveExternalPackageName(specifier);
      if (!moduleName) return;
      const sources = packageSources.get(moduleName) ?? new Set();
      sources.add(entry);
      packageSources.set(moduleName, sources);
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        record(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0]) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            (node.expression.text === "require" || node.expression.text === "__require")))
      ) {
        record(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  const missingTargets = ["main", "host", "scheduler", "preload"].filter(
    (target) => !scannedTargets.has(target),
  );
  if (missingTargets.length > 0) {
    throw new Error(`app.asar 缺少待校验的 Desktop 产物: ${missingTargets.join(", ")}`);
  }
  return packageSources;
}
