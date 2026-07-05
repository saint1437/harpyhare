# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**itech** — a macOS-only Tauri 2 desktop app. Hold a push-to-talk key → capture **system audio** (e.g. voice from a video) → transcribe via Groq Whisper → edit the text (with pasted screenshots) → stream an answer from the Anthropic API. A single floating, frameless, always-on-top HUD window.

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

# Релиз (бамп версии → подписанная сборка → GitHub-релиз в itech-releases → коммит+тег)
npm run release -- 0.2.0 --notes "Что нового"
```

Design/spec history lives in `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## The Rust ⇄ frontend contract (read this first)

The backend exposes a **fixed set of commands and events**; the frontend mirrors them 1:1. When changing one side, change the other and keep names identical.

- **Commands** are registered in `generate_handler!` in `src-tauri/src/lib.rs`; argument names map snake_case (Rust) → camelCase (JS invoke). The frontend wrappers are in `src/ipc/commands.ts`.
- **Events** are `app.emit("name", payload)` in `lib.rs`; the frontend listens via `src/ipc/events.ts`, typed by `EventMap` in `src/ipc/types.ts` (`state-changed`, `transcript-ready`, `stt-error`, `llm-delta`, `llm-done`, `llm-error`, `update-available`, `update-progress`, `update-done`). LLM-события несут `chatId` (`{ chatId, delta }` / `{ chatId }` / `{ chatId, message }`) — стримы независимы по чатам. `llm-delta` коалесируются на стороне Rust (флашер ~25мс в `send_to_claude`); финальный дрен буфера обязан уйти **до** `llm-done`, иначе фронт потеряет хвост ответа.
- `Settings` (12 fields) is defined identically in `src-tauri/src/settings.rs` and `src/ipc/types.ts`. Глобального системного промпта и модели в Settings нет — вместо них `prompt_presets: {id,name,text}[]` (сид «Расшифровка речи», id `transcription`) и per-chat поля: чат хранит `presetId`, `thinkingEnabled` и `model` (селекты в Composer), текст пресета резолвится на фронте (`lib/presets.presetText`), и всё уходит в `send_to_claude(messages, chat_id, system, thinking, model)` при каждом запросе (Anthropic API stateless). Старые чаты без `presetId` → без препромпта; без `model` → дефолтная opus. `Settings.fast_mode` → `speed:"fast"` + beta-заголовок `fast-mode-2026-02-01`, только для `claude-opus-4-8` (capabilities это не выражают). `Settings.chat_font_size` → CSS-переменная `--chat-font-size` (`applyChatFontSize`), масштабирует текст и код чата.
- **Модели — динамические, не хардкод.** Команда `list_models` (Rust `llm::list_models`, `GET /v1/models`, бесплатный) отдаёт модели аккаунта с выжимкой capabilities (`ModelInfo {id, displayName, adaptive, alwaysThinks}`); кэш в `App.models`, первичный фетч на старте, фронт берёт через `useModels` (фолбэк — `lib/models.FALLBACK_MODELS`). Поле `thinking` собирает `llm::thinking_value` по capabilities: вкл → `adaptive` где поддержан; выкл → явный `{"type":"disabled"}` (на Sonnet 5 «опустить поле» = adaptive!); haiku (adaptive не поддержан) и Fable/Mythos («думают всегда» — единственное исключение по имени, capabilities этого не выражают) → поле не отправляется. Селект thinking в Composer блокируется через `lib/models.thinkingLocked`.

## Frontend architecture (`src/`)

Strict layering — keep each layer's responsibility intact:

- **`src/ipc/`** — the **only** place that imports `@tauri-apps/api`. `commands.ts` (typed `invoke`), `events.ts` (`onEvent`), `types.ts`, `env.ts` (`isTauri`). Every command/event no-ops in the browser so the UI runs without a backend.
- **`src/lib/`** — framework-free pure logic with unit tests: `composer.ts` (attachment limit/downscale, `Attachment` type), `chats.ts` (chat model, `CHAT_LIMIT`, serialize/deserialize), `models.ts` (`ModelInfo`, `FALLBACK_MODELS`, `thinkingLocked`), `hotkey-capture.ts` (`hotkeyFromEvent`, `conflictsWithTyping`), `window-controls.ts` (`moveDelta`/`applyOpacity`/`applyChatFontSize`), `stream-markdown.ts` (`splitStableTail` — деление стрима на стабильный префикс/хвост для мемоизации markdown-парса).
- **`src/hooks/`** — one hook per contract slice (`useClaudeStream`, `useChats`, `useModels`, `useSettings`, `useRecorder`, `useTranscription`, `useWindowControls`, `usePttSuspend`). `useChats` owns the chat list, per-chat drafts/attachments, and disk persistence. Hooks depend on `ipc`, never on `@tauri-apps` directly; tested with `renderHook` + `vi.mock("@/ipc/...")`.
- **`src/components/`** — presentational, built on shadcn/ui primitives in `src/components/ui/` (run `npx shadcn@latest add <name>` to add more). `App.tsx` composes hooks + components.

Stack: React 19 + Vite + Tailwind v4 (CSS-first `@theme` tokens in `src/index.css`, gray + oxblood dark theme, dark-only) + react-markdown + rehype-highlight. Path alias `@` → `src`.

**Подсветка кода:** rehype-highlight в `AnswerPanel` (`REHYPE_PLUGINS`); палитра токенов — в `index.css`. Инвариант: `html` в `plainText` — чип превью (`HtmlBlockChip` через `makePre`) требует, чтобы children код-элемента остались **сырой строкой**; подсветка превратила бы их в массив span'ов и молча сломала чип. Во время стрима markdown-чанки мемоизированы (`MarkdownChunk` + `splitStableTail`) — история и завершённые блоки не перепарсиваются на каждый флаш дельт.

**Browser mock:** `isTauri()` (checks `__TAURI_INTERNALS__`) gates all backend calls; outside Tauri the app renders with demo data, so `vite preview` is the way to visually iterate without building the `.app`.

## Rust backend (`src-tauri/src/`)

`lib.rs` is the glue: `App` state, all `#[tauri::command]`s, event emission, the recording pipeline, and the global-hotkey wiring. The domain modules are pure and unit-tested:

- `audio.rs` — downmix → resample (rubato, 48k→16k) → WAV (hound); RMS silence gate. `StreamResampler` — инкрементальный ресемплинг для стриминга (батчевый `resample_to_16k` идёт через него же — один код-путь); `wav_header_streaming` (размеры 0xFFFFFFFF) + `f32_to_i16le_bytes` для тела стриминговой загрузки.
- `capture.rs` — system-audio capture via **Core Audio process tap** (`cidre`). The risky native piece. RT-колбэк пишет в lock-free ring buffer (`ringbuf`, без мьютексов/аллокаций); поток-консьюмер на лету даунмиксит+ресемплит в 16кГц, копит буфер и отдаёт чанки в опциональный `ChunkSink` (его дроп = EOF для стриминга). `stop()` возвращает готовый 16кГц-моно. Флагом `recording` управляет только консьюмер (протокол `Session` + `stop_requested` исключает гонку «stop до пробуждения консьюмера»). Manual acceptance via `examples/record5s.rs`; живой смоук стриминга в Groq — `examples/stream_smoke.rs`.
- `stt.rs` — `GroqStt` (whisper-large-v3-turbo, `language=ru`), error mapping; `transcribe_stream` — multipart с телом-стримом (chunked, длина неизвестна; Groq это принимает — проверено живым смоуком).
- `llm.rs` — Anthropic request body (image blocks; поле `thinking` готовит `thinking_value` по capabilities модели; prompt-cache брейкпоинты на system и последнем сообщении; пустые сообщения выбрасываются из истории — API отвергает пустой content; `speed:"fast"` при fast_mode+opus-4-8), incremental `SseParser` (use `feed_bytes` for chunked UTF-8), streaming client with cancellation; тела ошибок API пробрасываются в UI (`error.message`, не голый HTTP-код). Диагностика тел запросов против живого API — `examples/llm_smoke.rs`.
- Оба reqwest-клиента (`stt`/`llm`) держат пул «вечно тёплым» (`http2_keep_alive_*`, `pool_idle_timeout(None)`) и имеют `warm_up()`; прогрев зовётся на старте приложения и на нажатии PTT (Anthropic; Groq не греется — стриминговый запрос уходит сразу). Перф-тайминги пишутся в stderr с префиксом `[perf]`.
- **Стриминговая транскрипция.** На нажатии PTT `on_ptt_pressed` открывает запрос к Groq (`App.stt_stream`), тело наполняется 16кГц-чанками через sink капчера; на отпускании `finish_transcribe` ждёт уже идущий запрос («отпустил → текст» ≈ инференс + RTT). Отмена (Esc/тишина/короткая запись) — `cancel_stt_stream`. При переполнении канала sink помечает стрим `broken`; любой сбой стрима (кроме `BadApiKey`) → фолбэк на классический `transcribe` по накопленному буферу — фича деградирует, но не ломает распознавание.
- `state.rs` — recorder FSM (`Idle → Recording → Transcribing → Idle`); min 0.3s / max 10min, Esc cancel.
- `settings.rs` — JSON at `~/Library/Application Support/com.itech.voice/settings.json`, written atomically with `0600`.
- `update.rs` — автообновление через `tauri-plugin-updater`: `check()` (манифест `latest.json` из публичного репо `screenfriskofficial/itech-releases`, endpoint/pubkey в `tauri.conf.json`; `ITECH_UPDATE_ENDPOINT` подменяет endpoint для тестов), `install()` (скачивание подписанного `.app.tar.gz`, minisign-проверка, замена бандла, `app.restart()`), фоновая автопроверка (старт + каждые 6 ч; в debug — только при заданном `ITECH_UPDATE_ENDPOINT`). Найденный `Update` живёт в `App.pending_update` между check и install; повторный install блокирует `App.update_installing`. Прогресс троттлится `progress_step` (по смене целого процента) — как коалесинг `llm-delta`. Ошибка install уходит реджектом команды (отдельного события нет); `Settings.skipped_version` глушит только автобейдж, не ручную проверку. Релиз-пайплайн — `scripts/release.mjs` (ключ подписи `~/.tauri/itech.key`, **бэкапить**; см. README «Релиз»).
- `hotkey.rs` — push-to-talk registration + глобальный toggle-хоткей скрытия/показа окна (`register_toggle` → `on_toggle_visibility`: `hide` ↔ `show`+`set_focus`); `parse_hotkey` is the only unit-tested function here. Обработчики деферятся (`defer`) — инвариант реестра плагина.

## Non-obvious invariants (do not break these)

- **Чаты независимы и параллельны.** Источник истины — фронт (`useChats`: `Chat[]` + `activeId`); Rust хранит чаты как непрозрачную JSON-строку в `chats.json` (атомарно, `0600`, модуль `chats.rs`, команды `load_chats`/`save_chats`). `send_to_claude(messages, chat_id, system, thinking, model)` шлёт всю историю чата; отмена по-чатная через `Mutex<HashMap<chat_id, CancellationToken>>`. Картинки в `chats.json` не сохраняются (стрипаются в `serializeChats`). Лимит — `CHAT_LIMIT = 6`.
- **PTT обязан работать при фокусе в поле промпта.** `usePttSuspend` глушит PTT при фокусе в текстовых полях ТОЛЬКО для хоткеев, конфликтующих с печатью (`conflictsWithTyping`: одиночная буква/цифра, в т.ч. с Shift). F-клавиши и комбинации с Cmd/Ctrl/Alt не глушатся никогда — не возвращай безусловную заглушку.
- **Hotkey handlers must defer all work.** `tauri-plugin-global-shortcut` invokes the handler while holding its registry mutex; doing register/unregister synchronously inside (e.g. registering Esc) is a re-entrant deadlock that hard-freezes the app. `hotkey.rs` wraps handlers in `defer()` (spawns onto the async runtime). The same applies to anything a handler triggers.
- **Window manipulation goes through Rust commands, not JS.** `move_window_by`, `set_window_width`, `close_app`, `hide_main_window` are Rust commands. The JS `getCurrentWindow().setSize()` path silently fails because the window capabilities in `src-tauri/capabilities/default.json` grant `set-position`/`show`/`hide`/`start-dragging` but **not** `set-size`. Add any new window capability there if you must call from JS; otherwise prefer a Rust command. `set_window_width` tweens (ease-out) on a background thread, dispatching each frame via `run_on_main_thread`, with a `resize_gen` generation guard. Перетаскивание окна мышью — `data-tauri-drag-region` на шапке (StatusBar): атрибут действует строго на target события, поэтому кнопки/табы внутри остаются кликабельными. «Светофоры» в шапке: красная — `close_app`, жёлтая — `hide_main_window` (возврат — глобальным toggle-хоткеем).
- **Cmd/Ctrl+стрелки двигают окно через нативный локальный NSEvent-монитор** (`install_move_keys_monitor` в lib.rs), который поглощает keyDown ДО WKWebView — иначе WebKit прячет указатель мыши «до движения мыши» и курсор «пропадает» при уезжающем окне. JS-обработчик в `useWindowControls` эти события в Tauri не получает (остался для браузерного мока).
- **`onEvent` uses a `live` flag** to pair subscribe/unsubscribe across the async `listen` promise — required for React StrictMode double-mount safety. `useClaudeStream` likewise cancels its pending rAF on unmount and gates late deltas after `stop`.
- **API keys: `.env` is a fallback only.** `lib.rs` setup reads `ANTHROPIC_API_KEY`/`GROQ_API_KEY` and applies them via `settings.apply_key_fallback` **only when** the corresponding settings.json field is empty (UI-saved keys win). `.env` is read from cwd and from `CARGO_MANIFEST_DIR/..` (so a Finder-launched `.app`, whose cwd is `/`, still finds the project `.env`). `.env` is gitignored.
- **Window chrome:** the `main` window is `transparent` + `decorations: false` (frameless, no native titlebar) + `alwaysOnTop` + `visibleOnAllWorkspaces`. `html/body` are transparent; the background is drawn by the root `.app-shell` via `--app-opacity` alpha (the opacity slider sets `--app-opacity` on `documentElement`). Don't override `.bg-background` globally — shadcn's `DialogContent` uses it and would become translucent. Portaled content (dialog/select/tooltip) needs `body { color: var(--foreground) }` because it renders outside `.app-shell`. HTML-превью ответов рендерится встроенной панелью `PreviewPanel` (правая колонка того же окна). Контент грузится с отдельного origin `preview://localhost` (кастомная схема `register_uri_scheme_protocol("preview", …)` в `lib.rs`, отдаёт `App.preview_html`, заполняемый командой `set_preview_html`) в `<iframe src sandbox="allow-scripts allow-same-origin">` — `localStorage`/сеть работают, но cross-origin к `tauri://localhost` + отсутствие capability на `preview://` изолируют превью от IPC и ключей. Вне Tauri панель использует `srcDoc`-фолбэк. Открытие расширяет окно вправо командой `set_window_width` (кламп `x` по краю монитора через `window_geom`).
- **Window height is static.** Height is fixed in `tauri.conf.json` and never changed at runtime (no `COMPACT_HEIGHT`/`FULL_HEIGHT` dynamic resizing). The window instead widens rightward via `set_window_width` when the inline preview panel opens.
- **macOS only.** Capture relies on Core Audio process taps (macOS 14.2+); only `decorations: false` for the main window, `0600` perms, `open(1)` for external links, etc.
