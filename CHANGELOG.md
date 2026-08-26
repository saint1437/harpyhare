# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Desktop:** Auto-listen mode — the app listens to both sides of the conversation and answers the interviewer without a keypress. Speakers are separated by source rather than by diarization: the interviewer is the system output tap/loopback, the user is the microphone, so two independent captures run at once. Toggle in the HUD header, global hotkey (`⌘⇧L` / `Ctrl+Shift+L`) and an "enable on launch" setting.
- **Desktop:** Manual answering, now the default — the mode listens and transcribes but nothing is sent until you press `⌘⇧↵` / `Ctrl+Shift+Enter` or the button in the transcript panel; the previous behaviour is back behind an "answer without a keypress" toggle.
- **Desktop:** A live transcript panel above the composer showing labelled, ordered turns, with submitted turns dimmed so it is clear what the button will send.
- **Desktop:** Four-step first-run onboarding (three on Windows) replacing the bare prerequisites card, including a privacy step that finally admits to the background buffer, its preroll, and clipboard copying — both settings can be switched off right there.
- **Desktop:** A "Start" screen the launcher opens on, listing exactly what still blocks launch (API access, required system permissions) with status and controls inline, and the access-code field autofocused.
- **Desktop:** The orb — minimizing now shrinks the window into a 72x72 circle instead of hiding it, so push-to-talk still answers "can I be heard right now?"; it can be dragged with the mouse and unrolls itself when an answer is ready.
- **Desktop:** A single notification surface shared by both windows for failures, with details, copy, a repeat counter and a lifetime bar.
- **Desktop:** A sound check, a microphone status in the readiness list, and chat images that survive a restart.

### Changed

- **Desktop:** Visual redesign — warm neutral palette with a single accent plus a dedicated capture colour, primitives moved onto the new tokens, brand and capture colours separated, launcher 17% lighter, empty chat teaches the shortcut.
- **Desktop:** The capture status has five named states ("Recording", "Listening", "Ready", "Transcribing", "Not listening") instead of one colour carrying four meanings, sits on its own opaque surface for contrast over arbitrary desktops, and gained a Pause that stops passive listening while keeping push-to-talk.
- **Desktop:** The HUD header was decluttered — only the capture status keeps a backing surface, tools are muted, window controls are separated by a hairline.
- **Desktop:** The background buffer is on by default and comes up together with the window.
- Documentation translated to English.

### Fixed

- **Desktop:** A stack of capture and auto-mode races — rebuilding capture while auto-listen is live now re-arms buffering and the segmenter (changing device used to silently kill the interviewer feed), a saturating `in_flight` decrement, a start/stop transition lock, a busy slot for the sound check, a leaked consumer thread on failed capture start, and a collapse generation so double-tapping the hotkey no longer jams the orb.
- **Desktop:** Cancellation now covers both the recording and the request; a recorded question expands the window without the size drifting; focus survives collapse and expand.
- **Desktop:** Native window shadow disabled on both windows; message action buttons no longer steal width from the answer and sit on the same surface as their message.
- **Desktop:** Auto-listen opens the microphone only once, and a failed sound check restores the background buffer.
- **Desktop:** Windows screenshot cropping used `chunks_exact` where `as_chunks` was needed.

## [0.12.0] - 2026-08-20

### Added

- **Landing:** Poster-direction redesign — oxblood palette, Unbounded display type, outlined text, a marquee and linocut assets; OG images redrawn and recompressed (790 KB to 122 KB).
- **Desktop:** A new prompt pool (preset pool version 4 to 5) published to the blob.

### Changed

- **Desktop:** The system prompt is now assembled from the preset, library materials and chat context only.
- Build artifacts are excluded from the Vercel deploy via `.vercelignore`.

### Removed

- **Desktop:** App identity masking is gone entirely — `identity.rs` and its backends, ~5 MB of skin icons, the `list_identities`/`set_app_identity` commands, `Settings.identity_id`, re-application after update, and the launcher screen. The window title now comes straight from the package info.
- **Desktop:** The detailed/concise answer style, along with its config, settings field, contract constant and settings control.
- **Landing:** The night scene (moon with a beam, stars, bushes, animated rabbit sprite) was removed with the redesign; the app demo stayed, reframed only.

## [0.11.0] - 2026-07-27

### Added

- **Desktop:** A quick-actions bar above the composer — configurable prompt buttons with "modifier + digit" hotkeys and their own send path that does not clear the draft.
- **Desktop:** Copying a message as text, or as an image through a new Rust clipboard path when it has none.
- **Desktop:** Duplicating a chat (`⌘⇧N` / `Ctrl+Shift+N`) — a clean chat carrying the current one's parameters.
- **Desktop:** A screen-share visibility indicator in the HUD header, and a detailed/concise answer style appended to the system prompt.
- **Launcher:** Search across settings, indexing screens, tabs, hotkeys, settings rows, permissions, presets, quick actions and library materials.

### Changed

- **Desktop:** Visual redesign — deeper palette, destructive separated from primary, a 4/6/8/12 radius ladder, shadow tokens, hairline borders, compact controls and a unified `ring-2` focus state.
- **Launcher:** A second tab rail inside Settings plus a presentation redesign following UX, visual and IA audits: primitives moved to the type scale, pressed/hover states, one focus ring, surfaces reduced to tokens, autosave shows "Saving…" and reports failures in a banner, and a stolen-hotkey note is now rendered in the group where the user acted.
- **Desktop:** The caret places itself in the composer on HUD launch, after a region screenshot, when a hidden window is shown, and on a global hotkey.

### Fixed

- **Launcher:** Search results were overlapped by page content.

## [0.10.4] - 2026-07-27

### Fixed

- **Release:** The Windows platform is merged into the existing `latest.json` instead of replacing it.

## [0.10.3] - 2026-07-27

### Fixed

- **Windows:** Arrow-key window control and manual resize, traced to three independent causes.

## [0.10.2] - 2026-07-26

### Fixed

- **Windows:** Choppy manual resize — the inner size is measured, not the outer one.

## [0.10.1] - 2026-07-26

### Added

- **Landing:** Moved from Vite to Next.js 16 with SEO tooling, an English localization of the app mockup, an interactive replica of the app in place of the static mock, and both platforms on a single download button.

### Changed

- **Landing:** Dark theme only; clouds replaced with stars.

### Fixed

- **Windows:** The HUD no longer waits for the capturer before showing (which left a white window), windows are created only from the main thread, and arrow-key interception was hardened with added diagnostics.
- **Build/CI:** No warnings in the release profile, Rust tests moved to the macOS job, and a debug Windows installer can be built on demand.

## [0.10.0] - 2026-07-26

### Added

- **Windows support.** The app was macOS-only; every platform-specific module was split into a neutral facade with `macos.rs`/`windows.rs` behind it (capture, platform, screenshot, identity). Windows gets system-audio capture via WASAPI loopback, a Win32/GDI region-screenshot overlay, a `WH_KEYBOARD_LL` hook for window arrows, and `ShellExecuteW` for links and settings panes. The landing page detects the visitor's OS, the release script became two-platform, and CI was added because a Windows bundle cannot be built on macOS.
- **Desktop:** Built-in region screenshot — a C overlay compiled into the binary over FFI (so the Screen Recording grant belongs to the app, not to a per-build sidecar), a `⌘⇧S` hotkey and a toolbar icon; the PNG lands in the active chat draft through the same path as a pasted image.
- **Desktop:** A single permissions surface (`permissions.rs` plus a launcher modal) replacing scattered banners and six commands. The capturer is no longer built during app setup — that was what triggered the macOS prompt at startup — and is raised lazily.
- **Hotkeys:** A single action registry with no hardcoded combos left, arbitrary key assignment (arrows, Space, Tab, punctuation, Home/End, numpad, not just letters and digits), and conflict resolution mirrored in Rust and TypeScript. Seven string settings collapsed into one `hotkeys` field, with a raw-JSON migration so custom combos survive the update.

### Changed

- **Launcher:** Redesigned around a launch bar, a two-group sidebar and screens instead of modals — permissions and updates became screens, seven flat tabs became six screens. Readiness is now structural: the status names the blocker in words and clicking it navigates there.
- **Launcher:** One settings-form language (`SettingGroup`/`SettingRow` plus select/switch/slider) replacing two ways of drawing a label and a three-column grid that broke long labels; presets became an expandable list with an empty state and visible built-ins.
- Hotkey defaults became platform-specific (`⌘` to `Ctrl`), and the Windows key is neither offered nor accepted as a modifier.

### Fixed

- **Launcher:** A false red "no audio access" banner on every launch, a swallowed `update-available` event, numeric fields drifting out of their clamp (replaced by sliders), and long strings overflowing a screen.

## [0.9.0] - 2026-07-24

### Added

- **Desktop:** A launcher window — the app now starts as an ordinary window (settings, contexts, masking, a "Launch" button); the floating HUD is created on demand and returns to the launcher.

### Changed

- **Desktop:** `lib.rs` was split into modules by responsibility, and the Rust to TypeScript contract — commands, boundary types and constants (limits, defaults, modifier combos) — is now generated by `tauri-specta` into `src/ipc/bindings.ts`. Errors carry typed codes instead of being parsed out of Russian prose with regexes.
- **Desktop:** The modifiers for moving the window, resizing it and scrolling the chat are configurable and applied consistently across every layer.

## [0.8.7] - 2026-07-22

### Added

- **Desktop:** A shimmer "Thinking…" indicator and a smooth fade-in for streamed text.

### Changed

- **Desktop:** A curated set of three models; the Fast mode toggle was dropped from settings and the backend.
- **Desktop:** The eraser button now clears the chat history rather than the draft.

### Fixed

- **Desktop:** No autoscroll while a response streams; message buttons no longer overlap each other or stick after use.

## [0.8.6] - 2026-07-22

### Added

- **Desktop:** App masquerading — eight selectable identities that rewrite the installed `.app` (`Info.plist`, icon bytes, executable name, best-effort ad-hoc codesign) and restart the process, so the Dock, `⌘-Tab`, Finder and Activity Monitor all change, not just the window title. The bundle identifier is deliberately left alone because the audio TCC grant hangs off it.

### Changed

- **Desktop:** The identity set moved from Apple system apps to third-party ones (Obsidian, Spotify, Proton VPN, Discord, Android Studio, Steam, DisplayBuddy, The Unarchiver).

### Fixed

- **Desktop:** Switching identity no longer leaves an intermediate relaunch behind on failure — preparation happens before the id is saved.

## [0.8.5] - 2026-07-22

### Added

- **Desktop:** An explicit connectivity requirement — a full-screen overlay above the app shell (chats and streams stay mounted) driven by `navigator.onLine`, online/offline events and an active 4-second probe, lifting itself when the connection returns.

### Removed

- **Desktop:** The browser mock in its entirety — the Tauri detection and fallback invoke, the demo chat seed, the HTML5 drop path for the context library and the `srcDoc` preview fallback. The frontend now runs only inside Tauri.

## [0.8.4] - 2026-07-22

### Fixed

- **Desktop:** The new-chat default now uses the exact Haiku 4.5 id returned by `/v1/models`.

## [0.8.3] - 2026-07-22

### Added

- **Presets:** Frontend, Java, Python, C# and DevOps interview presets.

### Changed

- **Desktop:** New chats default to Haiku 4.5, thinking off and no pre-prompt.

## [0.8.2] - 2026-07-22

### Added

- **Desktop:** PDF import into the context library.

## [0.8.1] - 2026-07-22

### Added

- **Presets:** A default set — Golang, HR Interview and System Design.

## [0.8.0] - 2026-07-22

### Added

- **Desktop:** A background audio buffer — a rolling window of 16 kHz samples capped in seconds, with a toggle and depth in settings and a status-bar button. Its final shape is automatic preroll: the buffer is prepended to the start of a push-to-talk recording rather than grabbed by hand.
- **Desktop:** A context library — folders, import and drag-and-drop of `.md` files, moving materials between folders with the mouse, and selecting materials for a chat.
- **Desktop:** A context-fullness indicator in the header, fed by stream usage and `max_input_tokens` from `/v1/models`, projected before sending via `count_tokens` and persisted in `chats.json`.
- **Desktop:** Message management — a hover trash can on any message and a tooltip menu to delete or resend.
- **Desktop:** A hotkey cheat sheet as a popover behind a keyboard icon in the header, backed by a `lib/hotkeys` registry.
- **Desktop:** Audio capture device selection with the tap recreated automatically when the output changes, and a system-audio permission request from the startup modal.
- **Desktop:** Window size settings, `⌘⇧`+arrows to resize with persistence, a configurable resize step, and `⌥↑↓` chat scrolling with a configurable step.
- **Desktop:** React Query caching for models, presets, audio devices and token projections.

### Changed

- **Desktop:** A dense UI overhaul — a single-line composer, an icon toolbar in the prompt card, tabs back in the header as a symmetric chat column, an equalizer recording indicator instead of a dot and status text, teleprompter and copy promoted to header icons, and the "Chat" title bar removed.
- **Desktop:** One design system — a font and surface scale in tokens, a shared `IconButton`, active dark branches on the primitives, a black theme, adaptive settings grids that collapse to one column on a narrow window, 5px scrollbars, 16px icons throughout, and red text confined to indicators.

### Fixed

- **Desktop:** Resizing no longer recenters the window; X is clamped to the monitor edge; mouse resize is synced back into settings; corners are clipped natively so they stay round during the tween.
- **Desktop:** The chat scrolls to the bottom before paint, and the "Down" button is correct when entering a chat.
- **Desktop:** A buffered push-to-talk session carries the recording flag, leaving buffering clears the rolling window, and a resampling failure disables the buffer instead of filling it.
- **Desktop:** Cloudflare error 1010 — a `User-Agent` is now sent by every client.
- **Landing:** The sun and moon no longer take up half the screen on narrow phones.

## [0.7.0] - 2026-07-09

### Added

- **Desktop:** Free access via one-time codes through a proxy. The user enters a code, the app exchanges it for a bearer token from a Cloudflare Worker, and both the LLM (Anthropic) and STT (Groq) traffic then flows through the proxy; the owner's keys stay in the proxy's secrets and never reach the user's machine. A non-empty token silences both user keys as the single source of truth, and redemption is idempotent.
- **Desktop:** A new app icon — the harpyhare rabbit.
- **Landing:** A redesign built around a living rabbit world with a scroll-driven day/night cycle, new copy and structure, interactive rabbits with a small state machine, and refreshed branding and OG images.

### Fixed

- **Desktop:** The "no API keys" banner moved below the header and adopted a calmer tone.

## [0.6.0] - 2026-07-08

### Added

- **Desktop:** A missing-API-keys warning — a startup modal linking to the Anthropic and Groq consoles, a persistent banner, and all composer actions disabled until keys are supplied through settings or the `.env` fallback.

## [0.5.1] - 2026-07-08

### Fixed

- **macOS:** A valid ad-hoc bundle signature (`signingIdentity "-"`).

## [0.5.0] - 2026-07-08

### Added

- **Landing:** A first landing page under `apps/landing`, with the download link and version number pulled at runtime from the latest `harpyhare-releases` release, so a new release appears on the site without a rebuild.
- **Presets:** A shared pool of official presets published to Vercel Blob, fetched at startup and every 30 minutes, cached to disk, with the bundled config as the offline default; official presets are read-only and merge with the user's local ones.
- **Presets:** "Golang" as the default preset for new chats, replacing the legacy transcription default.

### Changed

- The repository became an Nx + npm-workspaces monorepo, with the Tauri app moved wholesale into `apps/desktop` so every internal relative path kept working.
- Renamed throughout from `itech` to `harpyhare` — repository, packages and documentation.

### Removed

- The one-time legacy data migration from the `com.itech.voice` identifier.

### Fixed

- **Release/deploy:** `package-lock.json` belongs at the monorepo root rather than in `apps/desktop`, and Vercel gets a complete lockfile.

## [0.4.0] - 2026-07-08

### Added

- **Desktop:** A teleprompter — large centred answer text with smooth autoscroll, a focus band and edge fade so the eye stays in one place, a global `F10` hotkey that works without focus, manual wheel scrolling, resuming from where you stopped, and configurable speed and font size.

### Changed

- **Desktop:** Settings became a wide dialog filling almost the whole window and split into tabs (General, Hotkeys, Behaviour, Appearance, Presets), with presets in three columns.
- **Desktop:** Rebrand — the process is always named "Audio System", and "harpyhare.ai" is the brand shown in the UI.

## [0.3.0] - 2026-07-06

### Added

- **Desktop:** Process masquerading — the product name, main binary, window title and identifier all present as a neutral audio service, with a one-time migration of the data folder from the old identifier.

### Changed

- **Desktop:** Dictation appends to the draft instead of overwriting it.
- **Desktop:** The HTML preview centres itself on the monitor instead of drifting off-screen, the chat column is fixed-width so it stops jittering during the animation, and the html chip toggles the preview closed on a second click.
- **Desktop:** Ghost close and minimize buttons replaced the tiny traffic lights, and window dragging goes through an explicit `startDragging` call, which works in a frameless window where the drag region did not.

### Fixed

- **Desktop:** The mouse pointer no longer hides while typing and always stays a standard arrow.

## [0.2.0] - 2026-07-05

### Added

- **Desktop:** A per-chat toggle for server-side web search, enabled from the Models API capabilities rather than a hardcoded list of model names.
- **Desktop:** STT language and translation settings, routing to the translations endpoint when translating.
- **Desktop:** A per-chat persistent context that is sent as the system prompt and survives restarts.
- **Desktop:** A `screen_share_visible` setting that lifts content protection so the window is visible while sharing a screen.

### Changed

- **Desktop:** A partial answer is now kept in the history when you press Stop or the stream errors, instead of being thrown away.
- **Desktop:** Autoscroll sticks to the bottom only while the reader is there, with a "Down" pill to return.
- Large modules were decomposed and hardcoded values removed.

## [0.1.1] - 2026-07-05

Initial release.

### Added

- **Desktop:** System-audio capture through a Core Audio process tap with push-to-talk recording, downmixing and an RMS silence gate, 48 kHz to 16 kHz resampling and WAV encoding.
- **Desktop:** Speech-to-text through Groq (`whisper-large-v3-turbo`), streamed to the API while recording still runs.
- **Desktop:** Streaming answers from Anthropic with cancellation, an incremental SSE parser, image blocks from pasted screenshots, a per-chat thinking selector and a model list pulled live from the Models API.
- **Desktop:** A frameless, always-on-top HUD that is hidden from screen capture and recording, expands on the first answer with a smooth Rust-side tween, has transparency hotkeys and a global show/hide hotkey, and can be moved with `⌘`+arrows through a native event monitor.
- **Desktop:** Multiple chats — tabs, renaming, independent per-chat streams, and atomic persistence to `chats.json`.
- **Desktop:** Prompt presets — a managed pool with CRUD in settings and a per-chat preset that feeds the system prompt.
- **Desktop:** An embedded HTML preview panel served from a custom `preview://` origin, opened from a chip on `html` blocks in the feed or automatically after an answer.
- **Desktop:** A React 19 + Vite + Tailwind v4 + shadcn/ui frontend replacing the original vanilla one, with markdown rendering, code highlighting and attachment chips.
- **Desktop:** Application auto-update through `tauri-plugin-updater`, and API keys readable from `.env` with settings as a fallback.
- A strict lint toolchain — ESLint (type-aware), Prettier, Knip and a Husky pre-commit hook.

### Fixed

- **Desktop:** A deadlock on push-to-talk caused by hotkey handlers running under the plugin mutex.
- **Desktop:** Push-to-talk keeps working while the prompt field has focus, and the API's own error text is surfaced instead of a bare HTTP code.
