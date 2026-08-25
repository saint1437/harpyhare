# 05 — Real-time interaction & state model

All paths relative to the git root `harpyhare/` unless prefixed. `apps/desktop` is abbreviated `AD`.

## Summary

Four orthogonal machines, not one: the 3-state recorder FSM (`state.rs:6`), the auto-mode flag (`auto.rs:29`), the per-chat LLM stream map (`chat.rs:26`), and the capture's **buffering flag** (`capture.rs:79`) — the only always-on capture, with **zero representation in any UI**.
"Is it listening?" is answered entirely by five 2.5 px bars (`EqBars.tsx:11`) that are `aria-hidden` (`:13`), colour-and-motion only, and live inside a window PTT is explicitly designed to be used without (`CLAUDE.md:299`).
Hide the HUD (`window.rs:244`) and there is no signal of any kind — no tray, menu-bar item, notification or overlay exist (`docs/redesign/00-repo-map.md:255`).
`Recording`, `Transcribing` and auto-listening are three states rendered as one animation in two reds (`StatusBar.tsx:60-62`); `prefers-reduced-motion` deletes even that (`index.css:149-155`).
The 4 s ring buffer is on by default (`settings.rs:221`), starts with the HUD (`window.rs:204`), is RAM-only — and its only control lives in the launcher (`SttSection.tsx:108`), reachable only by destroying the HUD.
There is no mute and no pause: `set_ptt_suspended` (`preferences.rs:79`) only unregisters a hotkey, and is inert for the default `Cmd+R`/`Ctrl+R` (`hotkey-capture.ts:91`).
Every transcript (`recording.rs:296-297`) and every screenshot (`screenshot.rs:27`) is silently written to the system clipboard; no UI mentions it.
`cancel_stream` emits nothing (`chat.rs:210-214`), a sub-0.3 s tap emits nothing (`state.rs:36-38`), and `Transcribing` cannot be cancelled at all (`recording.rs:201`).
Best-in-app precedents worth copying: `ScreenShareIndicator` (clickable, mid-call, `aria-pressed`) and the launcher's `AudioCheckCard` (live meter + a sentence).
Deliberate and load-bearing: no HUD raise after a transcript, manual auto-answer, PTT⇄auto exclusion, no autoscroll while streaming.

---

## The lifecycle

### 1. The states that actually exist

**A. Recorder FSM** — `AD/src-tauri/src/state.rs:6-10`, a `Mutex<RecorderState>` in
`App` (`app_state.rs:19`). Exactly three variants, serialised lowercase:

| Variant | Rust | Wire value | Frontend type |
| --- | --- | --- | --- |
| `Idle` | `state.rs:7` | `"idle"` | `RecorderState` (`ipc/types.ts`) |
| `Recording` | `state.rs:8` | `"recording"` | idem |
| `Transcribing` | `state.rs:9` | `"transcribing"` | idem |

Bounds: `MIN_RECORDING_SECS = 0.3` (`state.rs:1`), `MAX_RECORDING_SECS = 600.0` (`state.rs:2`).
Internal (never leave Rust): `Event {PttPressed, PttReleased{duration_secs}, Cancel,
MaxDurationReached, TranscriptionFinished}` (`state.rs:13-19`) and `Action {None, StartCapture,
Transcribe, Discard}` (`state.rs:22-27`).

**B. Auto-mode state** — orthogonal, `AutoState` at `auto.rs:28-34`:
`active: AtomicBool`, `generation: AtomicU64`, `seq: AtomicU32`, `interviewer_in_flight`,
`user_in_flight` (ceiling `MAX_IN_FLIGHT_PER_SPEAKER = 2`, `auto.rs:10`). Only `active` crosses to
the frontend (`auto-mode-changed {active}`, `events.rs:104-106`). The in-flight counters and the
generation are invisible to the UI. `Speaker::{Interviewer, User}` (`auto.rs:22-25`) labels turns.

**C. Background-buffer state** — orthogonal, and **the one with no UI at all**:
`Shared.buffering: AtomicBool` (`capture.rs:79`) + `Shared.rolling: Mutex<audio::RollingBuffer>`
(`capture.rs:88`, type at `audio.rs:60-63`). Set by `AudioCapture::set_buffering`
(`capture.rs:232-240`); switching it **off clears the ring immediately** (`capture.rs:238`).
Capacity `buffer_seconds × 16 000` samples (`audio.rs:65-67`). Writers:
`build_capture` on construction (`app_state.rs:104`), `apply_buffer_settings_change`
(`preferences.rs:177`), `auto::start` → forced `true` on both sources (`auto.rs:192`, `:199`),
`auto::stop` → restored to `settings.buffer_enabled` (`auto.rs:219`), and `audio_check::start_system`
→ forced `false` for the 5 s check (`audio_check.rs:82`), restored at `:86` / `:100`.

**D. LLM stream state** — per chat, `App.llm_cancel: Mutex<HashMap<String, LlmStreamSlot>>`
(`app_state.rs:24`, type `chat.rs:21-26`), keyed by `chatId`, versioned by a global
`LLM_STREAM_EPOCH` (`chat.rs:14`). Frontend mirror: `useClaudeStream` keeps four parallel
`Record<chatId, …>` maps — `partial`, `streaming`, `startedAt`, `error`
(`useClaudeStream.ts:28-31`) plus refs `buffers`/`revealed`/`active` (`:33-35`).
A chat is therefore in one of: *not started* · *streaming, nothing revealed yet* (→
`ThinkingIndicator`) · *streaming, revealing* · *done* · *errored* · *stopped* · *abandoned*.

**E. Sub-states with no name and no event** (they exist, nothing reports them):
`capture == None` (`app_state.rs:20`, never built until the HUD launches — `lib.rs:80` passes
`None`); `capture_rebuild_pending` (`app_state.rs:31`); `AudioCapture::is_stalled`
(`capture.rs:222`); `screenshot_capturing` re-entry guard (`app_state.rs:35`, silently swallows a
second hotkey press at `screenshot.rs:78-80`); `SttStream.broken` (`app_state.rs:41` — the streaming
transcription silently degrades to the buffered upload).

### 2. Transition table

`→FE` = the event the frontend receives. Blank = **nothing is emitted**.

| # | From | Trigger (path:line) | To | →FE |
| --- | --- | --- | --- | --- |
| 1 | *any* | `hotkey::register_ptt` press → `recording::on_ptt_pressed` (`hotkey.rs:24`) | — | — |
| 2 | Idle, auto **active** | `recording.rs:102-105` — refuses | Idle | `stt-error` (`ERR_AUTO_MODE_ACTIVE`, `auto.rs:18`) |
| 3 | Idle, `capture == None` | `recording.rs:110-116` | Idle | `stt-error` (`ERR_NO_CAPTURE`, `recording.rs:18/23`) |
| 4 | Idle | `PttPressed` → `StartCapture` (`state.rs:35`) | **Recording** | `state-changed:"recording"` (`recording.rs:132`) |
| 4a | ↳ side effects | Groq stream opened (`recording.rs:121`, `:137-171`); ring **preroll prepended** (`capture.rs:442-449`); Esc registered globally (`recording.rs:131`); Anthropic warm-up (`recording.rs:134`); watchdog spawned (`recording.rs:133`) | | |
| 5 | Idle | capture `start()` fails (`recording.rs:123-128`) | Idle | `stt-error` only — **no `state-changed`** |
| 6 | Recording | `PttReleased`, `secs < 0.3` → `Discard` (`state.rs:36-38`) | Idle | `state-changed:"idle"` (`recording.rs:221`) — **no error, no explanation** |
| 7 | Recording | `PttReleased`, `secs ≥ 0.3` → `Transcribe` (`state.rs:39`) | **Transcribing** | `state-changed:"transcribing"` (`recording.rs:229`) |
| 8 | Recording | `MaxDurationReached` (600 s) via watchdog (`state.rs:40`, `recording.rs:337-344`) | **Transcribing** | `state-changed:"transcribing"` |
| 9 | Recording | `Cancel` = Escape (`state.rs:41`, `recording.rs:205-214`) | Idle | `state-changed:"idle"` (`recording.rs:212`) |
| 10 | Transcribing | capture stop failed / no buffer (`recording.rs:230-236`) | Idle | `stt-error` + `state-changed:"idle"` (`recording.rs:321-323`) |
| 11 | Transcribing | `audio::is_silence` (`recording.rs:237-240`, threshold `audio.rs:7` = `1e-3`) | Idle | `stt-error` code `silence` + `state-changed:"idle"` |
| 12 | Transcribing | streaming STT ok (`recording.rs:275-278`) → `deliver_transcript` | Idle | **`transcript-ready`** → **`focus-prompt`** (`recording.rs:298-299`) → `state-changed:"idle"` (`:323`) |
| 12a | ↳ | text also written to the **system clipboard** (`recording.rs:296-297`) | | |
| 13 | Transcribing | stream `broken`/failed → fallback `transcribe` (`recording.rs:271-292`) | Idle | same as 12, later |
| 14 | Transcribing | STT error (`recording.rs:310`) | Idle | `stt-error` + `state-changed:"idle"` |
| 15 | Idle | `retry_transcription` command (`recording.rs:353-366`) — **writes the state directly, bypassing `on()`** (`:362`) | Transcribing | `state-changed:"transcribing"` (`:364`) |
| 16 | any | `state.rs:43` catch-all `(s, _) => (s, None)` | unchanged | — (silently ignored) |
| — | | **Auto mode** | | |
| 17 | auto off, recorder ≠ Idle | `auto.rs:163-166` | auto off | `auto-mode-error` (via `on_toggle`, `auto.rs:233`) or command rejection |
| 18 | auto off | `auto::start` ok (`auto.rs:154-208`) | auto **on** | `auto-mode-changed {active:true}` (`auto.rs:206`) |
| 19 | auto off | system capture missing (`auto.rs:167-170`, `:186-191`) | auto off | `auto-mode-error` (code `permission`) |
| 20 | auto off | microphone open fails (`auto.rs:172-178` → `microphone_error` `:75-88`) | auto off | `auto-mode-error` |
| 21 | auto on | segment finalised & non-silent (`auto.rs:99-119`) → `transcribe_segment` (`:122-152`) | auto on | **`auto-turn {speaker, text, seq, atMs}`** (`auto.rs:140`) |
| 22 | auto on | segment STT error (`auto.rs:150`) | auto on | `auto-mode-error` |
| 23 | auto on | queue full (≥2 in flight) (`auto.rs:108-111`) | auto on | — **stderr only**, the turn is dropped silently |
| 24 | auto on | `auto::stop` (`auto.rs:210-225`) | auto off | `auto-mode-changed {active:false}` (`:224`) |
| 25 | auto on | global answer hotkey (`hotkey.rs:80`) | auto on | **`auto-answer`** (empty payload) |
| 26 | auto on | `set_settings` changed mic device (`preferences.rs:70`) → `restart` (`auto.rs:267-275`) | off→on | `auto-mode-changed` ×2 |
| 27 | auto on | `set_settings` changed segmenter bounds → `reapply_bounds` (`auto.rs:240-265`) | auto on | — (speech in flight is dropped silently, `auto.rs:237-239`) |
| — | | **LLM stream** | | |
| 28 | idle chat | `send_to_claude` (`chat.rs:154`) → `register_llm_cancel` (`:163`) | streaming | — (frontend sets `streaming[id]=true` locally, `useClaudeStream.ts:152`) |
| 29 | streaming | flusher tick, 25 ms (`chat.rs:12`, `:94-103`) | streaming | **`llm-delta {chatId, delta}`** (`chat.rs:110`) |
| 30 | streaming | `message_start.usage` (`chat.rs:144-149`) | streaming | **`llm-usage {chatId, inputTokens}`** |
| 31 | streaming | provider returns `Ok`/`Cancelled` (`chat.rs:118`) | done | **`llm-done {chatId}`** — after the final drain (`chat.rs:182`) |
| 32 | streaming | provider error (`chat.rs:119`) | error | **`llm-error {chatId, code, message}`** |
| 33 | streaming | `cancel_stream` (`chat.rs:210-214`) — slot removed | cancelled | **no event at all** — the slot is gone, so `emit_llm_result` short-circuits at `chat.rs:114` |
| 34 | streaming | superseded by a new send on the same chat (`chat.rs:30-32`) | superseded | old epoch's events suppressed (`chat.rs:36`, `:107`) |
| — | | **Windows / misc** | | |
| 35 | launcher | `launch_main_window` → `swap_to_main_window` (`window.rs:193-211`) | HUD | — ; capture built off-thread (`:202-209`), auto mode auto-started if `auto_mode_enabled` |
| 36 | HUD | `stop_main_window` → `swap_to_launcher_window` (`window.rs:213-222`) | launcher | `auto::stop` first (`:214`) → `auto-mode-changed:false` |
| 37 | HUD visible | `hide_main_window` (`window.rs:244`) or toggle hotkey hide branch (`window.rs:155`) | HUD hidden | — **no event** |
| 38 | HUD hidden | toggle hotkey show branch / `focus_prompt` hotkey → `show_and_focus_prompt` (`window.rs:137-143`) | HUD visible | **`focus-prompt`** |
| 39 | any | teleprompter hotkey (`hotkey.rs:58` → `window.rs:176-178`) | — | **`toggle-teleprompter`** (empty) |
| 40 | any | modifier+arrow resize, native interception → `platform::handle_arrow_key` | — | **`resize-key {dim, dir}`** (`events.rs:200-207`) |
| 41 | any | screenshot hotkey (`hotkey.rs:109`) → `on_capture_region` (`screenshot.rs:67`) | — | on no permission: `screenshot-error`; on success: **`screenshot-ready`** (`screenshot.rs:29`) + PNG to clipboard (`:27`); HUD hidden 120 ms then re-shown (`window.rs:19`, `screenshot.rs:85`, `:97-99`) |
| 42 | any | second screenshot while one runs (`screenshot.rs:78-80`) | — | **nothing** — silently dropped |
| 43 | launcher | `check_audio_source` (`audio_check.rs:144`) | — | **`audio-level {level}`** every 100 ms (`audio_check.rs:13`, `:51`) for 5 s (`:12`) |
| 44 | any | updater (`update.rs:104`, first check +5 s, then every 6 h — `update.rs:11-12`) | — | `update-available` / `update-progress` / `update-done` |
| 45 | any | presets refresh every 30 min (`remote_presets.rs:13`) | — | `official-presets-updated` |

### 3. ASCII diagram

```
                     ┌──────────────────────── ORTHOGONAL ───────────────────────┐
                     │                                                           │
  RECORDER FSM (state.rs)                    AUTO MODE (auto.rs)      BUFFERING (capture.rs)
  ══════════════════════════                 ═══════════════════      ═════════════════════
                                                                       buffering: AtomicBool
        ┌──────────────┐                       ┌──────────┐            rolling : RollingBuffer
        │              │                       │  active  │            ┌──────────────────┐
        │    Idle      │◄──────────┐           │  = false │            │  OFF (ring clear)│
        │              │           │           └────┬─────┘            └────────┬─────────┘
        └──┬────────┬──┘           │                │ start_auto_mode /         │ set_buffering(true)
           │        │              │                │ ⌘⇧L / auto_mode_enabled   │ ▲
   PTT down│        │ retry_       │                │ (requires recorder=Idle)  ▼ │ set_buffering(false)
  (⌘R/Ctrl+R)       │ transcription│                ▼                  ┌──────────────────┐
   +auto off        │ recording.rs │           ┌──────────┐            │ ON  ring = last  │
   +capture ok      │   :362       │           │  active  │            │ buffer_seconds s │
           │        │              │           │  = true  │───────────►│  16 kHz mono RAM │
           ▼        │              │           └────┬─────┘  forces    └──────────────────┘
    ┌────────────┐  │              │                │        both srcs   ▲            │
    │            │  │              │  ┌─────────────┼──────────────┐     │            │ snapshot()
    │ Recording  │  │              │  │  segmenter  │  segmenter   │     │            │ prepended
    │            │  │              │  │ (system)    │  (mic)       │     └────────────┘ to a new
    └──┬──┬──┬───┘  │              │  ▼             ▼              │      PTT session (capture.rs:442)
       │  │  │      │              │ auto-turn(seq, speaker, text) │
   Esc │  │  │ ≥0.3s│              │  │  (max 2 in flight/speaker) │
 (glob)│  │  │ or   │              │  ▼                            │
 <0.3s │  │  │ 600s │              │ [frontend] insertTurn ─► pending
       │  │  ▼      │              │        │                      │
       │  │ ┌────────────┐         │        │ instant: 900 ms debounce → planSubmission
       │  │ │Transcribing│         │        │ manual : ⌘⇧⏎ / "Ответить" → planManualSubmission
       │  │ └─────┬──────┘         │        ▼
       │  │       │                └───► dispatchAutoTurn ──┐
       │  │       │  transcript-ready + focus-prompt        │
       ▼  ▼       ▼  (+ clipboard write)                    │
    ┌──────────────┐                                        ▼
    │    Idle      │◄─── stt-error (silence|network|…)   LLM STREAM (per chatId, chat.rs)
    └──────────────┘                                     ══════════════════════════════
                                                          ┌────────┐  send_to_claude
                                                          │  none  │──────────────┐
                                                          └────────┘              ▼
                                                                        ┌───────────────────┐
                                                       llm-usage ◄──────│   streaming       │
                                                       llm-delta ◄──────│  (25 ms flusher)  │
                                                          ┌─────────────┴─────┬─────────────┘
                                                 llm-done │        llm-error  │   cancel_stream
                                                          ▼                   ▼   (NO EVENT)
                                                      ┌───────┐          ┌────────┐
                                                      │ done  │          │ error  │
                                                      └───────┘          └────────┘
```

### 4. Backend states with no distinct UI representation

| Backend state | Where | Why invisible |
| --- | --- | --- |
| **`buffering == true`** (the always-on ring) | `capture.rs:79` | Nothing in `AD/src/components/**` or `App.tsx` mentions the buffer. Only the launcher's `SttSection.tsx:108-116` toggle exists — and only *before* launch. **This is the single biggest gap.** |
| `capture == None` | `app_state.rs:20`, `lib.rs:80` | Surfaces only as an `stt-error` at the *first* PTT press (`recording.rs:110`). Before that the HUD looks identical to a working one. |
| `capture_rebuild_pending` / `is_stalled` | `app_state.rs:31`, `capture.rs:222` | Never emitted. The user's device changed under them; they find out by pressing PTT. |
| `SttStream.broken` (streaming→buffered fallback) | `app_state.rs:41`, `recording.rs:271` | stderr `[perf]` only. Perceived as "transcription took longer this time". |
| Auto-mode `in_flight` saturation (turn dropped) | `auto.rs:108-111` | stderr only. The transcript panel simply misses a sentence. |
| Auto-mode `generation` bump / `reapply_bounds` dropping in-flight speech | `auto.rs:237-265` | No event. |
| `screenshot_capturing` re-entry guard | `screenshot.rs:78-80` | Second hotkey press does nothing, silently. |
| LLM stream **cancelled** by `cancel_stream` | `chat.rs:210-214` | The backend emits nothing; only the frontend's local `stop()` (`useClaudeStream.ts:193-200`) makes the UI change. If the invoke fails, the UI still says "stopped". |
| Superseded LLM epoch | `chat.rs:36`, `:114` | Deliberately silent (correct), but means an abandoned stream leaves no trace. |
| `Idle` reached by **Discard** vs by **success** | `state.rs:36-38` vs `:42` | Both emit `state-changed:"idle"`. A sub-0.3 s tap produces *no* error and *no* transcript — indistinguishable from "it never heard the key". |
| HUD hidden / visible | `window.rs:145-160` | No event; the frontend never knows. Any state change while hidden is unobservable. |
| macOS/Windows content protection actually applied | `window.rs:37-39` | `ScreenShareIndicator` renders `Settings.screen_share_visible`, not a queried truth. On Windows < 10 2004 it lies (`CLAUDE.md:337`). |

### 5. UI states with no backing backend state

| UI state | Where | Note |
| --- | --- | --- |
| `ConnectivityOverlay` "offline" | `App.tsx:883`, `useConnectivity.ts:11-49` | Derived from `navigator.onLine` + a `probe_connectivity` poll + any `isNetworkError`. Not a backend state; the backend has no "offline" concept. |
| `ThinkingIndicator` (streaming, nothing revealed) | `AnswerPanel.tsx:384-386` | Purely a frontend artefact of `partial === ""`. Its elapsed-seconds counter is client-side (`ThinkingIndicator.tsx:15-29`). |
| `showRetry` | `App.tsx:163`, `Composer.tsx:370-380` | Frontend-only, derived from `isRetryable(err)`. |
| Reveal lag (rAF) | `useClaudeStream.ts:63-90`, `stream-reveal.ts` | The text on screen trails the buffer by up to ~100 ms; the backend has already sent it. |
| `pending` auto turns / `submittedThroughSeq` | `useAutoMode.ts:32`, `auto-turns.ts:3` | Entirely frontend. The backend does not know what has been sent. |
| Teleprompter open / preview open | `App.tsx:563`, `:202` | Frontend-only (except `set_preview_html`). |
| Launcher "Слушаю…" | `AudioCheckCard.tsx:13` | Real (backed by `check_audio_source`), but it is the **only** place the word "listening" appears with a live level meter — and it exists in the window that is destroyed before any listening actually happens. |

---

## How the UI reflects state today

Legend: **C** = colour-only · **M** = motion · **T** = text · **I** = icon · **A11y** = announced.

| Component | States it renders | Colour | Motion | Text | Icon | A11y | Needs window visible? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **`StatusBar.tsx`** (`:66-108`) | recorder ×3, autoListening, error, contextUsage, update | yes | via `EqBars` | error text only (`:92-97`, `text-destructive`, truncated) | Minus / Square / action cluster | **no `aria-live` on the error span**; `EqBars` is `aria-hidden` | **yes** |
| **`EqBars.tsx`** (`:11-26`) | `recording` → `bg-recording`+`eq-bar`; `transcribing` → `bg-primary`+`eq-bar`; `autoListening` → `bg-recording`+`eq-bar`; idle → static `bg-muted-foreground/50`; idle+error → static `bg-destructive` (mapping at `StatusBar.tsx:55-64`) | **only** | `eq` 1.1 s (`index.css:320-333`), staggered 0.12 s (`EqBars.tsx:4`) | **none** | **none** (5 bars, 2.5 px wide, 8–17 px tall — `EqBars.tsx:3`) | **`aria-hidden` — `EqBars.tsx:13`** | **yes** |
| **`ThinkingIndicator.tsx`** (`:31-43`) | LLM streaming with nothing revealed yet | shimmer gradient | `thinking-shimmer` 2 s (`index.css:335-347`) | "Думает…" + elapsed `12с` / `1м 4с` | none | `aria-live="polite"` on the label (`:36`); the timer is `aria-hidden` (`:39`) | **yes** |
| **`AutoModeIndicator.tsx`** (`:17-32`) | auto on/off | `text-recording` when on (`:9`) | none | **title/tooltip only** | `Ear` / `EarOff` (`:29`) | `aria-label` + `aria-pressed` (`:24-25`) — good | **yes** |
| **`AutoTranscript.tsx`** (`:29-92`) | turns, submitted vs pending (muted vs foreground, `:80`), pending count, instant-mode hint | yes | none (auto-scrolls the list, `:40-43`) | "Слушаю — реплики появятся здесь." (`:11`), "Не отправлено реплик: N." (`:17`), "Отвечаю на реплики собеседника сама." (`:12`) | `CornerDownLeft` on the Ответить button | `aria-label={TITLE}` on the `<section>` (`:55`); **no `aria-live`** — new turns are not announced | **yes**; only mounted while `autoMode.active` (`App.tsx:824`) |
| **`Composer.tsx`** | streaming → destructive Square "Остановить ответ" (`:381-390`); idle → ArrowUp "Отправить (⏎)" (`:392-399`); `showRetry` → RotateCcw (`:370-380`); clear-history disabled while streaming (`:330`) | yes | none | tooltips only | yes | `aria-label` on every button | **yes** |
| **`AnswerPanel.tsx`** | history, `partial` stream, `ThinkingIndicator`, "↓ Вниз" jump chip (`:316-329`), empty state (`:278-289`) | — | reveal is per-frame text growth (`useClaudeStream.ts:89`) | yes | `MessagesSquare` empty state | none on the stream itself | **yes** |
| **`ScreenShareIndicator.tsx`** (`:15-29`) | `screen_share_visible` | `text-primary` when *visible* (`:8`) | none | tooltip only | `Eye` / `EyeOff` | `aria-label` + `aria-pressed` — good | **yes** |
| **`ConnectivityOverlay.tsx`** (`:6-18`) | offline | opaque `bg-background` full cover | `animate-spin` loader | "Ожидается подключение к интернету" + hint | `LoaderCircle` | **no `role="alert"`/`aria-live`** | **yes** |
| **`AudioCheckCard.tsx`** (launcher, `:69-103`) | idle / running / result / error, live peak | `bg-primary` fill | width transition on the meter | "Проверить" → "Слушаю…" (`:12-13`), then "Расслышала: «…»" / "Тишина — звук не дошёл…" (`:15-17`) | `AudioLines` / `Mic` | `LevelMeter` is `aria-hidden` (`:60`); the button text carries the state | **yes** (launcher window) |

### "Is it listening right now?" — every ambiguous case

1. **HUD hidden (`hide_main_window`, `window.rs:244`; toggle hotkey `⌘⇧H`).** PTT, auto mode, the
   ring buffer and the screenshot hotkey all keep working (the global shortcuts are registered
   window-lifetime, not visibility-lifetime — `window.rs:105-125`). **There is zero feedback of any
   kind.** No tray icon, no menu-bar item, no notification, no OS badge (`docs/redesign/00-repo-map.md:255`: "Tray /
   autostart / single-instance / notifications — none of these exist"). The only external tell is
   the macOS orange microphone dot — and that appears **only in auto mode** (mic), never for the
   system-audio tap or the ring buffer.
2. **PTT used from another app — the designed case.** `deliver_transcript` deliberately does **not**
   raise the window (`recording.rs:295-301`, rationale `CLAUDE.md:299`). So during the hold, during
   transcription, and at delivery, a user focused on Zoom sees **nothing**: the eq bars are behind
   another window. The only perceptible signal is that the transcript lands in the clipboard
   (`recording.rs:297`) — undiscoverable.
3. **Recording vs Transcribing.** Same five bars, same animation; the only difference is
   `bg-recording` vs `bg-primary` (`StatusBar.tsx:60-61`). Two oklch reds that differ by 0.15 L and
   0 hue-family. At 2.5 px wide this is not a distinction.
4. **Auto-listening vs PTT recording.** Both render `bg-recording` + animated
   (`StatusBar.tsx:60` and `:62`). The *only* disambiguator is the `Ear` icon four elements away in
   the action cluster and the transcript panel below the answers.
5. **The ring buffer.** On by default (`settings.rs:221`), 4 s deep (`settings.rs:108`), running from
   the moment the HUD launches (`window.rs:204` → `ensure_capture` → `build_capture` →
   `set_buffering(true)`, `app_state.rs:104`). **Idle bars are `bg-muted-foreground/50` and static
   — the exact same rendering as a completely deaf app.**
6. **Sub-0.3 s tap.** `Discard` (`state.rs:36-38`) → `state-changed:"idle"` and nothing else. The
   user pressed the key, the app heard nothing, and says nothing.
7. **`prefers-reduced-motion`.** `index.css:149-155` kills `.eq-bar` and `.thinking-shimmer`
   outright. With that OS setting on, "recording" and "idle" become **colour-only, 2.5 px, static**
   — and "thinking" loses its only animation while keeping its text.
8. **Screen readers.** `EqBars` is `aria-hidden` (`EqBars.tsx:13`); `state-changed` is never
   announced anywhere. `ThinkingIndicator` is the *only* polite live region in the HUD
   (`ThinkingIndicator.tsx:36`).
9. **Screenshot.** The HUD is hidden for the capture and re-shown afterwards
   (`screenshot.rs:85`, `:97-99`) — a window that was *deliberately hidden* by the user is
   **un-hidden** by a successful screenshot (`restore = true` at `screenshot.rs:90`).

---

## Latency profile

| Wait | Constant / mechanism | path:line | Value | Visible feedback? |
| --- | --- | --- | --- | --- |
| PTT hold itself | user-controlled; floor `MIN_RECORDING_SECS`, ceiling `MAX_RECORDING_SECS` | `state.rs:1-2` | 0.3 s … 600 s | eq bars **only if the HUD is visible** |
| Recording-length watchdog poll | `MAX_DURATION_WATCHDOG_INTERVAL` | `recording.rs:34` | 1 s | none — the 10-min cut-off arrives unannounced |
| Capture build (first PTT / HUD launch) | `AudioCapture::new` → backend `open` + `start` | `window.rs:202-209`, `app_state.rs:96` | macOS: fast; **Windows: up to 5 s** | **none** — `spawn_blocking`, no event; the launcher's Launch button already returned |
| Windows WASAPI thread readiness | `START_TIMEOUT` | `capture/windows.rs:30`, used `:321` | **5 s** | **none** |
| Windows device re-open after invalidation | `REOPEN_DELAY` | `capture/windows.rs:31` | 1 s, retried | **none** (stderr) |
| Windows loopback poll interval | `MIN/MAX_POLL_INTERVAL` | `capture/windows.rs:32-33` | 2–20 ms | n/a |
| Consumer drain on stop | `STOP_WAIT_TIMEOUT` | `capture.rs:27` | 5 s cap | none |
| Ring-buffer preroll prepended to a PTT recording | `RollingBuffer::snapshot` | `capture.rs:442-449` | `buffer_seconds` = **4 s** default (`settings.rs:108`) | **none** — the user does not know 4 s of prior audio just went to Groq |
| Groq **streaming** transcription: release → text | request opened at press (`recording.rs:121`), awaited at release | `recording.rs:275` | ≈ inference + RTT | eq bars `bg-primary` (colour change only) |
| Groq **buffered fallback**: full WAV upload after release | `transcribe_and_emit` | `recording.rs:303-312` | upload + inference (whole recording) | **identical** to the streaming path — the degradation is invisible |
| Groq request timeouts | `DEFAULT_REQUEST_TIMEOUT` / `STREAM_REQUEST_TIMEOUT` / `CONNECT_TIMEOUT` | `stt.rs:16-19` | 60 s / **11 min** / 10 s | none |
| LLM delta coalescing | `LLM_DELTA_FLUSH_INTERVAL` | `chat.rs:12` | **25 ms** | n/a (below perception) |
| LLM connect / read timeouts | `CONNECT_TIMEOUT` / `DEFAULT_READ_TIMEOUT` | `llm.rs:35-36` | 10 s / 60 s | `ThinkingIndicator` counts up |
| rAF stream reveal | `REVEAL_MIN_CHARS_PER_SECOND = 100`, `REVEAL_BACKLOG_FRACTION_PER_SECOND = 10` | `stream-reveal.ts:5-6`, applied `useClaudeStream.ts:74` | steady-state display lag ≈ **100 ms** (backlog stabilises at 1/10 s); floor 100 chars/s | the text itself |
| Reveal catch-up on done/stop | full buffer committed, not the revealed slice | `useClaudeStream.ts:111-113` | instant | deliberate snap |
| `count_tokens` projection | react-query keyed on `model+options+system+messagesKey`, `enabled: !streaming` | `App.tsx:281-301`, key at `:282`, staleTime `:279` = **10 min** | one network round-trip per history change | **none**; the gauge just changes. **Note: CLAUDE.md's "400 ms debounce" no longer exists in the code** — there is no debounce, only the query key + `staleTime` |
| Auto-mode instant submission debounce | `SUBMIT_DEBOUNCE_MS` | `useAutoMode.ts:15` | **900 ms** | none — the pending turns stay `text-foreground` and then vanish |
| Auto-mode endpointing | `auto_silence_ms` / `auto_min_utterance_ms` / `auto_max_utterance_secs` | `settings.rs:109-111` | **700 ms** / 400 ms / 30 s (defaults) | none — no "hearing you now" state |
| Resize tween | `RESIZE_TWEEN_STEPS` × `RESIZE_TWEEN_FRAME_INTERVAL` | `window.rs:21-22` | 14 × 13 ms = **182 ms** + final frame | the animation is the feedback |
| Programmatic-resize guard | `PROGRAMMATIC_RESIZE_GUARD_MS` | `App.tsx:227` | 600 ms | n/a |
| Connectivity probe retry | `PROBE_INTERVAL_MS` | `useConnectivity.ts:4` | **4 s** while offline | the overlay's spinner (indeterminate) |
| Screenshot: HUD hide settle | `SCREEN_CAPTURE_HIDE_SETTLE` | `window.rs:19` | **120 ms** | the window vanishing |
| Launcher audio check | `CHECK_SECS` / `LEVEL_INTERVAL` | `audio_check.rs:12-13` | **5 s** / level every 100 ms | **the best feedback in the app**: live meter + button label |
| Settings persistence debounce (opacity, window size) | `OPACITY_PERSIST_DEBOUNCE_MS`, `WINDOW_SIZE_PERSIST_DEBOUNCE_MS` | `useSettings.ts:9-10` | 400 ms each | none |
| Chats persistence debounce | `SAVE_DEBOUNCE_MS` | `useChats.ts:43` | 500 ms | none |
| Updater | `AUTO_CHECK_INITIAL_DELAY` / `AUTO_CHECK_INTERVAL` | `update.rs:11-12` | 5 s / 6 h | badge in `StatusBar` |
| Presets refresh | `REFRESH_INTERVAL` / `FETCH_TIMEOUT` | `remote_presets.rs:12-13` | 30 min / 10 s | none |

**Waits with no visible feedback at all:** capture construction (incl. the Windows 5 s), capture
stall + rebuild, the streaming→buffered STT fallback, the 900 ms auto-mode debounce, the 4 s ring
preroll, the auto-mode endpointing pause, `count_tokens`, the sub-0.3 s discard, and every
settings/chats persistence write.

---

## Delivery and dismissal

| Surface | Opens | Closes | Interruptible? | Stop/cancel path | Is "it stopped" legible? |
| --- | --- | --- | --- | --- | --- |
| **`AnswerPanel`** (in-HUD answer) | always mounted (`App.tsx:808`); content appears as `llm-delta` reveals | never closes; cleared by "Очистить историю" (`Composer.tsx:331`) or per-message delete | **yes** | `Composer` Square → `stream.stop(activeId)` (`App.tsx:844-846`) → `useClaudeStream.ts:193-200`: removes from `active`, invokes `cancel_stream` (`chat.rs:210`), commits the buffer to history | **Partially.** The button flips back to ArrowUp and the shimmer stops — but the backend emits **no** confirmation (`chat.rs:114` short-circuits because the slot was removed). If the invoke fails the UI still claims it stopped. The partial answer is **kept** (`useClaudeStream.ts:197`, `commitEvenIfEmpty=false`) — deliberate. |
| **Barge-in (auto mode)** | a fresh interviewer turn while streaming | — | yes | `planDispatch` (`auto-turns.ts:74-77`) → `stream.abandon` (`App.tsx:362`, `useClaudeStream.ts:208-218`) — **drops** the half-answer instead of keeping it (rationale `useClaudeStream.ts:202-205`) | the half-answer simply disappears; nothing says why |
| **`Teleprompter`** (`Teleprompter.tsx:28`) | `toggle-teleprompter` event from the global `⌘⇧T` hotkey (`hotkey.rs:58` → `window.rs:176`), or the `ScrollText` header button (`App.tsx:799-801`) | `closeCombo` default **Escape** (`hotkeys.rs:302`, matched at `Teleprompter.tsx:105-107`), or the X button (`:175`) | pause = `pauseCombo` default **Space** (`hotkeys.rs:311`, `:108-111`), or the Pause button | `onClose` → `setTeleprompterOpen(false)` (`App.tsx:877`); position/speed/font persisted in the unmount cleanup (`Teleprompter.tsx:85-89`) | yes — the overlay disappears; the prompt caret is restored by `usePromptFocus` (`App.tsx:656-657`) |
| **`PreviewPanel`** (`PreviewPanel.tsx:76`) | `HtmlBlockChip` click → `togglePreview` (`App.tsx:816`), or automatically on `llm-done` when `auto_preview_html` (`App.tsx:620-623`) | X button only (`PreviewPanel.tsx:51-53`) | n/a | `closePreview` (`App.tsx:220-222`) → window narrows via `useWindowFrameSync` (`App.tsx:237-244`) | yes — the window tweens back (182 ms). **There is no Escape binding for it** (only `ContextLibraryPanel.tsx:286` and `LauncherSearch.tsx:90` bind Escape in the frontend). |
| **`QuickActionsBar`** (`QuickActionsBar.tsx:45`) | always above the composer when actions exist | n/a | disabled while streaming (`Composer.tsx:558`) | the modifier+digit hotkey path is gated by `promptCoveredByOverlay` (`App.tsx:682`) | the buttons grey out |
| **`AutoTranscript`** (`AutoTranscript.tsx:29`) | mounted iff `autoMode.active` (`App.tsx:824`) | unmounts when auto mode stops; turns are cleared on `auto-mode-changed:false` (`useAutoMode.ts:92-95`) | n/a | "Ответить" → `planManualSubmission` (`auto-turns.ts:99-104`); `⌘⇧⏎` → the same via the `auto-answer` event (`useAutoMode.ts:85`) | sent turns go `text-muted-foreground` (`AutoTranscript.tsx:80`) and the hint switches to "Всё услышанное уже ушло в чат." (`:14`) — **this is the best "did it work" affordance in the whole app** |
| **PTT recording** | hold the record hotkey | release, Escape, 600 s watchdog | yes | Escape is registered **globally** only while recording (`recording.rs:131`, unregistered `:201`/`:211`/`:343`) | `state-changed:"idle"` → bars go static. **Not cancellable during `Transcribing`** — Escape is already unregistered by then. |
| **`usePttSuspend`** (`usePttSuspend.ts:16-34`) | on `focusin` of any `textarea, input, [contenteditable]` | on `focusout`, and on unmount (`:31`) | — | `set_ptt_suspended(true)` → `hotkey::unregister_ptt` (`preferences.rs:85`) | **invisible, and usually inert**: the whole effect is gated on `conflictsWithTyping(hotkey)` (`:18`), which returns `false` whenever the combo has Cmd/Ctrl/Alt (`hotkey-capture.ts:91` + `:18-27`). With the default `Cmd+R`/`Ctrl+R` this hook **never fires**. |
| **`ConnectivityOverlay`** | `useConnectivity.offline` (`App.tsx:883`) | automatically when a probe succeeds (4 s poll) | n/a | none — it is modal and unskippable; it also `blur()`s the prompt (`App.tsx:656`, `usePromptFocus.ts:18`) | the overlay vanishes; the caret returns |

---

## Privacy affordances

### What is captured, and exactly when

| Surface | Runs when | Where it lives | Cleared | Disk? |
| --- | --- | --- | --- | --- |
| **System-audio ring buffer** (the only always-on capture) | from the moment the HUD is created: `swap_to_main_window` → `ensure_capture` (`window.rs:204`) → `build_capture` → `set_buffering(settings.buffer_enabled)` (`app_state.rs:104`). Default **on** (`settings.rs:221`). Also force-enabled by auto mode regardless of the setting (`auto.rs:192`, `:199`) | `Shared.rolling: Mutex<audio::RollingBuffer>` inside `capture::Shared` (`capture.rs:88`) — a `VecDeque<f32>` of 16 kHz mono (`audio.rs:60-63`), capacity `buffer_seconds × 16000` (`audio.rs:65-67`), default **4 s**, max 10 s (`settings.rs:108`) | on `set_buffering(false)` (`capture.rs:238`), on consumer exit (`capture.rs:503`, `:519`), on resampler failure (`capture.rs:522`), on capture rebuild (a new `AudioCapture` = a new ring) | **never** |
| **Ring → PTT preroll** | every PTT press: `take_pending_session` prepends `rolling.snapshot()` to the session output **and pushes it into the Groq stream sink** (`capture.rs:442-449`) | in the recording buffer + uploaded to Groq | with the recording | no |
| **PTT recording** | `Idle → Recording` (`state.rs:35`), i.e. while the global record hotkey is held (default `⌘R`/`Ctrl+R`, `hotkeys.rs:167`) | streamed to Groq live (`recording.rs:137-171`); the finished 16 kHz mono is kept in `App.last_recording` (`recording.rs:241`) **for the retry button, indefinitely, until the next recording** | overwritten on the next successful recording; never explicitly cleared | no |
| **Microphone** | **only** in auto mode: `build_mic_capture` at `auto.rs:172`, stored `auto.rs:204`, dropped at `auto.rs:221`. Also for the launcher's 5 s microphone check (`audio_check.rs:104-120`) | `App.mic_capture` (`app_state.rs:21`) | on `auto::stop` (`auto.rs:221`) — `Drop` shuts the consumer thread (`capture.rs:259-267`) | no |
| **Auto-mode segments** | continuously while auto mode is on: `SpeechSegmenter` over both sources (`auto.rs:193`, `:200`), one Groq request per finalised utterance (`auto.rs:131`) | transient `Vec<f32>` per segment | after transcription | no |
| **Screenshot** | only on the explicit hotkey (`⌘⇧A`, `hotkeys.rs:212`) or the Crop button (`Composer.tsx:356`) | PNG → base64 → `screenshot-ready` → draft attachment | with the draft | **the attachment is persisted**: `save_chat_image` into `images/` (`app_state.rs:61`) once sent |
| **Clipboard (not opt-in)** | every successful transcript (`recording.rs:296-297`, `app.clipboard().write_text`) and every successful screenshot (`screenshot.rs:27` → `clipboard::write_png`) | the **system clipboard** | never — it persists past app exit and is readable by every other app | effectively yes (OS-managed) |
| **Chats + images** | after every message | `chats.json` + `images/` under the app data dir (`app_state.rs:52`, `:60`) | manual delete only | **yes** |

`AUDIO_REQUIRES_PERMISSION = cfg!(target_os = "macos")` (`permissions.rs:31`) — on Windows the
system-audio loopback needs **no consent and produces no OS indicator whatsoever**.

### The user's controls

| Control | Exists? | Where | Reality |
| --- | --- | --- | --- |
| Mute | **no** | — | nothing stops audio reaching the ring without changing a setting |
| Pause | **no** | — | see `set_ptt_suspended` below |
| `set_ptt_suspended` | yes, as a command (`preferences.rs:79-89`) | called only by `usePttSuspend` (`usePttSuspend.ts:20`, `:23`, `:25`, `:31`) | It **unregisters/re-registers the PTT global shortcut** so a bare-letter hotkey does not fire while you type. It does **not** touch capture, does not stop the ring buffer, does not affect auto mode, and is **entirely disabled for the default `Cmd+R`/`Ctrl+R`** (`hotkey-capture.ts:84-93`). It is not a privacy control and is not presented as one. |
| Buffer toggle | yes | `SttSection.tsx:108-116` ("Фоновый буфер", hint: "Подхватывает сказанное за секунды до нажатия записи.") | **Launcher-only.** Reaching it from a live session requires `stop_main_window`, which destroys the HUD (`window.rs:218`). Turning it off does *not* stop it while auto mode holds the stream (`preferences.rs:177`). |
| Buffer depth | yes | `SttSection.tsx:117-130` | 4–10 s slider |
| Auto-mode toggle | yes, three ways | header `AutoModeIndicator` (`App.tsx:461-465`), global `⌘⇧L` (`hotkeys.rs:176`), launcher "Включать при запуске" (`AutoModeSection.tsx:60-71`) | good coverage |
| Manual-answer default | yes | `auto_reply_instant` default `false` (`settings.rs:224`) | deliberate — see Must preserve |
| Always-on listening indicator | **no** | — | the only candidate is `EqBars`, which renders *idle* identically whether the buffer is on or off |
| Kill switch | **no** | `close_app` exists (`window.rs:238`) but "the frontend never calls it" (`CLAUDE.md:312`) | the only real stop is Stop → launcher (`stop_main_window`), which also stops auto mode (`window.rs:214`) |
| `screen_share_visible` | yes, **two** places | `Settings.screen_share_visible` default `false` (`settings.rs:209`) → `set_content_protected(!visible)` on every window (`window.rs:37-45`), applied on change at `preferences.rs:150-152`; UI: `ScreenShareIndicator` in the HUD header (`App.tsx:466`) and the **first row** of the Behaviour tab (`BehaviorSection.tsx:25-36`) | This is the one privacy control that is done properly: reachable mid-call, clickable, `aria-pressed`, and loud (`primary`) in the dangerous direction. Honest limit: on Windows < 10 2004 `set_content_protected` silently no-ops and the indicator lies (`CLAUDE.md:337`). |

### Can the user tell, from outside the app, that the buffer is running?

**No.** Concretely:
- No tray icon, no menu-bar extra, no notification, no autostart entry (`docs/redesign/00-repo-map.md:255`).
- The process is deliberately named "Audio System" / `com.audioservice.helper` (`tauri.conf.json`),
  so even Activity Monitor does not name the product.
- macOS shows the orange **microphone** indicator only while auto mode holds `mic_capture` — the
  Core Audio process **tap** used for system audio does not raise it, and neither does the ring
  buffer.
- Windows raises nothing at all for WASAPI loopback.
- `contentProtected` hides the window's pixels but not its existence (`CLAUDE.md:337`).

### The gap, plainly

**The app continuously records the last 4 seconds of everything your computer plays, into RAM, from
the moment the HUD opens, by default, and the HUD contains no element that says so.** The eq bars
in the idle state look exactly the same whether `buffer_enabled` is true or false. In auto mode the
app additionally holds your **microphone** open continuously and sends every utterance from both
sides to Groq — and the only sign, if the window is hidden or another app is focused, is the macOS
orange dot (nothing on Windows). Every finished transcript is silently placed on the system
clipboard, which no UI mentions. The single control that would let a user stop the always-on
buffer lives in the launcher — a window that must be *reached by destroying the HUD*. The UI admits
to exactly two things: "auto mode is on" (an `Ear` icon) and "the window is/isn't visible during
screen sharing" (an `Eye` icon). It admits to nothing about the ring buffer, nothing about the
clipboard, and nothing about listening while hidden.

---

## Must preserve

| Behaviour | path:line | Why (from CLAUDE.md where stated) |
| --- | --- | --- |
| **The HUD is NOT raised after a transcript** — `deliver_transcript` emits `focus-prompt` bare, bypassing `show_and_focus_prompt` | `recording.rs:295-301`; rationale `CLAUDE.md:299` | "PTT is designed to work while the user is in ANOTHER application, and yanking the HUD forward after every recording would break exactly the scenario the hotkey was made global for." |
| **Auto mode answers manually by default** (`auto_reply_instant = false`) | `settings.rs:224`; `useAutoMode.ts:78`; `auto-turns.ts:99-104` | `CLAUDE.md:245`: "the product's stance, not a timid default" — an automatic answer "spends tokens on every stray sentence the tap picks up, and interrupts the answer you are currently reading aloud" (`CLAUDE.md:245`). |
| **Two different plan functions, not a flag** — `planSubmission` (newest unsent must be the interviewer's) vs `planManualSubmission` (sends everything unsent) | `auto-turns.ts:87-104`; `CLAUDE.md:245` | "otherwise the button would go dead exactly where it is pressed most, right after your own sentence." |
| **Auto mode and PTT are mutually exclusive** | `recording.rs:102-105` (PTT refuses) + `auto.rs:163-166` (`start` requires `Idle`) ; `CLAUDE.md:241` | "Otherwise the same system audio would go into two transcriptions — exactly the 'duplicate' the feature is supposed to avoid." |
| **No autoscroll during streaming** — only chat switch, own message, and the ↓ button scroll | `AnswerPanel.tsx:407-421` (`useLayoutEffect` for chat switch, `:415` for a user tail, `:419-421` only `syncJump`) ; `CLAUDE.md:158` | "stick-to-bottom was irritating — the scroll 'ran away'." |
| **Scroll-to-bottom on chat switch is `useLayoutEffect`, pre-paint** | `AnswerPanel.tsx:407-409` ; `CLAUDE.md:157` | otherwise "a visible 'flight from top to bottom'." |
| **Deltas coalesce in Rust (25 ms), reveal smoothly on the frontend; the final drain precedes `llm-done`** | `chat.rs:12`, `:182` before `:184`; `CLAUDE.md:99` | "otherwise the frontend loses the tail of the answer." |
| **On done/stop/error the FULL buffer goes into history, not the revealed part** | `useClaudeStream.ts:111-113`; `CLAUDE.md:99` | "the instant catch-up of the tail at the end is deliberate." |
| **Stop keeps the partial answer; barge-in drops it** | `useClaudeStream.ts:197` (`commitEvenIfEmpty=false`, buffer kept) vs `:208-218` (`dropPartial`) | comment at `useClaudeStream.ts:202-205`: leaving a stale half-answer "would put a reply to a stale question into both the visible history and the next request's context." |
| **The `ScreenShareIndicator` is clickable, not decoration** | `ScreenShareIndicator.tsx:15-29`, wired `App.tsx:466`/`:757-763` | "noticing mid-call that 'I am visible', you would physically be unable to fix it without a clickable indicator" (`CLAUDE.md:337`). |
| **The turn cursor advances only on an accepted submission** — a busy chat does not lose the turn | `useAutoMode.ts:59-60`; `App.tsx:359` returns `false` ; `CLAUDE.md:248` | "the turn is then not counted as sent and ships with the next window instead of being lost." |
| **Turn order follows `seq`, not arrival time** | `auto.rs:113` (seq issued synchronously before spawn), `auto-turns.ts:30-35` (`insertTurn`) ; `CLAUDE.md:244` | the tap and the mic run on different clocks — "matching them up by time would be a lie." |
| **`auto_mode_enabled` is a launch preference, not a live mirror** — the header toggle and the hotkey never persist it | `auto.rs:206`/`:224` emit only; `AutoModeSection.tsx:66` writes the setting ; `CLAUDE.md:250` | "Otherwise every press would write `settings.json`." |
| **`auto::start` opens the microphone exactly once and judges access by the failure** | `auto.rs:70-88`, `:172-178` | a pre-check made the real open the second in a row and Core Audio answered `kAudioHardwareIllegalOperationError`. |
| **Escape (cancel recording) is registered only while recording** | `recording.rs:131` / `:201` / `:211` / `:343`; scope `HotkeyScope::Recording` (`hotkeys.rs:184`) | a permanently-registered global Escape would swallow Escape system-wide. |
| **Buffer off ⇒ ring cleared immediately; never written to disk** | `capture.rs:238`, `audio.rs:95-97` | the product's core privacy claim. |
| **Auto mode force-enables buffering and `apply_buffer_settings_change` may not switch it off while auto mode is alive** | `auto.rs:192`/`:199`, `preferences.rs:174-178` ; `CLAUDE.md:239` | "otherwise segmentation would die silently." |
| **`dispatchAutoTurn` never touches the draft** | `App.tsx:365` → `appendAutoTurnMessage` ; `CLAUDE.md:249` | auto-mode text never appeared in the input field, so it has nothing there to erase. |
| **The window height changes only by the user; UI logic never touches it** | `App.tsx:240` (`height: windowHeight` verbatim) | stated at `CLAUDE.md:361`. |
| **`prefers-reduced-motion` already silences `.eq-bar` / `.thinking-shimmer` / `.launcher-rise`** | `index.css:149-155`; `CLAUDE.md:426` | any new keyframes must join that block — but see P0-3: today this *removes* the only listening cue. |

---

## Problems

### P0 — blocks "the user must never wonder whether it is listening or what it is doing"

- **P0-1 · The always-on ring buffer has no representation anywhere in the HUD.**
  `buffer_enabled` defaults to `true` (`settings.rs:221`), the ring starts with the HUD
  (`window.rs:204` → `app_state.rs:104`), and `EqBars` renders idle-with-buffer identically to
  idle-without-buffer (`StatusBar.tsx:63`). The only control is in the launcher
  (`SttSection.tsx:108`), unreachable without destroying the HUD.
- **P0-2 · Nothing is perceptible while the HUD is hidden or another app is focused** — which is
  the *designed* PTT scenario (`CLAUDE.md:299`). `hide_main_window` (`window.rs:244`) leaves no
  tray, no menu-bar item, no notification, no overlay. Recording, transcribing, auto-listening and
  the ring buffer all continue with zero feedback.
- **P0-3 · The single listening indicator is `aria-hidden`, colour-only, 2.5 px wide, and is
  deleted by `prefers-reduced-motion`.** `EqBars.tsx:13` (`aria-hidden`), `:17` (2.5 px bars),
  `index.css:149-155` (animation removed). With reduced motion on, "recording" and "idle" differ
  only by a red vs a grey tint on five hairlines.
- **P0-4 · `Recording`, `Transcribing` and auto-listening are three states rendered as one
  animation in two colours.** `StatusBar.tsx:60-62`. No text, no icon, no distinct shape.
- **P0-5 · There is no mute and no pause.** `set_ptt_suspended` (`preferences.rs:79`) only
  unregisters a hotkey, and is inert for the default combo (`hotkey-capture.ts:91`). A user who
  wants to stop being heard has exactly one option: press Stop and lose the HUD.

### P1

- **P1-1 · Every transcript and every screenshot is silently written to the system clipboard**
  (`recording.rs:296-297`, `screenshot.rs:27`). No setting, no indication, no mention in any UI copy.
- **P1-2 · A sub-0.3 s PTT tap produces silence** — `Discard` (`state.rs:36-38`) emits only
  `state-changed:"idle"` (`recording.rs:221`). Indistinguishable from "the hotkey didn't register".
- **P1-3 · `cancel_stream` emits nothing** (`chat.rs:210-214`; `emit_llm_result` short-circuits at
  `:114`). The "stopped" state is a frontend assertion, not a confirmation.
- **P1-4 · `Transcribing` cannot be cancelled.** Escape is unregistered before `finish_recording`
  (`recording.rs:201`). A 10-minute recording that reaches Groq can only be waited out.
- **P1-5 · The Windows capture start can block up to 5 s with no feedback**
  (`capture/windows.rs:30`, `:321`), inside `spawn_blocking` from `swap_to_main_window`
  (`window.rs:202`). The Launch button has already returned; the HUD is up and looks ready.
- **P1-6 · The streaming→buffered STT fallback is invisible** (`recording.rs:271-292`). The user
  perceives an unexplained latency spike.
- **P1-7 · Dropped auto-mode segments are silent** (`auto.rs:108-111`) — the transcript panel just
  misses a sentence, and the model answers an incomplete question.
- **P1-8 · Auto-mode turns are not announced** (`AutoTranscript.tsx:55` has `aria-label` but no
  `aria-live`), and `state-changed` is announced nowhere.
- **P1-9 · A screenshot un-hides a deliberately hidden HUD** (`screenshot.rs:90`, `:97-99` →
  `window.rs:137-143`).

### P2

- **P2-1 · `ConnectivityOverlay` is not a live region** (`ConnectivityOverlay.tsx:6`) and its
  spinner is indeterminate despite a known 4 s retry cadence (`useConnectivity.ts:4`).
- **P2-2 · `StatusBar`'s error line is a truncated one-liner with no live region and no dismissal**
  (`StatusBar.tsx:92-97`); it disappears on the next `recording` transition (`App.tsx:168-173`).
- **P2-3 · The 900 ms auto-submit debounce has no visual counterpart** (`useAutoMode.ts:15`) — in
  instant mode a question sits pending for nearly a second with no "about to send" state.
- **P2-4 · The context gauge freezes during streaming** (`enabled: !streaming`, `App.tsx:296`) and
  has no loading state.
- **P2-5 · `PreviewPanel` has no Escape binding** (only `ContextLibraryPanel.tsx:286` and
  `LauncherSearch.tsx:90` bind Escape), while the teleprompter does (`hotkeys.rs:302`).
- **P2-6 · The 4 s ring preroll silently extends every recording backwards.** The user believes
  they recorded from the keypress; 4 s of prior audio went to Groq too (`capture.rs:442-449`).
- **P2-7 · `App.last_recording` retains the last recording's raw samples indefinitely**
  (`recording.rs:241`, `app_state.rs:23`) with no UI and no clear path.

### P3

- **P3-1 · Documentation drift:** CLAUDE.md's "`count_tokens` projection, 400 ms debounce" no longer
  matches the code — `useProjectedContextTokens` (`App.tsx:281-301`) has no debounce, only a react-
  query key and `staleTime = 10 min` (`App.tsx:279`).
- **P3-2 ·** `is_stalled` / `capture_rebuild_pending` are lazily polled at PTT entry
  (`recording.rs:107`) — a device change is discovered at the worst moment.
- **P3-3 ·** `retry_transcription` writes `RecorderState` directly rather than through
  `RecorderState::on` (`recording.rs:362`), so the FSM has a back door.
- **P3-4 ·** `EqBars` uses hardcoded pixel heights and a hardcoded stagger (`EqBars.tsx:3-4`)
  instead of tokens.

---

## Opportunities

1. **Give "listening" its own vocabulary, orthogonal to the recorder FSM.** The idle state is not
   one state — it is `idle+deaf`, `idle+buffering`, `idle+auto`. Three shapes (not three reds):
   e.g. a hollow ring for buffering, a filled pulse for PTT recording, a spinner-arc for
   transcribing, plus the `Ear` for auto. Text label under the eq bars costs one `text-hint` line.
2. **Make the buffer state a first-class HUD indicator with a click target**, mirroring exactly the
   `ScreenShareIndicator` precedent (`CLAUDE.md:337` already establishes the argument: a privacy
   property you can only change by killing the window is not a control). One toggle, same
   `saveSettingsReportingError` → `set_settings` → `apply_buffer_settings_change` path
   (`preferences.rs:166`).
3. **Solve the hidden-window blind spot.** Options, in ascending cost: (a) `state-changed` and
   `auto-mode-changed` already reach *every* window — a tiny always-on-top, click-through
   "listening" pip window would need only `window.rs`; (b) a tray item (would need a new plugin,
   contradicts the "no tray" status quo — flag for the human); (c) the macOS orange dot is already
   the truth for the mic, so aligning auto mode's UI with it is free.
4. **Add a `state-changed` live region.** One `aria-live="polite"` span carrying "Запись",
   "Распознаю", "Слушаю" would fix P0-3 and P1-8 at once, and reduced-motion users would finally
   have a signal.
5. **Have `cancel_stream` emit `llm-done`** (or a dedicated `llm-cancelled`) so "stopped" is a fact,
   not an assumption. Cheap: `chat.rs:210-214` currently removes the slot before the stream can
   report.
6. **Surface the discard.** A sub-0.3 s tap should emit an `stt-error` with a new code (or reuse
   `silence` with different copy) — `state.rs:37` already knows the reason.
7. **Show the preroll.** If the ring contributed N seconds, say so once next to the transcript;
   `capture.rs:445` already knows `preroll.len()`.
8. **Add a Windows-capture "warming up" state.** `window.rs:202-209` could emit a state before/after
   `ensure_capture` and cover the 5 s hole (`capture/windows.rs:30`).
9. **Reuse the launcher's `AudioCheckCard` pattern in the HUD.** It is the only place in the product
   that answers "is sound actually arriving" with a live meter and a sentence
   (`AudioCheckCard.tsx:42-45`) — the redesign should not leave that quality behind in a window that
   gets destroyed.
10. **Escape parity.** Give `PreviewPanel` a close combo from the registry (`hotkeys.rs`), not a
    hardcoded key — `docs/redesign/00-repo-map.md:377` forbids hardcoded combos.

---

## Open questions for the human

1. **Is a tray / menu-bar presence acceptable?** It is the only way to answer "is it listening?"
   while the HUD is hidden — but it directly contradicts the deliberate stealth of the "Audio
   System" process identity (`tauri.conf.json`, `CLAUDE.md:363`). Which wins?
2. **Should the ring buffer stay on by default?** (`settings.rs:221`.) If the redesign's goal is
   that the user never wonders what is being captured, an opt-in default is the cheapest fix — at
   the cost of the "catches what was said before you pressed" feature that the preroll exists for.
3. **Is the clipboard write on every transcript intended and wanted?** (`recording.rs:296-297`.)
   It is undocumented in the UI and is a real cross-app leak. Keep, keep-with-a-toggle, or drop?
4. **Should `set_ptt_suspended` grow into a real pause** (stop capture + clear the ring), or should
   a genuinely new "pause listening" control be added and `set_ptt_suspended` left as the
   typing-safety mechanism it actually is?
5. **Is a "listening" state allowed to animate under `prefers-reduced-motion`?** Today the block at
   `index.css:149-155` removes the only cue. A non-motion alternative (shape/text change) is
   preferred, but if motion is the only workable signal we need an explicit exception.
6. **Should `Recording` and `Transcribing` remain visually adjacent, or become clearly different
   states?** The current two-red scheme collides with invariant 3 (the fixed dot vocabulary,
   `docs/redesign/00-repo-map.md:356-358`) — introducing a third indicator colour needs a ruling.
7. **`last_recording` retention** (`recording.rs:241`): should it be cleared after a successful
   send, on a timer, or on a user action? It exists only for the retry button.
8. **Windows content-protection honesty** (`CLAUDE.md:337`): the `ScreenShareIndicator` shows
   "hidden" for a window that really is captured on Windows < 10 2004. Detect the build number, or
   keep the accepted lie?
9. **CLAUDE.md's "400 ms `count_tokens` debounce"** no longer exists in the code
   (`App.tsx:281-301`). Should the doc be corrected, or should the debounce be restored?
