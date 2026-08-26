# harpyhare

Monorepo (Nx + npm workspaces): two applications and the packages they share.

```
apps/
  desktop/            # harpyhare — Tauri 2 app for macOS and Windows (the product). See apps/desktop/README.md
  landing/            # download landing page (Next.js 16 App Router + React 19 + Tailwind v4). See apps/landing/README.md
packages/
  tsconfig/           # @harpyhare/tsconfig — base / react / next / node compiler presets
  eslint-config/      # @harpyhare/eslint-config — the strict type-aware core + the React and Next blocks
  prettier-config/    # @harpyhare/prettier-config — one formatting decision, bare and Tailwind-aware
  platform/           # @harpyhare/platform — the two supported platforms and what they require
  release-contract/   # @harpyhare/release-contract — how a release asset is named (JSON + a JS reader)
  checks/             # @harpyhare/checks — the palette checks both apps run (token resolution, WCAG AA)
```

Each app owns its bundler (Vite for the desktop app, Next.js for the landing page) and its own
structure; everything both of them agreed on — compiler flags, lint rules, formatting, the
platform list, the release naming scheme, the palette checks — lives in `packages/` and is
imported, not copied. The code packages ship source with no build step of their own, which is
why the landing lists the two that reach the browser in `transpilePackages`; `@harpyhare/checks`
is loaded only by `node scripts/check-*.mjs` and stays out of it.
Nx derives the projects from the npm workspaces and the targets from their `package.json`
scripts — there are no `project.json` files.

## Getting started

```bash
npm install                       # install every workspace (one shared node_modules)

# the app (Rust + frontend, hot reload)
cd apps/desktop && npm run tauri dev

# the landing page
npx nx dev landing                # or: cd apps/landing && npm run dev
```

## Orchestration (from the repo root)

```bash
npx nx build desktop              # nx <target> <project>: build | lint | typecheck | test
npx nx run-many -t build          # for every project
npx nx run-many -t lint typecheck test
npx nx affected -t lint typecheck --uncommitted   # only the projects that changed

npm run knip                      # dead code/dependencies (workspace-aware, see knip.json)
npm run format                    # prettier across the whole repo
```

Pre-commit (husky): `lint-staged` (prettier over staged files) → `nx affected -t typecheck lint
--uncommitted` → `knip`.

## Releasing the app

From `apps/desktop`:

```bash
cd apps/desktop && npm run release -- 0.5.0 --notes "What's new"
```

This builds a signed bundle for the platform it runs on, creates the GitHub release in
`screenfriskofficial/harpyhare-releases` **as a draft**, bumps the version, commits and tags. The
second platform needs its own run — that run adds its artifacts, merges `latest.json` and only
then takes the release out of draft, because a `latest.json` with one platform does not degrade
the updater, it kills it (`TargetsNotFound` on every `check()`). If the build fails midway the
script rolls the four version files back, so the same command can simply be run again.

The whole two-platform flow also exists as CI: pushing a `v*` tag runs
`.github/workflows/release.yml`, which builds and signs both platforms in a matrix and publishes
once, from one job. That path cannot produce a half-finished release at all.

The landing page picks the new version up on its own (it reads the latest release at runtime) and
offers the right installer for the visitor's OS.

## CI

- **`ci.yml`** — ubuntu (typecheck, lint, test, **build**, knip, gitleaks), macOS (`cargo test`,
  the generated `src/ipc/bindings.ts` contract, clippy in two profiles), Windows (clippy; the
  NSIS installer only on a tag or a manual run). Pull requests run `nx affected`, everything else
  runs `nx run-many`. See `CLAUDE.md` for why each job is shaped the way it is.
- **`macos-bundle.yml`** — nightly and on demand: `tauri build` on `macos-14` without updater
  artifacts, so a break in bundling surfaces before a release rather than during one.
- **`release.yml`** — on a `v*` tag: both platforms built and signed in a matrix, `latest.json`
  merged from the two, one release published.
- **`windows-debug.yml`** — a debug NSIS installer on demand.

Dependencies are kept current by `.github/dependabot.yml` (npm, cargo, github-actions — weekly,
grouped). Node is pinned by `.nvmrc` and read from there by every workflow.
