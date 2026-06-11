# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**itech** — a macOS-only Tauri 2 desktop app. Hold a push-to-talk key → capture **system audio** (e.g. voice from a video) → transcribe via Groq Whisper → edit the text (with pasted screenshots) → stream an answer from the Anthropic API. A floating, frameless, always-on-top HUD window plus a small "recording" overlay window.

Two halves: a **Rust backend** (`src-tauri/src/`) and a **React 19 frontend** (`src/`). The backend does all the privileged/native work; the frontend is pure UI over a typed IPC boundary.

## Commands

```bash
# Full app (Rust + frontend, hot reload) — the normal way to run
npm run tauri dev

# Frontend only in a browser (no backend; see "browser mock" below)
npm run dev          # then open the printed localhost URL

# Production bundle (.app + .dmg in src-tauri/target/release/bundle/)
npm run tauri build

# Frontend type-check + build (tsc -b also checks vite.config via project refs)
npm run build

# Frontend tests
npx vitest run                       # all
npx vitest run src/hooks/useX.test.ts   # one file

# Lint / format / dead-code (также гоняются на pre-commit через husky+lint-staged)
npm run lint            # eslint (строгий, type-aware) — без обхода правил TS
npm run lint:fix        # eslint --fix
npm run format          # prettier --write (сортирует Tailwind-классы)
npm run format:check    # prettier --check
npm run typecheck       # tsc -b
npm run knip            # неиспользуемые файлы/экспорты/зависимости
# Pre-commit (husky): lint-staged (eslint --fix + prettier на застейдженных) → tsc -b → knip

# Rust tests / lint  (PATH may need: export PATH="$HOME/.cargo/bin:$PATH")
cargo test  --manifest-path src-tauri/Cargo.toml --lib
cargo test  --manifest-path src-tauri/Cargo.toml --lib <test_name>   # one test
cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```

Design/spec history lives in `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## The Rust ⇄ frontend contract (read this first)

The backend exposes a **fixed set of commands and events**; the frontend mirrors them 1:1. When changing one side, change the other and keep names identical.

- **Commands** are registered in `generate_handler!` in `src-tauri/src/lib.rs`; argument names map snake_case (Rust) → camelCase (JS invoke). The frontend wrappers are in `src/ipc/commands.ts`.
- **Events** are `app.emit("name", payload)` in `lib.rs`; the frontend listens via `src/ipc/events.ts`, typed by `EventMap` in `src/ipc/types.ts` (`state-changed`, `transcript-ready`, `stt-error`, `llm-delta`, `llm-done`, `llm-error`, `preview-html` — адресное, эмитится только окну `preview`). LLM-события несут `chatId` (`{ chatId, delta }` / `{ chatId }` / `{ chatId, message }`) — стримы независимы по чатам.
- `Settings` (9 fields) is defined identically in `src-tauri/src/settings.rs` and `src/ipc/types.ts`.

## Frontend architecture (`src/`)

Strict layering — keep each layer's responsibility intact:

- **`src/ipc/`** — the **only** place that imports `@tauri-apps/api`. `commands.ts` (typed `invoke`), `events.ts` (`onEvent`), `types.ts`, `env.ts` (`isTauri`). Every command/event no-ops in the browser so the UI runs without a backend.
- **`src/lib/`** — framework-free pure logic with unit tests: `composer.ts` (attachment limit/downscale, `Attachment` type), `chats.ts` (chat model, `CHAT_LIMIT`, serialize/deserialize), `window-controls.ts` (`moveDelta`/`applyOpacity`).
- **`src/hooks/`** — one hook per contract slice (`useClaudeStream`, `useChats`, `useSettings`, `useRecorder`, `useTranscription`, `useWindowControls`, `usePttSuspend`). `useChats` owns the chat list, per-chat drafts/attachments, and disk persistence. Hooks depend on `ipc`, never on `@tauri-apps` directly; tested with `renderHook` + `vi.mock("@/ipc/...")`.
- **`src/components/`** — presentational, built on shadcn/ui primitives in `src/components/ui/` (run `npx shadcn@latest add <name>` to add more). `App.tsx` composes hooks + components.

Stack: React 19 + Vite + Tailwind v4 (CSS-first `@theme` tokens in `src/index.css`, graphite + oxblood dark theme, dark-only) + react-markdown. Path alias `@` → `src`.

**Browser mock:** `isTauri()` (checks `__TAURI_INTERNALS__`) gates all backend calls; outside Tauri the app renders with demo data, so `vite preview` is the way to visually iterate without building the `.app`.

## Rust backend (`src-tauri/src/`)

`lib.rs` is the glue: `App` state, all `#[tauri::command]`s, event emission, the recording pipeline, and the global-hotkey wiring. The domain modules are pure and unit-tested:

- `audio.rs` — downmix → resample (rubato, 48k→16k) → WAV (hound); RMS silence gate.
- `capture.rs` — system-audio capture via **Core Audio process tap** (`cidre`). The risky native piece; one-time tap creation, gated by an `AtomicBool`. Manual acceptance via `examples/record5s.rs`.
- `stt.rs` — `GroqStt` (whisper-large-v3-turbo, `language=ru`), error mapping.
- `llm.rs` — Anthropic request body (image blocks + adaptive thinking; no `thinking` for haiku), incremental `SseParser` (use `feed_bytes` for chunked UTF-8), streaming client with cancellation.
- `state.rs` — recorder FSM (`Idle → Recording → Transcribing → Idle`); min 0.3s / max 10min, Esc cancel.
- `settings.rs` — JSON at `~/Library/Application Support/com.itech.voice/settings.json`, written atomically with `0600`.
- `hotkey.rs` — push-to-talk registration; `parse_hotkey` is the only unit-tested function here.

## Non-obvious invariants (do not break these)

- **Чаты независимы и параллельны.** Источник истины — фронт (`useChats`: `Chat[]` + `activeId`); Rust хранит чаты как непрозрачную JSON-строку в `chats.json` (атомарно, `0600`, модуль `chats.rs`, команды `load_chats`/`save_chats`). `send_to_claude(messages, chat_id)` шлёт всю историю чата; отмена по-чатная через `Mutex<HashMap<chat_id, CancellationToken>>`. Картинки в `chats.json` не сохраняются (стрипаются в `serializeChats`). Лимит — `CHAT_LIMIT = 6`.
- **Hotkey handlers must defer all work.** `tauri-plugin-global-shortcut` invokes the handler while holding its registry mutex; doing register/unregister synchronously inside (e.g. registering Esc) is a re-entrant deadlock that hard-freezes the app. `hotkey.rs` wraps handlers in `defer()` (spawns onto the async runtime). The same applies to anything a handler triggers.
- **Window manipulation goes through Rust commands, not JS.** `move_window_by` and `set_window_height` are Rust commands. The JS `getCurrentWindow().setSize()` path silently fails because the window capabilities in `src-tauri/capabilities/default.json` grant `set-position`/`show`/`hide` but **not** `set-size`. Add any new window capability there if you must call from JS; otherwise prefer a Rust command. `set_window_height` also tweens (ease-out) on a background thread, dispatching each frame via `run_on_main_thread`, with a `resize_gen` generation guard.
- **`onEvent` uses a `live` flag** to pair subscribe/unsubscribe across the async `listen` promise — required for React StrictMode double-mount safety. `useClaudeStream` likewise cancels its pending rAF on unmount and gates late deltas after `stop`.
- **API keys: `.env` is a fallback only.** `lib.rs` setup reads `ANTHROPIC_API_KEY`/`GROQ_API_KEY` and applies them via `settings.apply_key_fallback` **only when** the corresponding settings.json field is empty (UI-saved keys win). `.env` is read from cwd and from `CARGO_MANIFEST_DIR/..` (so a Finder-launched `.app`, whose cwd is `/`, still finds the project `.env`). `.env` is gitignored.
- **Window chrome:** the `main` window is `transparent` + `decorations: false` (frameless, no native titlebar) + `alwaysOnTop` + `visibleOnAllWorkspaces`. `html/body` are transparent; the background is drawn by the root `.app-shell` via `--app-opacity` alpha (the opacity slider sets `--app-opacity` on `documentElement`). Don't override `.bg-background` globally — shadcn's `DialogContent` uses it and would become translucent. Portaled content (dialog/select/tooltip) needs `body { color: var(--foreground) }` because it renders outside `.app-shell`. Второе окно `preview` (HTML-превью ответов) создаётся на лету командой `show_html_preview`, грузит тот же бандл с `?window=preview` (роутинг в `main.tsx`) и имеет свой минимальный набор прав в `src-tauri/capabilities/preview.json`; контент рендерится в `<iframe sandbox="allow-scripts">` без `allow-same-origin`.
- **Window height is state-driven.** The answer panel is collapsed by default → window starts compact (`COMPACT_HEIGHT` in `App.tsx`), auto-expands to `FULL_HEIGHT` on the first non-empty Claude delta, and shrinks back on manual collapse. Keep the `tauri.conf.json` initial `height` in sync with `COMPACT_HEIGHT`.
- **macOS only.** Capture relies on Core Audio process taps (macOS 14.2+); only `decorations: false` for the main window, `0600` perms, `open(1)` for external links, etc.
