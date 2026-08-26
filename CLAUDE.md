# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The **harpyhare** monorepo (Nx + npm workspaces, one shared `node_modules`): a desktop app (macOS + Windows) and its landing page.

| Project                        | What it is                                                                       | Its own documentation                                 |
| ------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/desktop`                 | The product: Tauri 2 + Rust backend + React 19. System audio → STT → Claude reply | **`apps/desktop/CLAUDE.md`** (in depth) + `README.md` |
| `apps/landing`                 | Single-page download site (Next.js 16 App Router + React 19 + Tailwind v4)        | `apps/landing/README.md`                              |
| `packages/tsconfig`            | `base` / `react` / `next` / `node` compiler presets                              | the comments inside `base.json`                        |
| `packages/eslint-config`       | the strict type-aware core, the React and Next blocks, the shared exemptions      | the comments inside `base.js`                          |
| `packages/prettier-config`     | one formatting decision, bare and Tailwind-aware                                  | the comments inside `index.js`                         |
| `packages/platform`            | `PLATFORMS` / `detectPlatform` / the supported OS versions                       | the comments inside `src/index.ts`                     |
| `packages/release-contract`    | how a release asset is named — JSON manifest + a JS reader                       | the comments inside `contract.js`                      |
| `packages/checks`              | the two palette checks — token resolution and WCAG AA — with the palette as an argument | the comments inside `tokens.js` and `contrast.js` |
| `packages/tokens`              | the HUD palette itself — one stylesheet the desktop imports and the landing generates from | the header of `hud.css`, then `hud.js` |

**Working inside `apps/desktop`? Read `apps/desktop/CLAUDE.md`.** That file holds the whole app architecture, the Rust⇄TS contract invariants, the palette rules and dozens of "why this way and not the other". This file covers only the monorepo as a whole.

`workspaces` is `["apps/*", "packages/*"]`. Nx derives the projects from the npm workspaces and the targets from their `package.json` scripts; there are no `project.json` files and none should be added — which also means **a new folder under `packages/` becomes an Nx project the moment it has a `package.json`**, and every script it declares becomes a target `nx run-many` will run.

**The `packages/*` split into config packages and code packages is not cosmetic.** `tsconfig`/`eslint-config`/`prettier-config` are pure configuration, consumed through `extends`/imports and shipped as-is. `platform`/`release-contract`/`checks` are code: they ship **TypeScript (or plain JS + a `.d.ts`) source with no build step of their own**. `platform` and `release-contract` reach the browser, which is why the landing's `next.config.ts` lists them in `transpilePackages` — Vite compiles a linked workspace package like ordinary source, Next does not unless told. **`checks` deliberately does not**: nothing in `src/` imports it, only `node scripts/check-*.mjs` does, so it never enters a bundle and adding it to `transpilePackages` would only claim otherwise. That also decides its language — plain JS with a `.d.ts` beside it, the same reason `release-contract` is plain JS: `node scripts/check-tokens.mjs` cannot load a `.ts` entry. A package that grew a build step would need a `build` target, an output path in `nx.json` and a `dependsOn`; none of that exists today and adding a build step is the expensive way to solve a problem source-only packages do not have. **`tokens` is the third kind: it ships a stylesheet.** Vite resolves `@import "@harpyhare/tokens/hud.css"` out of a linked workspace like any other module, so the desktop needs nothing declared; Next never sees the file at all, because the landing reads the package in a build-time script and generates CSS text instead of importing it — which is also why it is not in `transpilePackages`.

## Commands

```bash
npm install                                       # every workspace at once (stop `nx dev landing` first — see below)

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

**CI — `.github/workflows/ci.yml`** (push to main **and to `v*` tags**, PRs, manual dispatch): the ubuntu job runs `typecheck lint test build` + `knip` + gitleaks; the macos-latest job runs `cargo test`, `git diff --exit-code apps/desktop/src/ipc/bindings.ts` and `clippy -D warnings` in two profiles; the windows-latest job runs `clippy --all-targets -D warnings`; and the NSIS installer (artifact `windows-installer`) is built **only on a `v*` tag and on `workflow_dispatch`**: a job-level `BUILD_INSTALLER` gates both the build step and `upload-artifact`, so ordinary pushes to main and PRs get nothing from Windows but clippy. The reason: the build cost 7m33s out of the job's 13m55s, and clippy already covers compilation on Windows. **The price is accepted knowingly**: a break in bundling specifically (NSIS config, icons, the WebView2 bootstrapper) is now caught on a tag or a manual run, not on a commit — and on macOS, by the nightly `macos-bundle.yml` below. **Only CI checks the Windows half**: the Windows installer cannot be built on macOS. **Tests do not run on the windows runner**: the test binary fails to start (`STATUS_ENTRYPOINT_NOT_FOUND` before the first test) — this looks like the known crate gotcha with `crate-type = ["cdylib", …]`; test compilation there is covered by `clippy --all-targets`, while the run itself and the contract check are the macos job's. `Swatinem/rust-cache` in both jobs **restores everywhere, PRs included, but saves only from main and from tags** (`save-if`): writing the cache took 2m49s on the windows runner against 23s on macOS — packing thousands of small files on NTFS; tags are in that condition on purpose, otherwise the release build (which only ever runs on a tag) would start cold every time. The windows job's first step excludes the workspace, `~/.cargo`, `~/.rustup` and `cargo.exe`/`rustc.exe`/`link.exe` from Defender (`continue-on-error`: if the runner lacks the rights, CI must not fail over it): the very same `clippy --all-targets` took 16s on macOS against 1m13s on Windows, and the difference is antivirus scanning of the small files cargo and npm scatter everywhere. Updater signing in CI turns on only when the `TAURI_SIGNING_PRIVATE_KEY` secret is set.

**`nx build` is part of the ubuntu job**, and it is not redundant with `typecheck`: `tsc --noEmit` does not see a Server/Client Component boundary violation in Next, and `tsc -b` failures in the desktop's project references only surface through the build. **Pull requests run `nx affected`** (base and head from `nrwl/nx-set-shas`), while pushes to main, `v*` tags and manual runs always run `nx run-many` over everything — a tag must never publish something that was skipped because a diff looked small. The Nx cache (`.nx/cache`) follows the same rule as rust-cache: **restored on every run, written only from main and from tags**, so pull requests cannot evict each other from the repository's cache budget. **Nx Cloud is deliberately not connected** (`nxCloudId` is absent).

**gitleaks** runs in the ubuntu job. There are two secrets sitting in the working copy right next to this repository — `harpyhare/.env` (a 21st.dev key) and `itech-relay/.admin-token`. Both are gitignored, which protects nothing against the commit that adds them anyway. The action is free for repositories on a personal account; an organisation account would need a `GITLEAKS_LICENSE` secret.

**Node is pinned by `.nvmrc`** (22) and read from it via `node-version-file:` — the version used to be typed into three separate workflows. `engines.node` in the root `package.json` states the same floor. **`rust-toolchain.toml` is not read by `dtolnay/rust-toolchain`** despite what its name suggests, so every Rust job resolves the channel in a small step first: if `rust-toolchain.toml` appears (in the root or in `apps/desktop/src-tauri`) its `channel` is used, otherwise `stable`.

**`.github/workflows/macos-bundle.yml`** — `tauri build` on `macos-14` without updater artifacts, on a nightly `schedule` and on `workflow_dispatch`. Bundling on macOS breaks independently of compilation (DMG config, icons, entitlements, `Info.plist`) and `cargo test`/clippy see none of it; the DMG break in `eb9dbbd` was found by hand. It is deliberately **not** on every PR: by the measurements above the build is the expensive half of the job.

**`.github/workflows/release.yml`** — on a `v*` tag (or dispatch with a tag): a matrix of `macos-14` + `windows-latest` builds and signs both bundles, and a final job merges the two signatures into one `latest.json` and publishes a single release. This is what makes an incomplete release structurally impossible, and it takes the signing key off one person's mac. It needs `RELEASES_REPO_TOKEN` — a token with write access to the **separate** `harpyhare-releases` repository, which the built-in `GITHUB_TOKEN` does not have.

**`.github/dependabot.yml`** — npm (root; workspaces are followed from there), cargo (`apps/desktop/src-tauri`) and github-actions, weekly and grouped, so a routine update is one PR rather than thirty.

**Never run `npm install` while `nx dev landing` is up.** Turbopack keeps a
persistent cache of resolved paths under `apps/landing/.next`; swapping
`node_modules` underneath it makes `get_next_server_import_map` fail with
`Next.js package not found`, the client bundle stops building, and the browser
reloads in a loop while the server keeps answering 200. The cache survives a
restart of the dev server, so the symptom outlives the cause — the fix is
`rm -rf apps/landing/.next`. Adding a workspace package makes `npm install`
routine, which is what makes this worth writing down.

## What ties the projects together

The apps still do not import each other's code — they import a **shared layer under `packages/`**, which is the only legal way for a fact to live in both. Five links matter, and the first four are not obvious from the folder layout:

0. **`packages/*` — the shared layer itself.** Both apps depend on `@harpyhare/tsconfig`, `@harpyhare/eslint-config` and `@harpyhare/prettier-config` (configuration), on `@harpyhare/platform` (the two supported platforms, `detectPlatform`, the minimum OS versions) and on `@harpyhare/release-contract` (how a release asset is named); both also depend on `@harpyhare/checks` (the palette checks) and on `@harpyhare/tokens` (the palette itself). Two consequences to keep in mind: **`nx.json`'s `build`/`lint`/`typecheck`/`test` inputs include `^production`**, so editing a package invalidates the cache of every app that depends on it (verified by hand three times: touching `packages/platform/src/index.ts` makes `nx run desktop:typecheck` re-run instead of replaying the cache; touching `packages/checks/tokens.js` does the same to `nx build landing` and `nx test landing`; and a **comment-only** edit to `packages/tokens/hud.css` re-runs both `nx build landing` and `nx test landing`, which replay from cache on an untouched second run) — drop that and Nx will happily replay a green typecheck against a package that has changed underneath it. And **check `npm run knip` after adding a workspace**: a package whose entry points knip can read off its `exports` field needs no section (`platform`, `release-contract` and `checks` need none — verified by planting a dead file in `packages/checks` and watching knip report it), but forgetting one where it IS needed does not produce a warning, it fails `npm run knip` — the last step of the pre-commit hook, so it fails for everyone.

1. **`config/presets.json` — one file, two consumers.** Rust embeds it (`include_str!` in `remote_presets.rs`, the fallback for when the network is unavailable) and the frontend imports it (`lib/presets.ts`, by a relative path reaching outside the project). Changing the format breaks both sides at once; publishing to the blob (`npm run presets:publish`) overrides the embedded copy at runtime. **The file belongs to no project, so Nx has to be told about it twice**: it is listed in `sharedGlobals` (otherwise editing presets does not invalidate the desktop's `build`/`test`/`typecheck` cache, and `nx build desktop` happily returns a bundle carrying the old presets), and in `implicitDependencies` (otherwise `nx affected` returns an empty list for it, and the pre-commit hook — which is `nx affected --uncommitted` — runs *nothing* on a commit that touches only presets). The same reasoning put `prettier.config.js`, `knip.json` and `.nvmrc` into `sharedGlobals`.

2. **The release repository `screenfriskofficial/harpyhare-releases`.** `apps/desktop/scripts/release.mjs` publishes the signed bundle and `latest.json` there; the app's updater pulls updates from it, and the landing page asks the GitHub Releases API for the latest version **on the server** (ISR, revalidating every 30 minutes — the version and the links end up in the HTML) and picks the installer for the visitor's OS by the asset name suffix. **The naming scheme itself now lives in one place, `packages/release-contract/release-assets.json`**, because Rust cannot import a TypeScript package: the JSON is the source of truth (the same trick `config/presets.json` uses — a JSON import on the JS side, `include_str!` on the Rust side), `contract.js` beside it is the JS reader that both `release.mjs` (which builds the names) and `apps/landing/src/lib/release.ts` (which matches them) go through, and `apps/desktop/src-tauri/src/update.rs` embeds the manifest under `#[cfg(test)]` so `cargo test` checks the updater endpoint in `tauri.conf.json` against it. `.github/workflows/release.yml` is the fourth consumer and **now reads the manifest at runtime like the other three**: a step in each job runs `node packages/release-contract/scripts/release-names.mjs --version X.Y.Z [--target darwin-aarch64]`, which prints `KEY=value` lines straight into `$GITHUB_ENV` — the asset names, the releases repository, the manifest name, the signature suffix and the list of required updater targets. It is called **by path, not as `@harpyhare/release-contract`**, because the `publish` job never runs `npm ci` and has no `node_modules`. What is left in shell on the left-hand side of `cp` is tauri's own bundle naming (`bundle/dmg/…`, `bundle/nsis/…`, `aarch64` vs `x64`), which belongs to `tauri.conf.json` rather than to the release contract. `packages/release-contract/workflow.test.ts` changed role with it: it no longer compares literals (there are none left) but asserts that the reading step is present in both jobs, that no asset name, slug or repository has crept back into the YAML, that the build matrix is exactly `REQUIRED_UPDATER_TARGETS`, that every `$SHELL_VARIABLE` the workflow reads is set by somebody, and that the helper prints byte-for-byte what `release.mjs` builds. Before the split the scheme lived in four places and renaming an asset broke the updater and the site's "Download" button silently; the audit also found the landing filtering a `.nsis.zip` this pipeline has never produced and offering `.msi`/`.exe` installers that do not exist — **on Windows the updater artifact IS the installer, the `-setup.exe` itself**, and the filter list is now derived from that fact rather than typed out. **The release is two-platform:** the first run creates the release and the tag; the second (same tag) does not bump the version, adds its own assets and merges its platform into the existing `latest.json` (`darwin-aarch64` / `windows-x86_64`). The second run does not have to happen on a Windows machine: `npm run release -- X.Y.Z --windows-setup <path>` adds Windows from a mac, signing the `-setup.exe` from the windows CI job's artifacts with the same key (updater signing is minisign over the file's bytes, so the build host is irrelevant to it). **A platform must never be left out of `latest.json`**: the updater there does not simply "find no updates" — it rejects `check()` with `TargetsNotFound` on every call, regardless of the user's version. The mechanism and the traces of that bug are in `apps/desktop/CLAUDE.md`. **That is why the release is created as a draft** (`gh release create --draft`) and is taken out of draft only once the manifest actually holds both platforms: the updater's endpoint is `releases/latest/download/latest.json`, and a draft is not part of `releases/latest`, so during the window between the two runs users keep seeing the previous complete release instead of a broken one. The script also **rolls back** `package.json`, `Cargo.toml`, `tauri.conf.json` and `package-lock.json` if anything fails after the version bump — otherwise a failed `tauri build` left the tree dirty and the retry died twice over, first on "the tree is not clean" and then on `assertReadyToCreate`, because `current` had already become `version`. `.github/workflows/release.yml` sidesteps the two-run dance entirely by building both platforms in one workflow.

3. **The proxy `screenfriskofficial/itech-relay`** (a Cloudflare Worker, separate repository) — the app's requests go through it in access-code mode. Its invariants are described in `apps/desktop/CLAUDE.md`.

## knip

**A workspace needs a section as soon as knip cannot find its entry points on its own.** `packages/eslint-config` and `packages/prettier-config` carry an `ignoreDependencies` each — `eslint-import-resolver-typescript` and `prettier-plugin-tailwindcss` are named as strings inside a config (`settings["import-x/resolver"]`, `plugins: [...]`) rather than imported, and knip's ESLint/Prettier plugins only recognise those strings in a file they know to be a config for THAT tool, which `base.js`/`tailwind.js` are not. `packages/platform`, `packages/release-contract`, `packages/checks` and `packages/tokens` need nothing extra: knip reads their entry points from the `exports` field, and the exports of an entry file are public API it does not call dead. That is a measurement, not an assumption — dropping an unreferenced `orphan.js` into `packages/checks`, and again into `packages/tokens`, makes knip report it, so the workspace really is being analysed. `tokens` also exports `./hud.css`, and knip does not call it dead: it follows the `@import` out of `apps/desktop/src/index.css`, which `knip.json` names as a desktop entry point. Forgetting a section where one IS needed does not produce a warning, it fails `npm run knip` — and that is the last step of the pre-commit hook, so it fails for everyone.

`knip.json` declares the entry points explicitly, because auto-detection lies here: for desktop they are `src/launcher.tsx` and `src/index.css` (the app's second window and the Tailwind layer), while `src/components/ui/**` (shadcn primitives, some added ahead of need) and `src/ipc/bindings.ts` (generated from Rust) are excluded from the check. When you add a window or a generated artifact, update `knip.json` — otherwise pre-commit will complain about "dead" code that is in fact alive. Landing **does** have a section of its own: it used to rely on knip's Next.js plugin finding the App Router entry points by heuristic, which meant the result depended on the plugin rather than on anything written down. The entries are now spelled out (`page`/`layout`/`error`/`not-found` under `src/app/**`, plus `sitemap.ts`, `robots.ts`, `manifest.ts`, `globals.css` and `scripts/*.mjs`). `targetDefaults.knip` was removed from `nx.json`: knip is workspace-wide by design — one config at the root analysing every workspace in one pass — so there is no per-project `knip` script for `nx run-many` to find, and the target default was dead configuration.

## The palette IS shared, and `packages/tokens` is where it lives

`packages/tokens/hud.css` is the palette. **The desktop imports it**
(`@import "@harpyhare/tokens/hud.css"` at the top of `apps/desktop/src/index.css`) and paints with
its text directly; **the landing generates its `--app-*` replica out of it**
(`node apps/landing/scripts/sync-app-tokens.mjs`, which rewrites three marked regions of
`globals.css`). No value is written twice by hand anywhere.

It used to be two palettes, and this section used to be a table of how far they had drifted.
What the merge actually cost — because it is the honest measure of what a "shared token layer"
means when it is put off:

| what | desktop (dark) | landing `--app-*`, before |
| --- | --- | --- |
| window ground | `--base: oklch(0.235 0.005 40)` | `oklch(0.28 0.004 285)` |
| card | `--surface: oklch(0.285 0.006 40)` | `oklch(0.32 0.003 285)` |
| accent | `--accent: oklch(0.55 0.16 20)` | `oklch(0.45 0.16 18)` |
| muted text | `--fg-muted: oklch(0.79 0.008 40)` | `oklch(0.72 0.006 285)` |
| hairline | `--line: oklch(0.315 0.006 40)`, opaque | `oklch(1 0 0 / 12%)`, alpha |
| "recording" | `--listening: oklch(0.775 0.11 200)`, cyan | `oklch(0.62 0.2 18)`, red |
| body / title | 13px / 16px | 12.5px / 15px |

Three different kinds of divergence, and only the first is a refactor: a **hue family** (warm 40
against neutral-blue 285), a **surface technique** (opaque lightness steps against
`oklch(1 0 0 / n%)` alpha — the desktop's rule, because the HUD window is translucent over
arbitrary foreign content and an alpha step would change lightness with whatever is behind it),
and a **meaning** (`--listening` is cyan on purpose so that "audio is being captured right now"
cannot read as "something is wrong"; the page advertised recording in the app's danger colour).
The desktop won all three, which is why merging them repainted the landing's demo — see the
visible-change list in `apps/landing/README.md`.

**Why the CSS is the source and not a JSON that compiles to it.** The desktop has to paint with
this file, so anything else would make what ships a build artefact. The consumers that are not a
browser read it back with `hudBlock`/`hudScope` (`packages/tokens/hud.js`), which is also what
lets `HUD_SCOPES` — the list of scopes a browser can actually be in — sit next to the stylesheet
instead of inside a check script.

**Why the landing generates instead of importing the same file.** Two structural reasons, both in
the header of `sync-app-tokens.mjs`. The page already owns `--fg`, `--surface`, `--border` and
`--primary` for its poster palette, so the replica needs a prefix; and `checkContrast` resolves a
scope by merging selector blocks out of ONE stylesheet, so a `:root` split across two files would
leave the demo scopes measuring nothing while still reporting green. `npm test` on the landing runs
`sync-app-tokens.mjs --check` **first**, so a stale replica fails the build instead of shipping.

**What is shared, precisely:** the colour layer and the five-step type scale — light `:root`, both
dark arms, both `body.launcher` blocks. **What each side still owns:**

- the desktop: `--radius`, `--window-radius`, `--app-opacity`, the motion tokens, the whole
  `@theme inline` naming (`--color-*`, `--text-*`, `--shadow-*`), and everything below it in
  `index.css` — the prose, the syntax highlighting, the orb, the keyframes;
- the landing: its poster palette (`--bg*`, `--ink`, `--primary`, the hard shadows), the `--app-*`
  prefix and the Tailwind names it maps to, and `[data-app-theme="black"]` — a landing-only depth
  the app has no equivalent of, derived by dropping 0.06 of OKLCH lightness off the surface steps
  and touching nothing else, so hue, chroma, text and marks stay the app's.

**The replica is dark-only and the package allows that** rather than forcing a theme: the landing
asks for the `dark · HUD` and `dark · launcher` scopes and never looks at light.

### The `@media (prefers-color-scheme: dark)` blind spot, closed

The dark theme is stated **twice** in `hud.css` — once under the media query, once under
`[data-theme="dark"]` — and until this pass nothing measured the first one. The desktop's contrast
check read `:root`, `[data-theme="dark"]` and the two launcher blocks; the media arm, which is what
a dark-OS user on the default "system" setting actually sees, was unmeasured text.

**Fixed by measuring it, not by removing the copy**, and the choice is not a preference:

- `HUD_SCOPES` now has **six** entries — the two OS-triggered arms are scopes of their own, so
  every value in them is held to AA and to the sRGB gamut (`348 → 522` checks);
- `packages/tokens/hud.test.ts` asserts the two arms are declaration-for-declaration identical,
  and that no block declares a token twice — which the old media block did (`--on-scrim`, twice,
  harmlessly, and nothing said so).

Both halves are needed: two identical arms can be identically wrong, and two legal arms can differ.
The mutation that proves it: move `--fg-muted` from `0.79` to `0.8` **in the media arm only** and
the contrast check stays green (the value is legal) while the equality test goes red.

**Removing the second arm instead is not available.** The page has three states — explicit `dark`,
explicit `light`, and no attribute at all, because `applyTheme` deliberately does not resolve
`system` in JS (`lib/window-controls.ts`: resolving it would freeze the choice at load and stop
following a mid-session OS switch). CSS cannot OR a media query with a selector, so one of the two
themes needs two arms whichever way round you write it. `light-dark()` would collapse them into one
declaration, but it raises the WKWebView floor and `checkContrast` reads `--name: oklch(…)`
literals — it would turn the whole palette invisible to the check, which is a worse trade than a
copy that is asserted equal.

### `--accent-mark`, and its arrival on the landing

`--accent` is a FILL: no oxblood lightness satisfies both "3:1 against the card" and "carries its
own label at 4.5:1", because the two pull luminance apart. That is why the desktop has
`--accent-mark` beside it, held to 3:1 on all four surfaces, for every small graphical mark.

The landing's replica had no such token, and `apps/landing/scripts/check-contrast.mjs` used to
argue that as an unavoidable shortfall. It was not: the demo painted its status dots, caret,
equaliser bars and toggle with `bg-app-primary` at **1.56–2.48:1**, colour as the only carrier of
meaning. The replica now has `--app-primary-mark` (from the app's `--accent-mark`), every mark
moved to it, and the pairs are in the check. `--app-primary` stays under a label — the buttons,
the selected preset chip. One more pair came with the palette: the app's dark `--danger` is a
LIGHT red carrying dark type (`--danger-on`), so the demo's stop button needed
`--app-destructive-fg`; light type on it sat at 2:1.

### What IS shared besides: the checks (`@harpyhare/checks`)

The two `check-tokens.mjs` scripts were near-duplicates and said so in their own headers; the
mechanic lives in `packages/checks` (`checkTokens`, `checkContrast`, `report`) and each app passes
in its own stylesheet, its own scopes and its own requirements. **The package must never learn a
palette** — that is why `@harpyhare/tokens` is a separate workspace and not a folder inside it:
one holds the values, the other holds the mechanism, and neither imports the other. Two things came
out of that merge and are still worth knowing:

- `checkContrast` **composites alpha** before taking the ratio. The desktop's original skipped any
  token that was not opaque; the landing's real text tokens (`--fg-muted` at 78%, `--fg-subtle` at
  60%) and its hairlines are alpha over the ground, so on that palette the opaque-only version
  would have measured almost nothing.
- A pair naming a token the scope does not declare is a **failure**, not a silent skip. The
  original `if (!t[fg]) return` meant a renamed token quietly stopped being measured.

The seam that moving the palette out of `index.css` opened is closed in the same script: the
contrast check reads the package, so a colour re-declared in `index.css` would win in the browser
(it is imported first) and be invisible to every assertion — `check-contrast.mjs` therefore also
asserts that `index.css` declares no `--token: oklch(…)` of its own. That is the `✔ ownership:`
line in its output.

**Next step, still not taken: `@harpyhare/ui`.** The order that works is tokens first and
primitives second, and the first half is now done — but the HUD and the poster-styled landing
remain two visual systems, and only the demo primitives
(`apps/landing/src/components/app-demo/*`) are genuinely shared shapes.

## Odds and ends

- The root `docs/` holds the redesign pass: `docs/redesign/` — four numbered documents, six
  analyses under `analysis/`, and `candidate.mjs`/`palette.mjs` (twelve tracked files). The
  project's own history lives in `apps/desktop/docs/superpowers/{specs,plans}`.
- There is no root `dist/` or `src-tauri/` any more — the leftovers from before the split into workspaces are gone. The only Tauri crate is `apps/desktop/src-tauri`.
- `CHANGELOG.md` in the root, Keep a Changelog format, covering `v0.1.1`…`v0.12.0` plus an `Unreleased` section. `.github/workflows/release.yml` reads the section matching the tag and uses it as the release notes, so a version's entry is written before the tag is pushed, not after.
- `.env` and `.env.local` in the root: the first is the API-key fallback for the app's dev build, the second is the presets publishing token. Both are gitignored.
