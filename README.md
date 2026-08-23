# harpyhare

Monorepo (Nx + npm workspaces) holding two applications.

```
apps/
  desktop/    # harpyhare — Tauri 2 app for macOS and Windows (the product). See apps/desktop/README.md
  landing/    # download landing page (Vite + React + Tailwind). See apps/landing/README.md
```

Each app is self-contained (its own `package.json`, tsconfig, eslint, prettier, vite).
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

Pre-commit (husky): `lint-staged` (prettier over staged files) → `nx affected -t typecheck
lint` → `knip`.

## Releasing the app

From `apps/desktop`:

```bash
cd apps/desktop && npm run release -- 0.5.0 --notes "What's new"
```

This builds a signed bundle for the platform it runs on, publishes a GitHub release to
`screenfriskofficial/harpyhare-releases`, bumps the version, commits and tags. The second platform
needs its own run on its own machine — that run adds its artifacts and merges `latest.json`
(details in `apps/desktop/README.md`). The landing page picks the new version up on its own (it
reads the latest release at runtime) and offers the right installer for the visitor's OS.

## CI

`.github/workflows/ci.yml`: frontend linters and tests on ubuntu, the Windows installer build on
windows-latest (it cannot be built on macOS) — that job also checks that the generated
`src/ipc/bindings.ts` matches the committed one.
