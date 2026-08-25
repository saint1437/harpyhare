# 04 — Tauri & platform integration (analyst D)

## Summary

Two webviews exist, both built in Rust (`tauri.conf.json:16` is `"windows": []`): `launcher` (decorated,
1000×720, centred, **theme pinned to Dark**) and `main` (frameless, transparent, always-on-top,
content-protected). Tauri 2.11.5 / tao 0.35.3 / wry 0.55.1, `@tauri-apps/api` 2.11.1.
The ACL (`capabilities/default.json`) grants `core:default` plus exactly one window setter,
`allow-start-dragging`; every other window mutation must go through a Rust command, and
`set_window_size` refuses any window but `main` — **the launcher cannot be resized, centred, focused
or shown from JS at all**. `global-shortcut:default` and `clipboard-manager:default` grant an empty
permission list; `clipboard-manager:allow-write-text` is granted and never called.
`core:window:allow-theme` **is** granted, so `theme()`/`onThemeChanged` work — but `window.rs:67`
forces `Theme::Dark`, which on macOS sets `[NSApp setAppearance:]` app-wide and permanently, so the
OS colour scheme is unreadable from JS **and** from `prefers-color-scheme` on both OSes.
No tray, no autostart, no single-instance, no notifications; the updater exists and is Rust-only.
Permission status is fetched once and never refreshed — the "grant in System Settings, come back"
loop leaves the launcher stale. On Windows the only real permission (microphone) blocks launch on a
screen that is hidden from the sidebar and titled "Разрешения macOS".

## Windows

### Every webview-bearing window

Only two exist. `grep -rn "WebviewWindowBuilder" src-tauri/src` returns `window.rs:51` and
`window.rs:79` and nothing else.

| | **launcher** | **main** (HUD) |
| --- | --- | --- |
| Label | `"launcher"` — `src-tauri/src/window.rs:10` | `"main"` — `src-tauri/src/window.rs:9` |
| URL | `WebviewUrl::App("launcher.html")` — `window.rs:13,54` | `WebviewUrl::App("index.html")` — `window.rs:12,82` |
| Title | `app.package_info().name` = `"Audio System"` — `window.rs:33-35,56,84`; `tauri.conf.json:3` | same |
| Initial size | `1000.0 × 720.0` logical — `window.rs:14-15`, applied `window.rs:57-60` | `settings.window_width × window_height`, default `960 × 680` — `window.rs:85`; `settings.rs:87-88` |
| Min size | `520.0 × 480.0` — `window.rs:16-17`, applied `window.rs:61-64` | `300 × 520` (`limits::window::WIDTH.min`/`HEIGHT.min`) — `window.rs:86-89`; `settings.rs:87-88` |
| Max size | not set (frontend clamps to 1600×1100 — `lib/window-size.ts:1-4`, mirroring `settings.rs:87-88`) | same |
| `resizable` | `true`, explicit — `window.rs:65` | not called → default `true` (`tauri-utils-2.9.3/src/config.rs:2312`) |
| `decorations` | not called → default **`true`** (`config.rs:2323`) | **`false`** — `window.rs:91` |
| `transparent` | not called → **`false`** | **`true`** — `window.rs:90`; requires `macos-private-api` (`Cargo.toml:22`) + `"macOSPrivateApi": true` (`tauri.conf.json:15`) |
| `alwaysOnTop` | not called → `false` | **`true`** — `window.rs:92` |
| `visibleOnAllWorkspaces` | not called → `false` | **`true`** — `window.rs:93` (no-op on Windows, see Quirks) |
| `contentProtected` | `!settings.screen_share_visible` — `window.rs:68` (default `true`, since `screen_share_visible` defaults `false`, `settings.rs:209`) | `!settings.screen_share_visible` — `window.rs:94` |
| `skipTaskbar` | not called → `false` | not called → `false` |
| `center` | **yes** — `window.rs:66` | **yes** — `window.rs:95` |
| `theme` | **`Some(tauri::Theme::Dark)`** — `window.rs:67` | not set → `None` |
| `shadow` | not called → `true` (`config.rs:2337`) | `true` |
| Post-build native | `platform::merge_titlebar_into_content(app)` — `window.rs:71` | `platform::clip_native_window_corners(app)` — `window.rs:98` |
| Created by | `setup_app` → `create_launcher_window` — `lib.rs:85` | `swap_to_main_window` → `create_main_window` — `window.rs:195` |
| Destroyed by | `swap_to_main_window` — `window.rs:197-199` | `swap_to_launcher_window` — `window.rs:218-220` |
| Programmatic resize | **none** — `set_window_size` bails on `main_window(&app)` being absent (`window.rs:261-263`) | `set_window_size` tween — `window.rs:258-286` |
| Global hotkeys | none | registered on create (`window.rs:196`), torn down on stop (`window.rs:216`) |
| CSS `--window-radius` | `0px` — `src/index.css:115` (`body.launcher`) | `22px` — `src/index.css:89` |

Both windows are listed in the capability (`capabilities/default.json:5`:
`"windows": ["main", "launcher"]`). A window absent from that array gets **no** `core:default` and
every `invoke` from it is rejected (CLAUDE.md:297).

### Other webview-like surfaces (none are windows)

- **The HTML preview** is an `<iframe>` inside `main`, served by a custom URI scheme registered in
  `lib.rs:50-59` (`PREVIEW_URI_SCHEME = "preview"`, `lib.rs:40`) from `App.preview_html`, which
  `system::set_preview_html` fills (`system.rs:12-16`). Response is `text/html; charset=utf-8`
  (`preview_protocol.rs:1-8`). The origin is platform-specific (`preview://localhost` on macOS vs
  `http://preview.localhost` on Windows) and is therefore always built through Tauri's own
  `convertFileSrc("", "preview")` (`src/ipc/preview.ts:1-8`). It is cross-origin to
  `tauri://localhost` and has **no capability entry**, so it cannot `invoke` anything.
- **The region-screenshot overlays are native, not webviews.** macOS: an `NSWindow` subclass created
  in C compiled into the binary (`src-tauri/native/region_capture.c:75-77` registers the class,
  `:189-194` creates the window and sets its level; Rust FFI wrapper `screenshot/macos.rs:8-16`).
  Windows: a `WS_POPUP` window with `WS_EX_TOPMOST | WS_EX_TOOLWINDOW`
  (`screenshot/windows.rs:441-442`), class registered once via `OnceLock`
  (`screenshot/windows.rs:426`). Neither needs an ACL entry.

### The custom-titlebar situation, per OS

**macOS.** `platform::merge_titlebar_into_content` (`platform/macos.rs:43-58`) reaches the launcher's
`NSWindow` and sends three messages: `setStyleMask: mask | 1<<15`
(`STYLE_MASK_FULL_SIZE_CONTENT_VIEW`, `platform/macos.rs:40`), `setTitlebarAppearsTransparent: true`,
`setTitleVisibility: 1` (`TITLE_VISIBILITY_HIDDEN`, `platform/macos.rs:41`). The window keeps its
native frame and its **traffic lights stay at the default position**; the web content simply extends
underneath the titlebar. Consequence for the frontend: the launcher header must reserve room on the
left. That is `MACOS_TRAFFIC_LIGHTS_CLASS = PLATFORM === "macos" ? "pl-16" : ""`
(`src/features/launcher/LaunchBar.tsx:12`), applied to the `<header>` at
`LaunchBar.tsx:96`. `pl-16` = 64px is a hardcoded guess at the traffic-light cluster's width; there
is no `traffic_light_position` call anywhere.

**Windows.** `platform::merge_titlebar_into_content` is an explicit empty no-op
(`platform/windows.rs:35`). The launcher therefore has an ordinary Windows caption bar with
minimise/maximise/close above the content, and `pl-16` is not applied. The header sits below the
caption, so the two OSes disagree about what the top 30-ish px of the window contains.

**Dragging.** `data-tauri-drag-region` is deliberately **not used** anywhere
(`grep -rn "data-tauri-drag-region" src` → no hits): Tauri's attribute injection did not work in the
frameless+transparent HUD (CLAUDE.md:311). Instead `useWindowDrag` (`src/hooks/useWindowDrag.ts:7-14`)
attaches `onMouseDown`, filters to the primary button (`PRIMARY_MOUSE_BUTTON = 0`, line 5) and to
`isDraggableChromeTarget` (`src/lib/window-controls.ts:18-20`), then calls
`startWindowDrag()` → `getCurrentWindow().startDragging()` (`src/ipc/commands.ts:46-48`) — the single
direct Tauri window-API call in the whole frontend. `isDraggableChromeTarget` rejects anything under
`NON_DRAGGABLE_SELECTOR = "button, a, input, textarea, select, [role='tab'], [data-no-drag]"`
(`window-controls.ts:1`). Only one element opts out by hand today: `LauncherSearch.tsx:117`
(`data-no-drag`). Consumers: `LaunchBar.tsx:92,95` (launcher header) and `StatusBar.tsx:79,82` (HUD
header), plus a direct `target === currentTarget` drag on the HUD root (`App.tsx:773`).
This is the **only** window mutation the frontend may perform: `core:window:allow-start-dragging`
(`capabilities/default.json:8`).

### Native rounding, vibrancy, DPI

**Rounding.** `WINDOW_CORNER_RADIUS_LOGICAL_PX: f64 = 22.0` (`platform.rs:18`) — its CSS twin is
`--window-radius: 22px` (`src/index.css:89`), consumed by `App.tsx:778`
(`rounded-[var(--window-radius)]` on `.app-shell`), `ConnectivityOverlay.tsx:8` and
`components/ui/dialog.tsx:31`. On macOS `clip_native_window_corners` (`platform/macos.rs:60-82`)
sets `contentView.wantsLayer = true`, then `layer.cornerRadius = 22` and `layer.masksToBounds = true`
— the native clip draws the shape while CSS draws the background; removing either regresses (WKWebView
lags a frame behind the resize tween and the right-hand corners flash square, CLAUDE.md:343). On
Windows the same facade call sets the DWM attribute `DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND`
(`platform/windows.rs:37-53`) — **the radius there is the system's, not 22px, and is not
configurable**. Both are applied to `main` only; the launcher's corners are whatever the OS gives a
decorated window, which is why `body.launcher` overrides `--window-radius: 0px` (`index.css:115`).

**Vibrancy / blur / material: none.** `grep -rn "vibrancy|NSVisualEffect|backdrop-filter|acrylic|mica|effects("`
across `src` and `src-tauri` returns zero hits. `core:window:allow-set-effects` is **not** granted
(it exists in the manifest but is absent from `core:window:default`), so a JS
`setEffects({ effects: ['acrylic'] })` would silently fail. Translucency in the HUD is pure CSS:
`.app-shell` uses `color-mix(in oklch, var(--background) calc(var(--app-opacity) * 100%), transparent)`
(`index.css:161-167`) over an OS-transparent window.

**DPI / scale factor.** Everything crossing the boundary is explicit about units.
Rust sizes are **logical** (`set_size(tauri::LogicalSize::new(width, height))`, `window.rs:358`);
positions are **physical** (`set_position(tauri::PhysicalPosition::new(x, y))`, `window.rs:356`,
`platform.rs:118-121`). `set_window_size` reads `w.scale_factor()` (`window.rs:264`) and converts
`inner_size()` physical → logical by division (`window.rs:265-266`), and `anchored_target_x`
multiplies back up to physical to clamp against the monitor (`window.rs:288-297`).
`frame_still_ours` repeats the same conversion per tween frame (`window.rs:303-310`).
On the frontend, `onWindowResized` (`src/ipc/events.ts:51-70`) subscribes to `win.onResized`, whose
payload is physical, and divides by `await win.scaleFactor()` (line 57-59) — `allow-scale-factor` is
part of `core:window:default`, no explicit grant needed. `onFileDrop` does the same with
`window.devicePixelRatio` instead (`events.ts:23,29,33-34`).
`lib/window-size.ts` is entirely logical: `WINDOW_WIDTH_MIN_PX 300 / MAX 1600`,
`HEIGHT_MIN 520 / MAX 1100` (lines 1-4), `NATIVE_SIZE_EPSILON_PX = 1.5` (line 6) — which must not be
stricter than Rust's `RESIZE_EPSILON_LOGICAL_PX = 1.0` (`window.rs:23`), or the frontend would send
requests Rust discards (CLAUDE.md:342). `nativeSizeEcho` (`window-size.ts:51-57`) reproduces exactly
what `applyNativeWindowSize` would persist, so `useWindowFrameSync` (`App.tsx:229-245`) can tell
"the user dragged the edge" from "the settings changed" and bail out entirely.

**What this constrains for the redesign.** (a) 22 is a *shared* constant — changing the HUD radius
means changing `platform.rs:18` and `index.css:89` together, and Windows will ignore the value
anyway. (b) There is no material/blur budget: any "frosted" look must be faked in CSS over
`--app-opacity`, and the launcher is fully opaque (`index.css:112-113`). (c) All layout maths must
stay logical; the only place physical pixels appear is window position.

## Integrations

| | Exists? | Where | Cost to add |
| --- | --- | --- | --- |
| **Tray icon** | **No.** No `trayIcon` in `tauri.conf.json`, no `TrayIconBuilder` in Rust (`grep -rni "trayicon\|TrayIconBuilder"` → 0 hits) | — | ACL already allows it: `core:tray:default` is inside `core:default` and grants `allow-new, allow-get-by-id, allow-remove-by-id, allow-set-icon, allow-set-menu, allow-set-tooltip, allow-set-title, allow-set-visible, allow-set-temp-dir-path, allow-set-icon-as-template, allow-set-icon-with-as-template, allow-set-show-menu-on-left-click`; `core:menu:default` grants the 22 menu perms; `core:image:default` grants `from-bytes`/`from-path`. So **no capability edit needed** — but the right home is Rust, and the product cost is the stealth posture (CLAUDE.md:363) |
| **Global shortcuts** | **Yes**, Rust-only | see below | — |
| **Autostart** | **No** | — | `tauri-plugin-autostart` in `Cargo.toml` + `.plugin()` in `lib.rs:45-49` + `"autostart:default"` in `capabilities/default.json` + a `Settings` field. Windows = HKCU Run key (fits `"installMode": "currentUser"`, `tauri.conf.json:40`); macOS = LaunchAgent |
| **Single instance** | **No** | — | `tauri-plugin-single-instance` — Rust-only, **no ACL entry** (it exposes no commands). Today a second launch spawns a second process with its own launcher; when it opens a HUD, `register_main_window_hotkeys` fails per-combo and only `eprintln!`s (`window.rs:121-124`), so PTT silently does nothing |
| **Updater** | **Yes** | see below | — |
| **Notifications** | **No** | — | `tauri-plugin-notification` + `.plugin()` + `"notification:default"`. macOS practical blocker: the bundle is ad-hoc signed (`"signingIdentity": "-"`, `tauri.conf.json:33`), and a banner would print the bundle name "Audio System" — directly at odds with the stealth decision |

### Global shortcuts, in detail

- **The registry** is `HOTKEY_ACTIONS` (`src-tauri/src/hotkeys.rs:159-313`), 17 actions, exported into
  `bindings.ts` via `.constant(HOTKEY_ACTIONS_CONSTANT, …)` (`bindings.rs:86`). Each has
  `id, group, label, hint, kind, scope, default_combo` (`hotkeys.rs:147-157`). `scope` is one of
  `Global | Recording | Hud | Teleprompter` (`hotkeys.rs:138-145`).
- **The registration table** is a second, independent list: `GLOBAL_HOTKEYS`
  (`window.rs:105-113`), seven triples of `(id, register_fn, unregister_fn)`:
  `record`, `toggle_window`, `teleprompter`, `auto_mode`, `auto_answer`, `screenshot`,
  `focus_prompt`. Drift between the two lists is silent, and is locked down by
  `window/tests.rs::global_scope_actions_and_the_registration_table_agree` (CLAUDE.md:432).
  The seven `Global` actions in the registry (`hotkeys.rs:166,175,202,211,229,238,292`) match exactly.
- **When registration happens:** `register_main_window_hotkeys` (`window.rs:115-125`) is called from
  `swap_to_main_window` (`window.rs:196`), i.e. only when the HUD is created, from the
  already-persisted settings. An empty combo means "unassigned" and is skipped (`window.rs:118-120`).
  Re-registration on a settings change goes through `preferences::reregister_changed_hotkeys`
  (`preferences.rs:116-129`), which **bails out early while there is no `main` window**
  (`preferences.rs:121-123`) — that is what makes the launcher's autosave safe.
- **When it is torn down:** `unregister_main_window_hotkeys_for` (`window.rs:127-135`) from
  `swap_to_launcher_window` (`window.rs:216`); it also unregisters the `Recording`-scope cancel key
  (`window.rs:134`). Additionally `set_ptt_suspended` (`preferences.rs:77-89`) unregisters/re-registers
  just the PTT combo while a text field has focus.
- **Mechanics:** `tauri-plugin-global-shortcut` 2.3.2 (`Cargo.toml:25`), initialised at `lib.rs:47`.
  Every handler is `app.global_shortcut().on_shortcut(shortcut, …)` (`hotkey.rs:20-136`);
  `Shortcut::from_str` parses the combo (`hotkey.rs:7-9`) and a parse failure is a `Result` that
  `register_main_window_hotkeys` only prints (`window.rs:121-124`).
- **Per-platform defaults** (`PlatformCombo {macos, windows}`, `hotkeys.rs:61-83`; the `primary_combo!`
  macro at `hotkeys.rs:47-54` substitutes `Cmd` vs `Ctrl`). The seven global ones:
  `record` `⌘R`/`Ctrl+R` (`hotkeys.rs:167`); `auto_mode` `⌘⇧L`/`Ctrl+Shift+L` (`:176`);
  `auto_answer` `⌘⇧Enter`/`Ctrl+Shift+Enter` (`:203`); `screenshot` `⌘⇧A`/`Ctrl+Shift+A` (`:212`);
  `focus_prompt` `⌘⇧D`/`Ctrl+Shift+D` (`:230`); `toggle_window` `⌘⇧H`/`Ctrl+Shift+H` (`:239`);
  `teleprompter` `⌘⇧T`/`Ctrl+Shift+T` (`:293`). The Win key is never offered on Windows
  (`MODIFIER_COMBOS.windows`, `hotkeys.rs:117-122`), because Windows owns it.
- **The accepted cost** (CLAUDE.md:434): a global shortcut takes the combination away from the *whole
  system* for as long as the HUD runs — `⌘R`/`Ctrl+R` stops reloading pages in the browser,
  `⌘⇧T`/`Ctrl+Shift+T` stops reopening a closed tab. This is deliberate and was chosen over F-keys.
  UI consequence: the launcher must never present a hotkey editor as "just a preference" — it is a
  system-wide claim, and the HUD's lifetime is the claim's lifetime.
- **The frontend cannot register anything.** `global-shortcut:default` (`capabilities/default.json:9`)
  resolves to `"permissions": []` — the plugin's own default is "no features are enabled by default"
  (`gen/schemas/acl-manifests.json`, `global-shortcut.default_permission`). The entry is inert.

### Updater, in detail

- Plugin `tauri-plugin-updater` 2.10.1 (`Cargo.toml:38`), initialised `lib.rs:49`. Endpoint and
  minisign pubkey in `tauri.conf.json:46-53`, pointing at
  `https://github.com/screenfriskofficial/harpyhare-releases/releases/latest/download/latest.json`.
  `"createUpdaterArtifacts": true` (`tauri.conf.json:24`).
- **Commands:** `system::check_for_update` → `update::check` (`system.rs:18-22`, `update.rs:25-34`)
  and `system::install_update` → `update::install` (`system.rs:24-28`, `update.rs:55-72`). Both are in
  `collect_commands!` (`bindings.rs:57-58`). `install` claims a one-shot lock
  (`update.rs:74-84`), downloads, emits `update-done`, sleeps `PRE_RESTART_RENDER_DELAY = 300ms`
  (`update.rs:13,64`) and calls `app.restart()`.
- **Events:** `update-available` / `update-progress` / `update-done` (`events.rs:17-19`, emitters at
  `events.rs:209-219`). Progress is throttled to whole percent (or whole MiB when the total is
  unknown) — `update.rs:92-102,146-152`.
- **Auto-check:** `update::spawn_auto_check` from `setup_app` (`lib.rs:91`), first run after
  `AUTO_CHECK_INITIAL_DELAY = 5s`, then every `AUTO_CHECK_INTERVAL = 6h` (`update.rs:11-12,104-115`).
  Disabled in debug builds unless `ITECH_UPDATE_ENDPOINT` is set (`update.rs:9,117-119`). Suppressed
  for a version the user skipped (`Settings.skipped_version`, `update.rs:124,133-140`).
- **UI:** `features/launcher/screens/UpdatesScreen.tsx` (progress bar `:40-59`, notes rendered as
  markdown `:91-97`, install button `:118-121`) driven by `src/hooks/useUpdater.ts` (event
  subscriptions `:43-59`, `install` `:61-69`, `checkNow` `:71-78`). The screen lives in the launcher
  precisely because the 5-second auto-check fires while the launcher is what is on screen
  (CLAUDE.md:330).
- **The updater's JS API is unreachable**: no `updater:*` permission appears in
  `capabilities/default.json`. `updater`'s own default would grant
  `allow-check, allow-download, allow-install, allow-download-and-install`, but it is not requested.
  Everything goes through the two Rust commands.

## Capabilities

Source of truth: `src-tauri/capabilities/default.json` (11 lines) and the generated
`src-tauri/gen/schemas/acl-manifests.json` (72 KB) / `desktop-schema.json`.
`gen/schemas/capabilities.json` confirms the resolved capability, `local: true`,
`windows: ["main","launcher"]`.

### What is granted

`"core:default"` expands to nine sub-sets (`acl-manifests.json` → `core.default_permission`):
`core:path:default, core:event:default, core:window:default, core:webview:default, core:app:default,
core:image:default, core:resources:default, core:menu:default, core:tray:default`.

- **`core:window:default` — 28 permissions, 26 of them pure getters:**
  `allow-get-all-windows, allow-scale-factor, allow-inner-position, allow-outer-position,
  allow-inner-size, allow-outer-size, allow-is-fullscreen, allow-is-minimized, allow-is-maximized,
  allow-is-focused, allow-is-decorated, allow-is-resizable, allow-is-maximizable,
  allow-is-minimizable, allow-is-closable, allow-is-visible, allow-is-enabled, allow-title,
  allow-current-monitor, allow-primary-monitor, allow-monitor-from-point, allow-available-monitors,
  allow-cursor-position, **allow-theme**, allow-is-always-on-top, allow-activity-name,
  allow-scene-identifier, **allow-internal-toggle-maximize**`.
  The last one is the only mutator that arrives for free (it is what a `data-tauri-drag-region`
  double-click uses); since the HUD has no drag region and the launcher is a normal resizable window,
  it is unused here but *is* invokable.
- **`core:event:default`:** `allow-listen, allow-unlisten, allow-emit, allow-emit-to`.
- **`core:app:default`:** `allow-version, allow-name, allow-tauri-version, allow-identifier,
  allow-bundle-type, allow-register-listener, allow-remove-listener, allow-supports-multiple-windows`.
- **`core:webview:default`:** `allow-get-all-webviews, allow-webview-position, allow-webview-size,
  allow-internal-toggle-devtools`.
- **`core:path:default`:** `allow-resolve-directory, allow-resolve, allow-normalize, allow-join,
  allow-dirname, allow-extname, allow-basename, allow-is-absolute`.
- **`core:image:default`:** `allow-new, allow-from-bytes, allow-from-path, allow-rgba, allow-size`.
- **`core:menu:default`:** 22 permissions (`allow-new … allow-set-icon`).
- **`core:tray:default`:** 12 permissions (`allow-new … allow-set-show-menu-on-left-click`).
- **`core:resources:default`:** `allow-close`.
- **`core:window:allow-start-dragging`** (`default.json:8`) — the one explicit setter.
- **`global-shortcut:default`** (`default.json:9`) → `"permissions": []`. **Grants nothing.**
- **`clipboard-manager:default`** (`default.json:10`) → `"permissions": []`. **Grants nothing.**
- **`clipboard-manager:allow-write-text`** (`default.json:11`) → grants `writeText` only.
  **Nothing calls it**: the frontend uses the DOM `navigator.clipboard.writeText`
  (`App.tsx:130`, `App.tsx:745`, `PreviewPanel.tsx:47`); image copying goes through the Rust command
  `copy_image_to_clipboard` (`clipboard.rs:14-24`, invoked at `App.tsx:751`).

### What the frontend definitively cannot do

Every window mutation except `startDragging` and `internalToggleMaximize`. Named explicitly, because
they exist in the manifest and would silently no-op if called:
`set-size, set-position, center, show, hide, close, destroy, set-focus, minimize, maximize,
unminimize, unmaximize, toggle-maximize, set-always-on-top, set-always-on-bottom, set-decorations,
set-skip-taskbar, set-content-protected, set-visible-on-all-workspaces, set-theme, set-title,
set-resizable, set-min-size, set-max-size, set-size-constraints, set-icon, set-cursor-icon,
set-cursor-position, set-cursor-visible, set-cursor-grab, set-ignore-cursor-events, set-effects,
set-shadow, set-background-color, set-progress-bar, set-badge-count, set-badge-label,
request-user-attention, start-resize-dragging, set-closable, set-maximizable, set-minimizable,
set-focusable, set-enabled, set-fullscreen, set-simple-fullscreen, set-title-bar-style,
set-overlay-icon, **create**`.
Plus: global-shortcut `register/register-all/unregister/unregister-all/is-registered`; clipboard
`read-text/read-image/write-image/write-html/clear`; updater `check/download/install/download-and-install`.
Plus everything from plugins that are **not installed at all**: `opener`/`shell`, `dialog`, `fs`,
`http`, `os`, `notification`, `process`, `store`, `positioner`, `window-state`.

### The redesign's plausible wish-list, answered

| Want | Today |
| --- | --- |
| Open a URL | **Available via Rust**: `system::open_external` (`system.rs:6-10`) → `platform::open_web_url`, which **silently drops anything that is not `http://`/`https://`** (`platform.rs:20-21,179-187`). `open(1)` on macOS (`platform/macos.rs:125-127`), `ShellExecuteW` on Windows (`platform/windows.rs:131-142,164-167`). A `mailto:` or a settings URL will not go through it |
| Show a notification | **Not available.** No plugin, no command. New dependency + capability |
| Resize a window | `main` only, via `set_window_size` (`window.rs:258-286`). **Launcher: impossible** — `window.rs:261-263` returns early |
| Re-centre a window | **Not available** (`allow-center` not granted, no Rust command). Both windows call `.center()` once at build time |
| Move focus / raise a window | **Not available from JS** (`allow-set-focus`, `allow-show` not granted). Rust has `window::show_and_focus_prompt` (`window.rs:137-143`) for `main` only, reachable only from Rust call sites |
| Read the OS colour scheme | **API granted, value poisoned** — see "What a redesign would need from Rust" |
| Read the OS accent colour / high contrast | **Not available** on either side |
| Know the platform | `src/lib/platform.ts:12` — `detectPlatform(navigator.userAgent)`, deliberately never asked of Rust so `bindings.ts` stays byte-identical (CLAUDE.md:87,147) |
| App version | `system::get_app_version` (`system.rs:30-34`) — duplicates the already-granted `core:app:allow-version` |
| Listen to window focus/blur/resize/move | **Available** — `core:event:allow-listen` covers `tauri://focus`, `tauri://blur`, `tauri://resize`, `tauri://move`, `tauri://theme-changed`, `tauri://close-requested`. Only `onResized` is used today (`src/ipc/events.ts:51-70`) |
| Open devtools | `core:webview:allow-internal-toggle-devtools` is granted |

## OS permissions

Three kinds (`permissions.rs:15-21`: `Audio | Screen | Microphone`), three states
(`permissions.rs:7-13`: `Unknown | Granted | Denied`), three commands
(`permissions_status` `:99-107`, `request_permission` `:109-129`, `open_permission_settings` `:131-139`).

| Kind | macOS: what the OS requires | Windows: what the OS requires | How it is checked today | Can it be checked without prompting? |
| --- | --- | --- | --- | --- |
| **audio** (system audio) | TCC "Audio Recording" for a Core Audio process tap (macOS 14.2+). `NSAudioCaptureUsageDescription` — `src-tauri/Info.plist:5-6` | **Nothing.** WASAPI loopback needs no consent | `audio_state` (`permissions.rs:42-53`): `!AUDIO_REQUIRES_PERMISSION` → `Granted`; an existing capture object → `Granted`; `!audio_permission_requested` → `Unknown` *without probing*; otherwise `recording::ensure_capture` → granted/denied | **No.** Core Audio offers no preflight — *building the tap is the request*. Hence the `Settings.audio_permission_requested` gate (`settings.rs:172`) and `rebuild_capture_now`'s `would_prompt` early-out (`recording.rs:91-99`) |
| **screen** | TCC "Screen Recording". `CGPreflightScreenCaptureAccess` / `CGRequestScreenCaptureAccess` (`platform/macos.rs:141-153`). Grant is keyed by cdhash, which is why the capture overlay is C compiled into the binary rather than a sidecar (CLAUDE.md:367) | **Nothing.** `screen_capture_access()` and `request_screen_capture_access()` both `return true` (`platform/windows.rs:156-162`) | `screen_state` (`permissions.rs:69-78`): preflight `true` → `Granted` (even with no flag — it may have been granted outside the app); otherwise `screen_permission_requested` (`settings.rs:173`) decides `Denied` vs `Unknown` | **Yes** — `CGPreflightScreenCaptureAccess` is a genuine, prompt-free preflight. This is the one kind whose live status is free to poll |
| **microphone** | TCC Microphone. `NSMicrophoneUsageDescription` — `Info.plist:7-8` | The Microphone privacy toggle (`ms-settings:privacy-microphone`). Win32 desktop apps get a global "let desktop apps access your microphone" switch, **no per-app prompt** | `microphone_state` (`permissions.rs:55-63`): existing mic capture → `Granted`; `!mic_permission_requested` (`settings.rs:188`) → `Unknown`; otherwise `probe_microphone` → `build_mic_capture` (`app_state.rs:86-94`) opens the input device | **No** on macOS — opening the device is the request (`AVCaptureDevice.authorizationStatus` is never called). On Windows the open just fails, no prompt |

### Deep links (exact strings)

**macOS** — `platform/macos.rs:13-18`, opened with `Command::new("open")` (`platform/macos.rs:12,125-127`):

```
audio       x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture
screen      x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture
microphone  x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone
```

**Windows** — `platform/windows.rs:26-28`, opened with `ShellExecuteW(… "open" …)`
(`platform/windows.rs:29,131-142`):

```
audio       ms-settings:sound                 ← the Sound page, NOT a privacy pane (there is no
                                                system-audio privacy pane on Windows). Unreachable
                                                in practice: audio is always `Granted` there
screen      ms-settings:privacy               ← the privacy ROOT, not a pane. Also unreachable
microphone  ms-settings:privacy-microphone    ← correct, and the only one that can actually fire
```

Dispatch: `open_permission_settings(kind)` (`permissions.rs:131-139`) → the three facade functions
(`platform.rs:159-169`). Note these bypass `open_web_url`'s http/https filter by design — they are
separate backend entry points, not URLs.

### Requesting

`request_permission(kind)` (`permissions.rs:109-129`): Audio → early `Granted` on Windows
(`:114-116`), else `mark_requested` + `recording::rebuild_capture`; Screen → `mark_requested` +
`CGRequestScreenCaptureAccess`; Microphone → `mark_requested` + `probe_microphone`.
`mark_requested` (`permissions.rs:80-97`) flips the flag, saves settings to disk and swaps the
in-memory copy. A second, sanctioned grant point exists: `audio_check::start_system`
(`audio_check.rs:65-70`) also calls `mark_requested(Audio)` before raising the capture, because the
"can you hear me" check *is* a prompt on macOS.

### The asynchrony trap

CLAUDE.md:396: **the TCC prompt is asynchronous — `request_permission` returns `Denied` before the
user has pressed "Allow"**. The status therefore changes under the cursor. Consequences already
encoded in the UI: a fixed-width action column `grid-cols-[1.25rem_minmax(0,1fr)_14rem]`
(`PermissionsScreen.tsx:43`), `min-w-18` on the "Выдать" button (`:75`), `min-h-9` on the explanation
(`:58`), and the **same** button pair for `unknown` and `denied` (`:62`) so nothing moves. For
`denied`, "Выдать" doubles as a re-probe and catches exactly the "they allowed it after the command
had already returned" case. Only `granted` removes the buttons, and the row height is unchanged.
**Any redesign of this row must preserve state-independent geometry.**

### Required / conditional / optional

- **Required to launch: `audio` only.** `useLauncherReadiness.ts:55` pushes `AUDIO_BLOCKER`;
  `ready` = `missingKeys.length === 0 && permissions.audioOk && !microphoneNeeded`
  (`useLauncherReadiness.ts:66`). Declared in the registry as `need: "launch"`
  (`permission-rows.ts:29-35`).
- **Conditional: `microphone` ↔ auto mode.** `microphoneNeeded = autoModeEnabled && !microphoneOk`
  (`useLauncherReadiness.ts:47`), blocker at `:56`; registry `need: "auto-mode"`
  (`permission-rows.ts:36-42`), filter `requiredPermissionRows(autoModeEnabled)`
  (`permission-rows.ts:53-57`). `Settings.auto_mode_enabled` defaults `false` (`settings.rs:223`).
- **Optional: `screen`.** Registry `need: "optional"` (`permission-rows.ts:43-49`); needed only by the
  region screenshot. Denial produces a `screenshot-error` with `ErrorCode::Permission` and **no system
  prompt** (`screenshot.rs:67-77`).
- The gate is derived **only** from `permissions_status`, never from screen visibility
  (CLAUDE.md:384) — so on Windows, where audio/screen report `Granted`, no blocker arises.

## Platform quirks

Each with the one-line UI consequence.

1. **`visible_on_all_workspaces` is a no-op on Windows.** tao 0.35.3 gates
   `Window::set_visible_on_all_workspaces` to macOS/Linux (`tao/src/window.rs:1227-1229`); the builder
   attribute is stored (`tao/src/window.rs:283,589`) and never applied on Windows.
   → *The HUD follows the user across macOS Spaces but is bound to one virtual desktop on Windows;
   do not promise "always visible" in copy.*
2. **`contentProtected` needs Windows 10 2004+ and silently does nothing below it.** tao implements it
   as `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`
   (`tao/src/platform_impl/windows/window.rs:1090-1098`); the build number is never checked.
   → *`ScreenShareIndicator` can honestly report "hidden" for a window that is in fact being captured
   (CLAUDE.md:337); the indicator's copy must not over-promise.*
3. **No opacity transitions in the HUD.** An opacity animation in a transparent frameless window
   promotes a WKWebView compositing layer and leaves unflushed pixels (CLAUDE.md:163).
   → *Hover-reveal in the HUD is instant; only the opaque launcher may animate (`.launcher-rise`,
   `index.css:134-147`).*
4. **`field-sizing: content` does not work in WKWebView** (CLAUDE.md:147).
   → *Auto-growing textareas need the JS `usePromptAutosize` (scrollHeight + ResizeObserver); a
   redesign cannot switch to the CSS property.*
5. **WebView2 serves classic Segoe UI with no optical sizing unless the stack is explicit.**
   `--font-sans: ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI",
   system-ui, sans-serif` (`index.css:80-82`).
   → *Any font change must keep an explicit Windows entry or the type will regress on that OS.*
6. **`WM_SIZE` fires per pixel during a Windows drag** (CLAUDE.md:342).
   → *`useNativeResizeSync` coalesces through `requestAnimationFrame` (`App.tsx:258-268`); any new
   resize-driven layout must be rAF-coalesced too.*
7. **The Permissions screen does not exist on Windows.** `platforms: MACOS_ONLY`
   (`screens.ts:25,62`), filtered by `availableOn` (`screens.ts:77-83`) in the sidebar
   (`Sidebar.tsx:80`) and by `screenVisible` in the start steps (`start-steps.ts:50`).
   But `LauncherPanel.tsx:201` renders `PermissionsScreen` for *any* navigation to that id, and its
   heading is the literal "Разрешения macOS" (`PermissionsScreen.tsx:99`).
   → *On Windows a microphone blocker is reachable only from the header status line and lands on a
   macOS-titled screen with no sidebar entry — see P0.*
8. **`bindings.ts` must be byte-identical on macOS and Windows** (CLAUDE.md:87). No `#[cfg]` value may
   reach it; platform-varying data travels as pairs (`PlatformCombo`, `hotkeys.rs:61-83`;
   `MODIFIER_COMBOS`, `:108-123`), and commands that do nothing on one platform stay in the contract.
   → *A redesign may not add "isMacOS" to the Rust contract; it must use `lib/platform.ts`.*
9. **Windows are created only from the main thread.** `launch_main_window`/`stop_main_window` are
   async and route through `window::on_main_thread` (`window.rs:180-191,226-234`) because creating a
   WebView2 from a worker thread never returns (CLAUDE.md:186).
   → *Any new window or window-lifecycle command must follow the same pattern; the bug is invisible on
   macOS.*
10. **`merge_titlebar_into_content` is a no-op on Windows** (`platform/windows.rs:35`); the launcher
    keeps a native caption bar there while macOS merges it into the content.
    → *The header's `pl-16` inset (`LaunchBar.tsx:12`) applies on macOS only, and the vertical budget
    at the top of the window differs by OS.*
11. **`clip_native_window_corners` gives 22px on macOS and the system radius on Windows**
    (`platform/macos.rs:79` vs `platform/windows.rs:44`).
    → *The HUD's corner radius is not identical across OSes and cannot be made so.*
12. **`disable_cursor_autohide_on_typing` swizzles `+[NSCursor setHiddenUntilMouseMoves:]` on macOS**
    (`platform/macos.rs:20-38`) and is an empty no-op on Windows (`platform/windows.rs:33`); the global
    `cursor: default !important` (`index.css:170-173`) suppresses every cursor shape.
    → *No pointer/I-beam/not-allowed affordance is available to the redesign — hover state must be
    carried by colour alone.*
13. **Arrow keys are intercepted natively, above the webview.** macOS uses an `NSEvent` local monitor
    (`platform/macos.rs:101-123`); Windows uses a **global** `WH_KEYBOARD_LL` hook that must compare
    `GetForegroundWindow()` against the HUD hwnd (`platform/windows.rs:90-129`). The monitor swallows
    the keyDown only when it handled it, and bails when there is no `main` window
    (`platform.rs:128-141`).
    → *Arrow-key UI inside the launcher is safe; inside the HUD, `⌘`/`Ctrl` + arrows never reach React.*
14. **The screenshot overlay runs a nested native event loop**, and re-entry is cut off by an RAII
    guard (`screenshot.rs:38-51`) whose price is a silently-ignored repeat press (CLAUDE.md:380).
    → *A redesign cannot show progress or an error for a screenshot request that was swallowed.*
15. **`device_event_filter(DeviceEventFilter::Always)`** (`lib.rs:46`) keeps raw device events flowing
    even when unfocused.
    → *No UI consequence today, but it is why the HUD can react while another app is frontmost.*
16. **The process is named "Audio System" on both OSes** (`tauri.conf.json:3-4`, window title from
    `package_info().name`, `window.rs:33-35`); `contentProtected` hides pixels, never the process
    (CLAUDE.md:363).
    → *Any UI that names the app to the OS (tray tooltip, notification title, taskbar entry) breaks the
    disguise.*

## What a redesign would need from Rust

Hard rule assumed: Rust stays untouched except for the minimum needed to expose state to the UI or to
support onboarding.

| Need | What exists | Verdict |
| --- | --- | --- |
| **Read the OS colour-scheme preference** | The API and the ACL are both already there: `getCurrentWindow().theme()` (`node_modules/@tauri-apps/api/window.d.ts:519`) is gated by `core:window:allow-theme`, which is inside `core:window:default` ⊂ `core:default`; `onThemeChanged` (`window.d.ts:1339`) listens to `tauri://theme-changed` (`tauri-2.11.5/src/manager/window.rs:35,271`) under `core:event:allow-listen`. **But the value is pinned.** `window.rs:67` calls `.theme(Some(tauri::Theme::Dark))`; on macOS tao turns that into `set_ns_theme(Some(Dark))` → `[NSApp setAppearance: NSAppearanceNameDarkAqua]`, which is **app-wide and never reset** (`tao/src/platform_impl/macos/window.rs:384-400,611`). `Window::theme()` then returns the cached forced value (`:1518-1521`), and the appearance observer compares against that same forced value so `ThemeChanged` never fires (`tao/src/platform_impl/macos/window_delegate.rs:664-677`). WKWebView's `prefers-color-scheme` follows the NSApp appearance, so the CSS media query is pinned too. On Windows the pin is per-window (`tao/src/platform_impl/windows/dark_mode.rs:116-138`) and wry pushes it into WebView2 as `SetPreferredColorScheme(DARK)` (`tauri-runtime-wry-2.11.4/src/lib.rs:5063-5067` → `wry-0.55.1/src/webview2/mod.rs:1831-1838`) — same result. `setTheme()` is not grantable here (`allow-set-theme` absent). | **cheap in code, needs-approval in product.** Deleting one line (`window.rs:67`) makes both `theme()` and `prefers-color-scheme` truthful with **no new command, no bindings change, no capability change**. The side effect is that the launcher's native title bar and its scrollbars start following the OS. Nothing else can read the preference; there is no zero-Rust workaround. |
| **Resize the launcher** | `set_window_size` is hard-wired to `main_window(&app)` (`window.rs:261-263`). JS `setSize` needs `core:window:allow-set-size`, which CLAUDE.md:297 forbids adding casually. | **cheap** if a *static* size change suffices — edit `LAUNCHER_WINDOW_WIDTH/HEIGHT_LOGICAL_PX` and the mins (`window.rs:14-17`); build-time only, no contract change. **moderate** for a dynamic resize: widen `set_window_size` to take a window label (or add `set_launcher_size`) → `bindings.rs` → `cargo test` regenerates `bindings.ts` → CI `git diff --exit-code`. |
| **Re-centre the launcher** | Nothing. `.center()` runs once at build (`window.rs:66`); `allow-center` is not granted. | **moderate** — a new command, same bindings cost as above. Worth pairing with the resize command rather than shipping two. |
| **Raise / focus the launcher** | `show_and_focus_prompt` is `main`-only (`window.rs:137-143`); `allow-set-focus`/`allow-show` are not granted. | **moderate.** Only matters if onboarding needs to pull the window forward after the user returns from System Settings. |
| **Add a window** | Both builders live in `window.rs`; a new label must also be added to `capabilities/default.json:5` (or it gets no `core:default` at all), to `vite.config` rollup inputs, to `knip.json` entry points, and go through `renderWindowRoot`. | **needs-approval.** The "two windows" fact is structural (CLAUDE.md:7-11); a third one touches build config, ACL and dead-code config at once. |
| **Add a new event** | `events.rs` const + emitter (pattern at `events.rs:8-28,114-223`), a `.typ::<>()` line in `bindings.rs:61-82` if it carries a payload type, then `cargo test`, then `EventMap` in `src/ipc/types.ts`. | **cheap** for a unit-payload event, **moderate** with a new type (a `contract.test.ts` `SameShape` assertion is expected). |
| **Add a tray icon** | Nothing in Rust or config. The ACL already permits it from JS (`core:tray:default` + `core:menu:default` + `core:image:default`). Icons exist (`tauri.conf.json:25-31`). | **moderate technically / needs-approval in product.** No capability edit; but a menu-bar or notification-area item contradicts the "Audio System" disguise (CLAUDE.md:363), and a JS-created tray is owned by a webview that gets destroyed on every launcher↔HUD swap. |
| **Open an OS settings pane not currently covered** | Three panes per OS today (`platform/macos.rs:13-18`, `platform/windows.rs:26-28`), dispatched by `PermissionKind` (`permissions.rs:131-139`). `open_external` cannot be reused — it filters to http/https (`platform.rs:179-187`). | **cheap** if it maps to a new `PermissionKind` variant (add the variant, two consts, two backend fns, one facade fn, `cargo test`; `PERMISSION_ROWS` is a registry, `permission-rows.ts:28-50`). **moderate** if it needs a standalone command. |
| **Live permission status** | `permissions_status` already short-circuits on an existing capture (`permissions.rs:46-48`) and never probes while `*_requested` is `false` (`:49-51,59-61`), and `screen_state` uses the prompt-free preflight (`:70`). | **cheap and zero-Rust.** Polling or a `tauri://focus` listener is safe: it cannot raise a prompt. Only the frontend hook changes (`usePermissions.ts:30-37`). |
| **Notifications** | Nothing. | **needs-approval** — new crate, new plugin init, new capability, macOS signing caveat, and it names the app on screen. |
| **Autostart** | Nothing. | **moderate** — plugin + capability + a `Settings` field (which means `settings.rs` + `bindings.ts`). |
| **Single instance** | Nothing. | **cheap** — Rust-only plugin, no ACL entry, no bindings change. |

## Problems

### P0 — blocks the target outcome

- **P0.1 Permission status is fetched once and never refreshed.** `usePermissions` runs `refresh()` in
  a mount effect only (`src/hooks/usePermissions.ts:30-37`); the sole other trigger is the manual
  "Проверить заново" button (`PermissionsScreen.tsx:93`). There is no polling, no `tauri://focus`
  listener, no refresh after `open_permission_settings`. The canonical flow — press "Настройки", grant
  in System Settings, alt-tab back — leaves the launcher showing the stale state with the Launch button
  still disabled. **This directly defeats "live permission status".** The fix is frontend-only and
  cheap (see the table above).
- **P0.2 On Windows, the one real permission has no reachable UI.** With `auto_mode_enabled` and the
  microphone not granted, `useLauncherReadiness.ts:47,56,66` blocks the launch — but the Permissions
  screen is filtered out of the sidebar (`screens.ts:62` + `Sidebar.tsx:80`) and the Start screen omits
  every permission step (`start-steps.ts:50`). The only route is the header status line
  (`LaunchBar.tsx:48-65` → `LauncherPanel.tsx:150-152`), which lands on a screen headed
  "Разрешения macOS" (`PermissionsScreen.tsx:99`) that lists three rows, two of which are already
  granted on Windows. **Graceful degradation on denial fails on the platform where denial is the only
  case that exists.**
- **P0.3 The launcher window is immovable, unresizable and unfocusable from the app.**
  `set_window_size` refuses anything but `main` (`window.rs:261-263`) and no window setter beyond
  `start-dragging` is granted. Any redesign that wants a different footprint — a compact onboarding
  step that expands, a "first run is smaller" flow, a responsive minimum below 520×480 — must change
  Rust consts (`window.rs:14-17`) or add a command. This must be decided **before** layout work, not
  after.

### P1

- **P1.1 The OS colour scheme is unreadable.** `window.rs:67` pins `Theme::Dark`, which on macOS is an
  app-wide, permanent `[NSApp setAppearance:]`. Both `theme()` and `prefers-color-scheme` return dark
  regardless of the user's setting, on both OSes. If the palette work wants "follow the system" as an
  option, this is the single line that decides it.
- **P1.2 The asynchrony trap is invisible to the user.** After pressing "Выдать" for audio, the row
  reads "нет доступа" (`PermissionsScreen.tsx:11`) until the user both presses Allow *and* presses
  "Проверить заново". The geometry is protected (CLAUDE.md:396) but the *copy* is not: nothing says
  "the system is asking you now".
- **P1.3 A denied optional permission has no launcher-side degradation story.** Screen recording is
  `need: "optional"` (`permission-rows.ts:44-49`); denial surfaces only later, as a
  `screenshot-error` with `ErrorCode::Permission` inside the HUD (`screenshot.rs:68-77`). The launcher
  never says "the region screenshot will not work".
- **P1.4 No single-instance guard.** A second launch produces a second process whose global-shortcut
  registrations fail one by one, and the failure is only an `eprintln!` (`window.rs:121-124`) — the
  user gets a HUD whose PTT is silently dead.

### P2

- **P2.1 Two Windows privacy deep links are wrong, and dead.** `ms-settings:sound`
  (`platform/windows.rs:26`) is the Sound page, not a privacy pane; `ms-settings:privacy`
  (`:28`) is the privacy root. Both are unreachable today because audio and screen always report
  `Granted` on Windows (`permissions.rs:43-45`, `platform/windows.rs:156-158`) and the buttons only
  render when `!granted` (`PermissionsScreen.tsx:62`) — but they would mislead the moment that screen
  becomes visible on Windows.
- **P2.2 Dead permission API surface.** `permissions::MICROPHONE_REQUIRES_PERMISSION`
  (`permissions.rs:32`) is never read anywhere. `usePermissions` exports `screenOk`, `allOk` and
  `needsAttention` (`usePermissions.ts:15-18,57-60`) and **nothing consumes them** — vestiges of the
  auto-opening modal described at CLAUDE.md:394. knip does not catch object properties.
- **P2.3 Inert / unused capability entries.** `global-shortcut:default` and
  `clipboard-manager:default` (`capabilities/default.json:9-10`) each resolve to `"permissions": []`;
  `clipboard-manager:allow-write-text` (`:11`) is granted and never called (the app uses
  `navigator.clipboard.writeText`). This contradicts the file's own stated rule that setter
  permissions are not kept "just in case" (CLAUDE.md:297).
- **P2.4 `get_app_version` (`system.rs:30-34`) duplicates the already-granted
  `core:app:allow-version`** — a command that exists only because the capability was never consulted.

### P3

- **P3.1 The 22px window radius is HUD-only.** `body.launcher` sets `--window-radius: 0px`
  (`index.css:115`). A rounded launcher would require `decorations:false` + a launcher branch in
  `clip_native_window_corners`, i.e. re-inventing the custom-titlebar problem on Windows.
- **P3.2 `pl-16` is a magic number.** `LaunchBar.tsx:12` hardcodes 64px for the macOS traffic lights;
  there is no `traffic_light_position` call, so any change to header height or a new top row risks a
  collision.
- **P3.3 Two independent "dark" declarations.** `body { color-scheme: dark }` (`index.css:109`) and
  `@custom-variant dark (&)` are separate mechanisms; a system-theme option would have to move both.

## Opportunities

- **A system-theme-aware palette is one deleted Rust line away.** `core:window:allow-theme` and
  `core:event:allow-listen` are already granted; only `window.rs:67` stands in the way. No new command,
  no bindings regeneration, no capability edit.
- **Live permission status is free.** `permissions_status` is prompt-safe by construction
  (`permissions.rs:46-51,59-61,70`), so a `tauri://focus` listener or a low-frequency poll costs
  nothing in Rust and fixes P0.1 entirely on the frontend.
- **Tray and menus need no ACL work.** `core:tray:default` (12 perms) and `core:menu:default`
  (22 perms) are already inside `core:default` — the only real cost of an onboarding tray affordance is
  the product decision about the disguise.
- **`core:event:allow-emit-to` is granted**, so if the two windows ever coexist they can address each
  other directly without a Rust relay.
- **Everything permission-shaped is a registry.** `PERMISSION_ROWS` (`permission-rows.ts:28-50`),
  `LAUNCHER_SCREENS` (`screens.ts:27-71`), `HOTKEY_ACTIONS` (`hotkeys.rs:159-313`). Adding a kind, a
  screen or an OS pane is a data edit plus one enum variant, not markup surgery.
- **The screen permission's preflight is prompt-free**, so the launcher can display a truthful,
  continuously-updated screen-recording status at any cadence — the only kind where that is possible.
- **`window_title` already reads `package_info().name`** (`window.rs:33-35`), so nothing in the UI
  hardcodes "Audio System"; the disguise survives any header redesign automatically.

## Open questions for the human

1. **May `window.rs:67` (`.theme(Some(tauri::Theme::Dark))`) be removed?** It is the single blocker for
   reading the OS colour scheme, and on macOS it is an app-wide `NSApp` appearance override. Removing
   it makes the launcher's native title bar, scrollbars and form controls follow the OS. Yes/no decides
   whether "follow the system" is even on the table for the palette work.
2. **Is the launcher allowed to change size or position at runtime?** Today it cannot (P0.3). Static
   const changes are free; a dynamic resize needs a new/widened Rust command and a `bindings.ts`
   regeneration. Which of the two is sanctioned?
3. **How should permission status refresh — poll, or on `tauri://focus`?** Both are frontend-only and
   prompt-safe. A poll is simpler; focus is cheaper and matches the actual user flow.
4. **On Windows, where should the microphone blocker lead?** Options: make the Permissions screen
   visible on Windows when auto mode is on (and retitle it away from "Разрешения macOS"), route the
   blocker to Settings → auto-mode instead, or drop the blocker and let auto mode fail loudly in the
   HUD. Today it leads to a hidden, mistitled screen.
5. **Is a tray icon acceptable at all**, given that the process deliberately presents itself as
   "Audio System" and `contentProtected` explicitly does not hide the app's presence
   (CLAUDE.md:363)?
6. **Are notifications acceptable?** They need a new plugin and capability, they would print the bundle
   name on screen, and the macOS bundle is ad-hoc signed (`tauri.conf.json:33`).
7. **May the inert capability entries be cleaned up in this pass** (`global-shortcut:default`,
   `clipboard-manager:default`, the unused `clipboard-manager:allow-write-text`), or is
   `capabilities/default.json` out of scope for a UI redesign?
8. **Should the "Выдать" flow gain explicit "the system is asking you now" copy** (P1.2), or is the
   state-independent geometry considered sufficient?
