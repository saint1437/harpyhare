# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The **harpyhare** monorepo (Nx + npm workspaces, one shared `node_modules`): a desktop app (macOS + Windows) and its landing page.

| Project         | What it is                                                                       | Its own documentation                                 |
| --------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/desktop`  | The product: Tauri 2 + Rust backend + React 19. System audio → STT → Claude reply | **`apps/desktop/CLAUDE.md`** (in depth) + `README.md` |
| `apps/landing`  | Single-page download site (Next.js 16 App Router + React + Tailwind)              | `apps/landing/README.md`                              |

**Working inside `apps/desktop`? Read `apps/desktop/CLAUDE.md`.** That file holds the whole app architecture, the Rust⇄TS contract invariants, the palette rules and dozens of "why this way and not the other". This file covers only the monorepo as a whole.

Nx derives the projects from the npm workspaces and the targets from their `package.json` scripts; there are no `project.json` files and none should be added.

## Commands

```bash
npm install                                       # every workspace at once

npx nx dev landing                                # landing page (Next.js, http://localhost:3000)
cd apps/desktop && npm run tauri dev              # the whole app (Rust + frontend) — the only way to see the UI

npx nx <target> <project>                         # build | lint | typecheck | test for one project
npm run build | lint | typecheck | test           # the same for all of them (nx run-many)
npx nx affected -t lint typecheck --uncommitted   # only the affected projects

npm run knip                                      # dead code and dependencies, workspace-aware (knip.json)
npm run format                                    # prettier across the whole repo
npm run presets:publish                           # config/presets.json → public blob (needs BLOB_READ_WRITE_TOKEN in .env.local)
```

Tests are vitest per project: `cd apps/desktop && npx vitest run src/hooks/useChats.test.ts` (one file), `npx vitest run` (all of them). The Rust tests live separately: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`.

**Pre-commit (husky)** runs three steps: `lint-staged` (prettier over staged files) → `nx affected -t typecheck lint --uncommitted` → `knip`. Which means a commit fails on a dead export too, not only on types.

**CI — `.github/workflows/ci.yml`** (push to main **and to `v*` tags**, PRs, manual dispatch): the ubuntu job runs `nx run-many -t typecheck lint test` + `knip`; the macos-latest job runs `cargo test`, `git diff --exit-code apps/desktop/src/ipc/bindings.ts` and `clippy -D warnings`; the windows-latest job runs `clippy --all-targets -D warnings`; and the NSIS installer (artifact `windows-installer`) is built **only on a `v*` tag and on `workflow_dispatch`**: a job-level `BUILD_INSTALLER` gates both the build step and `upload-artifact`, so ordinary pushes to main and PRs get nothing from Windows but clippy. The reason: the build cost 7m33s out of the job's 13m55s, and clippy already covers compilation on Windows. **The price is accepted knowingly**: a break in bundling specifically (NSIS config, icons, the WebView2 bootstrapper) is now caught on a tag or a manual run, not on a commit. **Only CI checks the Windows half**: the Windows installer cannot be built on macOS. **Tests do not run on the windows runner**: the test binary fails to start (`STATUS_ENTRYPOINT_NOT_FOUND` before the first test) — this looks like the known crate gotcha with `crate-type = ["cdylib", …]`; test compilation there is covered by `clippy --all-targets`, while the run itself and the contract check are the macos job's. `Swatinem/rust-cache` in both jobs **restores everywhere, PRs included, but saves only from main and from tags** (`save-if`): writing the cache took 2m49s on the windows runner against 23s on macOS — packing thousands of small files on NTFS; tags are in that condition on purpose, otherwise the release build (which only ever runs on a tag) would start cold every time. The windows job's first step excludes the workspace, `~/.cargo`, `~/.rustup` and `cargo.exe`/`rustc.exe`/`link.exe` from Defender (`continue-on-error`: if the runner lacks the rights, CI must not fail over it): the very same `clippy --all-targets` took 16s on macOS against 1m13s on Windows, and the difference is antivirus scanning of the small files cargo and npm scatter everywhere. Updater signing in CI turns on only when the `TAURI_SIGNING_PRIVATE_KEY` secret is set.

## What ties the projects together

The apps do not import each other's code — there is no shared package. There are exactly three links, and none of them is obvious from the folder layout:

1. **`config/presets.json` — one file, two consumers.** Rust embeds it (`include_str!` in `remote_presets.rs`, the fallback for when the network is unavailable) and the frontend imports it (`lib/presets.ts`). Changing the format breaks both sides at once; publishing to the blob (`npm run presets:publish`) overrides the embedded copy at runtime.

2. **The release repository `screenfriskofficial/harpyhare-releases`.** `apps/desktop/scripts/release.mjs` publishes the signed bundle and `latest.json` there; the app's updater pulls updates from it, and the landing page asks the GitHub Releases API for the latest version **on the server** (ISR, revalidating every 30 minutes — the version and the links end up in the HTML) and picks the installer for the visitor's OS by the asset name suffix (`apps/landing/src/lib/release.ts`: `.dmg` against `-setup.exe`; the updater's `.nsis.zip`/`.app.tar.gz`/`.sig` and `latest.json` are filtered out). So renaming an asset in the release script breaks both the updater and the site's "Download" button. **The release is two-platform:** the first run creates the release and the tag; the second (same tag) does not bump the version, adds its own assets and merges its platform into the existing `latest.json` (`darwin-aarch64` / `windows-x86_64`). The second run does not have to happen on a Windows machine: `npm run release -- X.Y.Z --windows-setup <path>` adds Windows from a mac, signing the `-setup.exe` from the windows CI job's artifacts with the same key (updater signing is minisign over the file's bytes, so the build host is irrelevant to it). **A platform must never be left out of `latest.json`**: the updater there does not simply "find no updates" — it rejects `check()` with `TargetsNotFound` on every call, regardless of the user's version. The mechanism and the traces of that bug are in `apps/desktop/CLAUDE.md`.

3. **The proxy `screenfriskofficial/itech-relay`** (a Cloudflare Worker, separate repository) — the app's requests go through it in access-code mode. Its invariants are described in `apps/desktop/CLAUDE.md`.

## knip

`knip.json` declares the entry points explicitly, because auto-detection lies here: for desktop they are `src/launcher.tsx` and `src/index.css` (the app's second window and the Tailwind layer), while `src/components/ui/**` (shadcn primitives, some added ahead of need) and `src/ipc/bindings.ts` (generated from Rust) are excluded from the check. When you add a window or a generated artifact, update `knip.json` — otherwise pre-commit will complain about "dead" code that is in fact alive. Landing has no section of its own on purpose: the App Router entry points (`page.tsx`, `layout.tsx`, `sitemap.ts`, `robots.ts`, `manifest.ts`) are found by knip's Next.js plugin.

## Odds and ends

- The root `docs/` is empty; project history lives in `apps/desktop/docs/superpowers/{specs,plans}`.
- The root `dist/` and `src-tauri/` are leftovers from before the split into workspaces: they are in `.gitignore` and take no part in the build. The real Tauri crate is `apps/desktop/src-tauri`.
- `.env` and `.env.local` in the root: the first is the API-key fallback for the app's dev build, the second is the presets publishing token. Both are gitignored.
