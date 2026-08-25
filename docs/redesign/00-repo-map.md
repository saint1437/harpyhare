# 00 — Repo map (Phase 0 briefing)

Factual orientation for the launcher + palette redesign. Every subagent working on this task starts
from this file. All paths are relative to the **git repository root** `harpyhare/` unless noted.

---

## 1. Physical layout

`/Users/mark/Pets/harpyhare-interview-app/` is **not a project** — it is a folder holding three
independent git repos side by side (no root `package.json`, root is not under version control):

| Directory      | What it is                                                        | In scope?               |
| -------------- | ----------------------------------------------------------------- | ----------------------- |
| `harpyhare/`   | **The repo we work in.** Nx + npm workspaces monorepo.             | yes (desktop app only)  |
| `itech-relay/` | Cloudflare Worker proxying Anthropic + Groq for access-code mode.  | **no** — separate repo  |
| `resumes/`     | Content repo (resume authoring). Unrelated.                        | **no** — separate repo  |

Inside `harpyhare/`:

```
harpyhare/                       ← git root (branch at start: feat/auto-mode)
├── package.json                 npm workspaces: ["apps/*"], private, type: module
├── nx.json                      Nx 23; targets derived from workspace package.json scripts
│                                (no project.json files exist and none should be added)
├── knip.json                    dead-code config; declares desktop entry points explicitly
├── prettier.config.js           printWidth 100, doubleQuote, semi, trailingComma all
├── .lintstagedrc.json           prettier over staged {ts,tsx,js,mjs,jsx,json,css}
├── vercel.json                  landing deploy: buildCommand `npx nx build landing`
├── config/presets.json          ONE file, TWO consumers (Rust include_str! + frontend import)
├── scripts/publish-presets.mjs  presets → Vercel blob
├── .github/workflows/ci.yml     ubuntu: nx run-many -t typecheck lint test + knip
│                                macos: cargo test + `git diff --exit-code src/ipc/bindings.ts` + clippy
│                                windows: clippy --all-targets; NSIS installer only on v* tag / dispatch
├── .husky/                      pre-commit: lint-staged → nx affected -t typecheck lint → knip
├── apps/desktop/                ★ THE TARGET OF THIS WORK
└── apps/landing/                ✖ EXCLUSION LIST — read-only, must not change
```

There is **no shared package**. `apps/desktop` and `apps/landing` do not import each other's code.
The only file with two consumers is `config/presets.json`, and it is data (prompt presets), not UI.
**Therefore: no shared-package risk for this redesign.** Nothing we touch in `apps/desktop` can
reach the landing.

### Exclusion list (never edit)

```
apps/landing/**                  ← the whole landing app (Next.js 16 App Router + Tailwind 4)
  apps/landing/src/app/globals.css      its own theme; NOT shared with desktop
  apps/landing/src/components/app-demo/ a hand-built mock of the desktop UI for the marketing page
config/presets.json              ← data shared with Rust; out of scope for a UI redesign
itech-relay/**                   ← different repo
resumes/**                       ← different repo
```

Note `apps/landing/src/components/app-demo/*` visually imitates the current desktop UI (HudWindow,
LauncherWindow, SettingsScreen…). It is a **static copy**, not a live import — it will drift after
this redesign. That drift is expected and out of scope; flag it as a follow-up, do not fix it.

---

## 2. The desktop app — what it is

**harpyhare** (`apps/desktop`) — a Tauri 2 desktop assistant for **macOS 14.2+ and Windows 10
version 2004+**.

- Product name in the bundle is deliberately **"Audio System"** (`tauri.conf.json` → `productName`,
  `mainBinaryName`, identifier `com.audioservice.helper`). The process disguises itself; the
  `harpyhare` brand lives in the UI only (`src/lib/brand.ts` → `BRAND_NAME = "harpyhare.ai"`).
- Core loop: hold a push-to-talk key → capture **system audio** (the other party in a call/video) →
  transcribe via **Groq Whisper** (`whisper-large-v3-turbo`) → the text lands in an input field
  (screenshots can be pasted in) → stream an answer from the **Anthropic API**.
- Version at the time of writing: `0.12.0` (`apps/desktop/package.json` + `tauri.conf.json`).

### What "listening" actually includes (determined from the code, not assumed)

Three distinct capture surfaces, three distinct OS permissions:

| Source            | When it runs                                                                                                                        | Permission (macOS)                              | Permission (Windows)                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| **System audio**  | (a) push-to-talk hold; (b) a continuous **background ring buffer** of the last N seconds, on by default, RAM-only, never on disk      | Audio capture (Core Audio tap) — `NSAudioCaptureUsageDescription` | none — WASAPI loopback needs no consent |
| **Microphone**    | **only** while auto mode is active (it labels "me" vs "the interviewer")                                                              | Microphone — `NSMicrophoneUsageDescription`     | Microphone privacy pane                 |
| **Screen**        | **only** on an explicit region-screenshot hotkey; nothing continuous                                                                  | Screen Recording (`CGPreflightScreenCaptureAccess`) | none                                |

There is **no continuous screen capture and no activity/keystroke monitoring**. The only always-on
capture is the system-audio ring buffer (`Settings.buffer_enabled`, default on, `buffer_seconds`),
which is discarded on toggle-off and never written to disk (`audio::RollingBuffer` inside
`capture::Shared`).

`permissions::AUDIO_REQUIRES_PERMISSION = cfg!(target_os = "macos")` — on Windows the audio status
is reported `granted` immediately and the whole "Доступы" screen is hidden (`screens.ts`,
`platforms: ["macos"]`).

---

## 3. The two windows (the single most important structural fact)

`tauri.conf.json` declares **`"windows": []`** — no windows at all. Both are created in Rust code.

| | **launcher** | **main** (the HUD) |
| --- | --- | --- |
| Label | `launcher` | `main` |
| HTML entry | `launcher.html` | `index.html` |
| TS entry | `src/launcher.tsx` (3 lines) | `src/main.tsx` (3 lines) |
| Root component | `features/launcher/LauncherApp` | `src/App.tsx` |
| Created by | `window::create_launcher_window` from `setup_app` (startup) | `window::create_main_window` via the `launch_main_window` command |
| Destroyed by | `swap_to_main_window` on launch | `stop_main_window` (button in the HUD header → back to launcher) |
| Size | 1000×720, min 520×480, centred, resizable | `Settings.window_width/height` (default 960×680), min from `settings::limits::window` |
| Chrome | ordinary decorated window; on macOS the titlebar is merged into content (`platform::merge_titlebar_into_content`, objc: `NSWindowStyleMaskFullSizeContentView` + transparent titlebar + hidden title) | `transparent: true`, `decorations: false`, `alwaysOnTop`, `visibleOnAllWorkspaces`, `contentProtected` |
| `body` class | `launcher` (opaque, its own lightness ramp) | none (transparent, `--app-opacity`) |
| Global hotkeys | **none** | registered on `launch_main_window`, removed on `stop_main_window` |
| Readiness gate | **here** (`useLauncherReadiness`) | none — the HUD starts already ready |

**The launcher is the window this task redesigns.** Precise identity:

- Route/window: Tauri window label `launcher`, URL `launcher.html`.
- Entry: `apps/desktop/src/launcher.tsx` → `features/launcher/LauncherApp.tsx` →
  `features/launcher/LauncherPanel.tsx`.
- Structure: header `LaunchBar` (brand, search, readiness status, Launch button) + icon-only
  `Sidebar` (w-10) + `ScreenShell` + the active screen.

Both entries are built by **one** Vite config
(`build.rollupOptions.input: { main: index.html, launcher: launcher.html }`) and share
`src/lib`, `src/ipc`, `src/hooks`, `src/components/ui`. They **do not share state** — separate React
roots, separate stores. Shared bootstrap: `src/render-root.tsx` → `renderWindowRoot()`
(`#root` + `StrictMode` + `QueryClientProvider`).

`src/index.css` is **shared by both windows** — a single stylesheet, with launcher-only overrides
scoped under `body.launcher`.

---

## 4. Frontend stack

| Concern | What is actually used |
| --- | --- |
| Framework | **React 19.2** (`react`, `react-dom` ^19.2.7) |
| Build | **Vite 6**, `@vitejs/plugin-react`, two rollup inputs; dev server port 1420, HMR 1421 |
| TS | TypeScript ~5.6.2, `tsc -b` project references (`tsconfig.json` + `tsconfig.node.json`); path alias `@` → `src` |
| Styling | **Tailwind CSS v4** via `@tailwindcss/vite`, **CSS-first** — no `tailwind.config.*` exists. All tokens live in `@theme inline` inside `src/index.css`. Plus `tw-animate-css` |
| Components | **shadcn/ui** (`new-york` style, baseColor neutral, cssVariables) in `src/components/ui/*` — 12 primitives, built on **`radix-ui`** ^1.5.0 (the unified package, not per-primitive) |
| Icons | **lucide-react** ^1.17.0; global `svg.lucide { stroke-width: 1.75 }` in `index.css` — never per-icon props |
| Class utils | `clsx` + `tailwind-merge` (`src/lib/utils.ts` — a `cn` extended with the custom `font-size` group), `class-variance-authority` for variants |
| State | **No global store library.** Hook-local `useState`/`useRef` + hand-rolled stores: `useSettingsStore` (shared), `useSettings` (HUD-only layer), `useChats`. `@tanstack/react-query` ^5.101 is mounted in `renderWindowRoot` and used narrowly (`lib/query-client.ts`) |
| Routing | **No router.** The launcher is a `useState<ScreenId>` switch over the `LAUNCHER_SCREENS` registry; the settings screen has a nested `useState<SettingsTabId>` rail |
| i18n | **None.** No i18n library, no message catalogue. All UI copy is **Russian, hardcoded inline** in components and registries (~533 Russian string occurrences in `.tsx`, ~117 in non-test `.ts`). `index.html`/`launcher.html` are `lang="ru"`. **New copy must be Russian, written the same way.** |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` (token palette in `index.css`) |
| Testing | **vitest 4** + jsdom + `@testing-library/react`; `src/test-setup.ts` installs an in-memory `Storage` shim (Node 26 shadows jsdom's localStorage). 57 test files / 506 tests, all green at baseline |
| Lint | eslint 9 flat config, **type-aware and strict** (`eslint.config.js`), + `eslint-plugin-react-hooks`, `react-refresh`, `import-x`, `eslint-config-prettier` |

### Where theming lives today

**One file: `apps/desktop/src/index.css` (374 lines).** There is no other theme source.

- `:root` — the default `"gray"` theme: `--background`, `--foreground`, `--card`, `--popover`,
  `--muted(-foreground)`, `--primary` (oxblood `oklch(0.47 0.17 18)`), `--secondary`, `--accent`,
  `--destructive` (`oklch(0.6 0.21 27)`), `--border`, `--input`, `--ring`, `--surface`,
  `--surface-active`, `--code-surface`, `--recording`, plus `--app-opacity`, `--chat-font-size`,
  `--radius`.
- `:root[data-theme="black"]` — the second theme, a darker override set (9 vars).
- `body.launcher` and `:root[data-theme="black"] body.launcher` — the launcher's own opaque
  lightness ramp (`--background/-card/-popover/-surface/-surface-active/-border/-input/-ring`).
- `@theme inline` — maps the CSS vars to Tailwind utilities (`--color-*`), plus the radius ladder
  (`sm/md/lg/xl` from `--radius`), `--font-sans`/`--font-mono`, the font-size scale
  (`--text-hint` 10.5 / `--text-caption` 11.5 / `--text-body` 12.5 / `--text-title` 15 /
  `--text-chat`), `--window-radius: 22px`, and four shadow tokens
  (`--shadow-btn`, `--shadow-raise`, `--shadow-pop`, `--shadow-modal`).
- `@custom-variant dark (&)` makes shadcn's `dark:` unconditional — **the theme is dark-only, and
  not a single `dark:` class is left in the markup**.
- Applied by `lib/window-controls.ts`: `applyTheme` (a `data-theme` attribute on
  `documentElement`), `applyOpacity` (`--app-opacity`), `applyChatFontSize` (`--chat-font-size`).
- `Settings.theme` is `"gray" | "black"`, clamped in Rust (`settings.clamp`) and mirrored in
  `applyTheme`. **The OS colour-scheme preference is not consulted anywhere**; the launcher window
  is even built with `.theme(Some(tauri::Theme::Dark))`.

**Hardcoded colour audit (baseline).** Zero raw hex / `rgb()` / `hsl()` / `oklch()` literals exist
in any `.ts`/`.tsx` file. Only **four** Tailwind palette classes survive:

```
src/components/PreviewPanel.tsx:17    bg-white              (the HTML-preview iframe surface)
src/components/AttachmentChip.tsx:17  bg-black/75 text-white (remove-chip badge over a thumbnail)
src/components/Teleprompter.tsx:120   bg-black/85           (teleprompter scrim)
src/components/ui/dialog.tsx:31       bg-black/55           (dialog overlay scrim)
```

Everything else already goes through tokens. The "zero hardcoded colours" goal is therefore about
**finishing** four cases and about the ~40 raw `oklch()` literals that remain inside `index.css`
itself (syntax-highlight tokens, scrollbar, shadows) — not about a sweep through components.

---

## 5. Commands (verified to run at baseline)

Run from the **repo root** `harpyhare/` unless a `cd` is shown.

```bash
# install (all workspaces, one shared node_modules)
npm install

# dev
cd apps/desktop && npm run tauri dev     # the ONLY way to see the desktop UI
npx nx dev landing                        # landing on http://localhost:3000

# checks — all four pass at baseline
npx nx run-many -t typecheck              # tsc -b (desktop) / tsc --noEmit (landing)
npx nx run-many -t lint                   # eslint (both)
npx nx run-many -t test                   # vitest run — 57 files / 506 tests green
npm run knip                              # dead code + deps, workspace-aware

# single project
npx nx <target> desktop                   # build | lint | typecheck | test
cd apps/desktop && npx vitest run src/hooks/useChats.test.ts

# builds
npx nx build desktop                      # tsc -b && vite build → apps/desktop/dist
npx nx build landing                      # next build → apps/landing/.next
cd apps/desktop && npm run tauri build    # .app + .dmg in src-tauri/target/release/bundle/

# Rust  (PATH may need: export PATH="$HOME/.cargo/bin:$PATH")
cargo test   --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
#   ↑ this run REGENERATES apps/desktop/src/ipc/bindings.ts (the bindings::tests test)
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --release

# formatting
npm run format        # prettier --write . (sorts Tailwind classes via prettier-plugin-tailwindcss)
npm run format:check
```

Toolchain present on this machine: **node v26.7.0, npm 11.19.0, nx 23.0.1, cargo 1.97.1,
rustc 1.97.1**, host **darwin 25.6.0 (macOS)**. Windows cannot be built or tested here — the NSIS
installer and the Windows clippy pass are CI-only.

Pre-commit (husky) is real and will reject a commit on: unformatted staged files, a type error, a
lint error, **or a dead export** (knip). Budget for that.

---

## 6. Tauri: version, windows, permissions, platform integration

**Tauri v2** (`tauri = "2"`, features `macos-private-api`, `image-png`;
`tauri-plugin-global-shortcut` 2.3.2, `tauri-plugin-clipboard-manager` 2.3.2,
`tauri-plugin-updater` 2.10.1). Bindings are generated by `tauri-specta` 2.0.0-rc +
`specta-typescript` 0.0.12.

| Concern | Where it lives |
| --- | --- |
| App config | `apps/desktop/src-tauri/tauri.conf.json` — `windows: []`, `withGlobalTauri: true`, `macOSPrivateApi: true`, `csp: null`, updater endpoint → `screenfriskofficial/harpyhare-releases` |
| Window creation & flags | `src-tauri/src/window.rs` (`create_launcher_window`, `create_main_window`, sizes as consts at the top of the file) |
| macOS/Windows native tweaks | `src-tauri/src/platform.rs` + `platform/macos.rs` + `platform/windows.rs` (`merge_titlebar_into_content`, `clip_native_window_corners`, privacy-pane deep links, screen-capture preflight) |
| Capabilities (v2 ACL) | `src-tauri/capabilities/default.json` — windows `["main","launcher"]`, permissions `core:default`, `core:window:allow-start-dragging`, `global-shortcut:default`, `clipboard-manager:default`, `clipboard-manager:allow-write-text`. **Setters are deliberately not granted** — window control goes through Rust commands |
| Global shortcuts | registered/unregistered in `window.rs` (`GLOBAL_HOTKEYS` table) against the registry in `src-tauri/src/hotkeys.rs` (`HOTKEY_ACTIONS`) |
| Permissions | `src-tauri/src/permissions.rs` — 3 commands (`permissions_status`, `request_permission(kind)`, `open_permission_settings(kind)`), 3 kinds (`audio`/`screen`/`microphone`), 3 states (`unknown`/`granted`/`denied`). **OS settings deep links already exist** per kind and per OS |
| Updater | `src-tauri/src/update.rs` + `system::check_for_update`/`install_update`; UI in `features/launcher/screens/UpdatesScreen.tsx` |
| Tray / autostart / single-instance / notifications | **none of these exist.** No tray icon, no autostart plugin, no single-instance plugin, no notification plugin |
| Info.plist | `src-tauri/Info.plist` — `NSAudioCaptureUsageDescription`, `NSMicrophoneUsageDescription` |
| Icons | `src-tauri/icons/` |
| Rust modules | 35 modules under `src-tauri/src/` — the ones a UI redesign may touch: `window.rs`, `permissions.rs`, `settings.rs`, `hotkeys.rs`, `events.rs`, `bindings.rs`, `preferences.rs`, `platform*.rs` |

### The Rust ⇄ TS contract (must not be broken casually)

- `apps/desktop/src/ipc/bindings.ts` is **generated** — never hand-edit. Regenerated by
  `cargo test --lib`; CI runs `git diff --exit-code` on it.
- Adding a command: `#[tauri::command] #[specta::specta]` + a line in `collect_commands!` in
  `bindings.rs` + `cargo test`.
- Types that travel only through an **event** must be listed in `.typ::<>()` in `bindings.rs`.
- `src/ipc/types.ts` holds hand-written ergonomic mirrors; `src/ipc/contract.test.ts` asserts
  `SameShape<Ours, Rust.X>` (including key sets) — those assertions must not be deleted.
- Settings bounds are exported from Rust as `SETTINGS_LIMITS`; defaults as `SETTINGS_DEFAULTS`.
  The launcher's controls read them directly — no local copies.
- `bindings.ts` must be **byte-identical on macOS and Windows** — never let a `#[cfg]` value reach it.

Current command surface (39, from `bindings.rs`): `send_to_claude`, `cancel_stream`,
`count_chat_tokens`, `probe_connectivity`, `list_models`, `load_chats`, `save_chats`,
`load_context_library`, `save_context_library`, `save_chat_image`, `load_chat_images`,
`prune_chat_images`, `read_context_import_file`, `read_context_pdf_bytes`, `retry_transcription`,
`start_auto_mode`, `stop_auto_mode`, `auto_mode_active`, `list_audio_input_devices`,
`check_audio_source`, `list_audio_output_devices`, `get_settings`, `set_settings`,
`get_official_presets`, `set_ptt_suspended`, `redeem_access_code`, `set_window_size`, `close_app`,
`hide_main_window`, `launch_main_window`, `stop_main_window`, `capture_region_screenshot`,
`permissions_status`, `request_permission`, `open_permission_settings`, `copy_image_to_clipboard`,
`open_external`, `set_preview_html`, `check_for_update`, `install_update`, `get_app_version`.

Current event surface: `state-changed`, `transcript-ready`, `stt-error`, `llm-delta`, `llm-done`,
`llm-error`, `llm-usage`, `update-available`, `update-progress`, `update-done`,
`toggle-teleprompter`, `resize-key`, `official-presets-updated`, `screenshot-ready`,
`screenshot-error`, `focus-prompt`, `auto-turn`, `auto-mode-changed`, `auto-mode-error`,
`auto-answer`, `audio-level`.

---

## 7. Source inventory (apps/desktop/src)

```
src/
├── launcher.tsx  main.tsx  render-root.tsx  index.css  test-setup.ts  vite-env.d.ts
├── App.tsx                                    ← the HUD root, 902 lines
├── ipc/           bindings.ts (generated) commands.ts events.ts types.ts preview.ts + 3 tests
├── lib/           30 framework-free modules + tests (platform, errors, hotkeys, chats, models,
│                  composer, presets, context-library, auto-turns, stream-reveal, window-size,
│                  window-controls, teleprompter, quick-actions, brand, utils, …)
├── hooks/         23 hooks + tests (useSettingsStore, useSettings, useChats, useClaudeStream,
│                  useRecorder, useTranscription, useAutoMode, usePermissions, useConnectivity,
│                  useUpdater, useWindowControls, useWindowDrag, useAudioCheck, …)
├── components/    27 presentational components (StatusBar, Composer, AnswerPanel, ChatTabs,
│   │              QuickActionsBar, Teleprompter, PreviewPanel, HotkeysPopover, UpdateDialog,
│   │              ConnectivityOverlay, AutoTranscript, AutoModeIndicator, EqBars, IconButton,
│   │              ThinkingIndicator, ScreenShareIndicator, AccessCodeForm, SectionLabel, …)
│   └── ui/        12 shadcn primitives: badge button dialog input label popover scroll-area
│                  select slider switch textarea tooltip
└── features/launcher/          ★ THE LAUNCHER
    ├── LauncherApp.tsx   LauncherPanel.tsx (220)   LaunchBar.tsx (120)   LaunchButton.tsx
    ├── Sidebar.tsx   ScreenShell.tsx   LauncherSearch.tsx   SettingsTabsRail.tsx
    ├── screens.ts (registry)   settings-tabs.ts (registry)   search.ts   permission-rows.ts
    ├── start-steps.ts   useLauncherReadiness.ts   useHotkeyEditor.ts   contract.ts   fields.tsx
    ├── AudioCheckCard.tsx   ContextLibraryPanel.tsx   HotkeyCapture.tsx
    ├── screens/     StartScreen.tsx (210)  SettingsScreen.tsx  PermissionsScreen.tsx  UpdatesScreen.tsx
    └── sections/    ApiKeysSection  SttSection  HotkeysSection  QuickActionsSection
                     WindowSection  BehaviorSection  AppearanceSection  AutoModeSection  PresetsSection
```

Launcher screen registry (`screens.ts`): `start` (Старт) · `contexts` (Контексты) ·
`presets` (Пресеты) · `settings` (Настройки) · `permissions` (Доступы, macOS only) ·
`updates` (Обновления). Groups: `start`, `content`, `system` (pinned to the bottom with `mt-auto`).

Settings tab registry (`settings-tabs.ts`, 7 tabs): `access` (Ключи) · `speech` (Речь) ·
`hotkeys` (Клавиши) · `quick-actions` (Действия) · `window` (Окно) · `behavior` (Поведение) ·
`appearance` (Вид). Nested rail breaks at `min-[900px]` — a calculated threshold, not a guess.

---

## 8. Repo state and hygiene at the start of this task

- Branch: **`feat/auto-mode`**, ahead of `main`. Remote branches include `origin/redesign`.
- **Uncommitted changes exist** (4 files, 111 diff lines): `apps/desktop/CLAUDE.md`,
  `src-tauri/src/capture.rs`, `src-tauri/src/capture/windows.rs`, `src-tauri/src/recording.rs`.
  These are the user's in-flight work and **must be preserved**, not reverted or committed by us.
- Commit messages in this repo are **Russian**, conventional-commit prefixed
  (`feat(desktop): …`, `fix(desktop): …`, `docs: …`).
- Docs convention: design history lives in `apps/desktop/docs/superpowers/{specs,plans}`.
  The redesign docs for this task go in **`harpyhare/docs/redesign/`** (a new directory; the root
  `docs/` did not exist before).

---

## 9. Established design invariants that constrain the redesign

Non-negotiable rules already encoded in `apps/desktop/CLAUDE.md` and in tests. Read them as
existing product decisions with reasons, not as legacy to be cleaned up:

1. **Shape and depth come from tokens, never literals.** `--radius` 8px ladder, `--window-radius`
   22px (which must match the native `WINDOW_CORNER_RADIUS_LOGICAL_PX` in Rust), four named shadows.
   Not a single `rounded-[22px]` remains.
2. **Primary (oxblood) is never a text colour.** Allowed only for indicators (dots, equaliser, list
   markers, active tab underline), button fills, and `destructive` errors.
3. **Indicator dot vocabulary is fixed**: `destructive` = "you must act", `primary` = "fine /
   brand / info", `muted-foreground` = "checking / not set". `--destructive` was deliberately
   separated from `--primary` in hue AND lightness so 6px dots are distinguishable.
4. **No `transition-opacity` anywhere in the HUD** — an opacity animation in a transparent frameless
   window promotes a WKWebView compositing layer and leaves unflushed pixels. Hover-reveal is
   instant. (The launcher is opaque and *may* animate — `.launcher-rise` is the precedent.)
5. **Focus is one thing**: `focus-visible:ring-2`. No `ring-[3px]`.
6. **One uppercase step only** — `SectionLabel`. Plus the `LaunchBar` brand line.
7. **The font scale has exactly five steps** (`hint/caption/body/chat/title`); do not invent more.
   The primitives in `components/ui/*` are shared by both windows and sit on that scale.
8. **`prefers-reduced-motion` already has a block** in `index.css` silencing `.launcher-rise`,
   `.eq-bar`, `.thinking-shimmer`. Any new `@keyframes` must be added to it.
9. **Window control goes through Rust commands, not JS** — no window setter capabilities are
   granted except `allow-start-dragging`.
10. **Permissions are granted from exactly one place** (the launcher). No modals, no scattered
    grant points, no prompt may ever appear unprompted.
11. **The launcher always lands on "Старт"** (`DEFAULT_SCREEN`); the old "land on the blocker"
    behaviour was removed deliberately.
12. **Registries are the single source of truth** — `LAUNCHER_SCREENS`, `SETTINGS_TABS`,
    `HOTKEY_ACTIONS`, `PERMISSION_ROWS`, `API_KEY_IDS`, `SETTINGS_LIMITS`. The launcher search index
    is *built from* them. Adding a screen/tab/permission means adding a registry entry, not markup.
13. **No hardcoded hotkey combinations** anywhere — including no `⌘K` for the launcher search.
