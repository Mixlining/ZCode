# Toolchain upgrade: Electron 44 and pnpm 11

## Product rule and ownership

- The repository pins its development Node.js runtime to `24.21.0` and pnpm to the latest available `11.x` patch (`11.27.1`). Root and nested CLI workspace declarations must agree with these pins.
- The Desktop package pins Electron to `44.4.4`; its packaging configuration derives `electronVersion` from that manifest so development, type resolution, and packaging share one runtime owner.
- The root workspace and `apps/zcode-cli` each own a lockfile. The CLI workspace includes its six local dependencies from `../../packages`; regenerate both lockfiles with pnpm 11 after its manifest/configuration migration.
- Each workspace root retains only registry/auth options in its own `.npmrc`; root and CLI registry selection is pinned to official npm so the nested CLI workspace does not fall back to the user registry. Electron and electron-builder platform binaries are separate release artifacts and are downloaded from their official GitHub Releases URLs, not npm registry mirrors. Other remote runtime asset distribution remains outside this toolchain migration.
- pnpm workspace configuration is owned by each `pnpm-workspace.yaml`. `.npmrc` retains only registry/auth configuration. The local machine's globally installed Node.js and pnpm are not part of this change.

## Invariants and migration boundary

- Pin project Node.js in `mise.toml`, `.nvmrc`, and the CLI's `.nvmrc` / `.node-version`; keep the CLI runtime declaration and user-facing version references aligned.
- Pin pnpm in both workspace `packageManager` declarations and `mise.toml`.
- Move `overrides` and `patchedDependencies` out of root `package.json#pnpm` into root `pnpm-workspace.yaml`; move `node-linker=hoisted` out of `.npmrc` into workspace YAML settings for both workspaces.
- Set `minimumReleaseAge: 0` in both project workspace YAML files so fresh releases can install; do not change user-level or machine-wide pnpm configuration.
- Keep GitHub Actions on the same Node and pnpm pins by loading `mise.toml`; cache the root pnpm store from `pnpm-lock.yaml` and Electron binaries from the Desktop manifest. The Windows packaging workflow downloads Electron and electron-builder binaries directly from their official GitHub Releases base URLs.
- Keep the third-party notice generator aligned with the new workspace-owned `patchedDependencies` declaration.
- Preserve existing root workspace package lists, architecture filters, build approvals, React overrides, patch files, and registry selection. The CLI workspace must also include its referenced local provider, shared, model-option-map, CUA, and formal-proof packages.
- Refresh Node runtime license metadata for the project-pinned Node `24.21.0` and keep generated third-party notices/inventory consistent with the lockfile and installed production graph.
- Refresh dependency license inventory alongside the Electron change; when an upstream package ships only a license identifier, preserve that evidence and record the missing complete license text instead of inventing an upstream notice.
- Do not run global tool upgrades or `mise install`; the migration updates project declarations and project lockfiles only.

## Compatibility boundary

- Electron 44 no longer exposes its clipboard module in renderer processes. Existing renderer clipboard actions must stay on the browser `navigator.clipboard` API; do not add renderer access to Electron clipboard.
- Electron 44 requires macOS 13 or later and publishes only x64/arm64 builds. Keep the repository's existing x64/arm64 platform scope and update any explicit macOS 12 compatibility claim if one exists.
- Electron 44.4.4's release notes include fixes only; no additional app behavior is requested by this version bump.

## Acceptance scenarios

1. A developer entering the repository can select Node `24.21.0` and pnpm `11.27.1` from project pins without changing machine-wide installations.
2. A root workspace install resolves Electron `44.4.4`, and the packaging configuration names that same version.
3. An install in `apps/zcode-cli` resolves every declared local workspace dependency and uses pnpm `11.27.1`, Node `24.21.0`, and its refreshed lockfile.
4. Existing overrides, patches, architecture selection, build approvals, and official npm registry remain effective after moving pnpm settings in both workspace roots.
5. Static validation reports no new type, lint, formatting, or architecture errors. Application launches, package builds, unit tests, and E2E tests are outside this migration's validation boundary.
6. The generated third-party inventory includes the new Electron dependency graph and explicitly records any upstream license material that is incomplete.
7. Both project workspaces resolve without a release-age cutoff while the machine-wide pnpm release-age setting remains unchanged.
8. GitHub Actions selects Node and pnpm from the repository pins, restores caches keyed by the changed root lockfile/Desktop Electron manifest, and uses official npm for packages plus the official GitHub Releases for Electron packaging binaries.
