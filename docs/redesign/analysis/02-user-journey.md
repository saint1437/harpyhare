# 02 — User journey audit (analyst B)

All paths are relative to `apps/desktop/` unless they start with `docs/`. Line numbers are from the
working tree at the time of the audit (branch `feat/auto-mode`).

## Summary

1. There is **no onboarding**. Zero matches for onboarding/tour/welcome/first-run anywhere in `src/`
   or `src-tauri/src/`. `StartScreen` is a prerequisites checklist, not a first-run experience.
2. The first screen a brand-new user sees is a card headed **«Что нужно для запуска»**
   (`features/launcher/screens/StartScreen.tsx:174`). Nothing in either window ever says what the
   product does, that it listens to the other party, or what "Запустить" will do.
3. Cold start to first streamed answer: **9 discrete actions on macOS with an access code**,
   **13 with your own keys**; 6 / 10 on Windows. Arithmetic below.
4. On macOS the audio permission needs **«Выдать» pressed twice** with an OS dialog in between —
   the TCC prompt is asynchronous and the row flips to «нет доступа» while it is still on screen
   (`CLAUDE.md:396`). Nothing on screen says to press it again.
5. **Push-to-talk is never taught.** The word «Удерживайте» lives in one string
   (`src-tauri/src/hotkeys.rs:164`) reachable only from Настройки → Клавиши (which the launch
   destroys) and from an unlabelled keyboard icon in the HUD (`components/HotkeysPopover.tsx:65`).
6. **"Is it listening?" has no honest answer.** `buffer_enabled` is `true` by default
   (`src/ipc/bindings.ts:61`); the ring buffer runs from the moment the HUD opens. Its only surface
   is a settings row on the Речь tab. The HUD's sole indicator is a 5-bar equaliser marked
   `aria-hidden` (`components/EqBars.tsx:13`).
7. The launcher has **no offline handling at all** — `useConnectivity`/`ConnectivityOverlay` are
   mounted only in `App.tsx:655,883`. A redeem with no network surfaces a raw English `reqwest`
   string in a Russian UI.
8. `close_app` is a registered command with **no caller in the frontend** — there is no quit from
   the HUD.
9. On Windows, enabling auto mode produces a blocker pointing at the `permissions` screen, which
   `screens.ts:62` hides on Windows, while «Старт» simultaneously reports «Всё готово».
10. Roughly half of the shipped capability (presets, context library, teleprompter, HTML preview,
    quick actions, auto mode, screenshot) is behind unlabelled icons or a sidebar the new user has
    no reason to open.

---

## Cold start script

Scenario: macOS 14.2+, fresh install, no `settings.json`, no `.env`, brand-new user.

**1. You double-click "Audio System" in Applications.**
The bundle is deliberately named `Audio System` (`docs/redesign/00-repo-map.md:68`), and both HTML
entries carry `<title>Audio System</title>` (`launcher.html:6`, `index.html:6`). The `harpyhare`
brand appears once, as an 10.5px uppercase mono line in the header
(`features/launcher/LaunchBar.tsx:100-102`, `lib/brand.ts`).
*Knowledge assumed:* that this process name is the product you installed.

**2. `setup_app` runs before anything is drawn** (`src-tauri/src/lib.rs:69-93`).
In order: `.env` files are loaded (`preferences::load_dotenv_files`, `lib.rs:70`); settings are read
with an env-var key fallback (`lib.rs:71`, `preferences.rs:24-32` — `ANTHROPIC_API_KEY`/
`GROQ_API_KEY`); official presets load (`lib.rs:72`); STT and LLM clients are built from the
(empty) keys (`lib.rs:74-75`); a background warm-up + model list is spawned (`lib.rs:76,95-102`);
state is registered with **`capture: None`** (`lib.rs:80`, `app_state.rs:140-168`) — deliberately,
because building a Core Audio tap *is* the TCC request (`CLAUDE.md:390`); then
`create_launcher_window` (`lib.rs:85`), a device listener (`lib.rs:88`), a move-keys monitor
(`lib.rs:89`), an **auto update check** (`lib.rs:91`) and a presets refresh (`lib.rs:92`).
*Consequence:* no OS prompt appears on first launch, and no audio is captured yet.

**3. A 1000×720 centred dark window appears.**
`window.rs:47-73`: `inner_size(1000,720)`, `min_inner_size(520,480)`, `.center()`,
`.theme(Some(tauri::Theme::Dark))`, content protection on unless `screen_share_visible`
(`window.rs:68`, default `false` → the window is **cut out of screen shares from the first frame**,
never stated). `platform::merge_titlebar_into_content` then hands the titlebar to the webview
(`window.rs:71`), so the header must reserve `pl-16` for the traffic lights
(`LaunchBar.tsx:12,96`).

**4. First painted frame: the word «Загрузка…» centred in an empty window.**
`LauncherApp.tsx:65-70` returns a full-screen `Загрузка…` while `useSettingsStore.loading` is true
(`hooks/useSettingsStore.ts:24,41-53`). In parallel — hooks run before the early return —
`useLauncherReadiness` → `usePermissions` issues `permissions_status()`
(`useLauncherReadiness.ts:44`, `hooks/usePermissions.ts:35-37`). On a fresh install that command
returns `unknown/unknown/unknown` without probing anything (`src-tauri/src/permissions.rs:42-78`:
`audio_permission_requested` is false → `Unknown`; `CGPreflightScreenCaptureAccess()` false +
flag false → `Unknown`; same for the mic).

**5. The launcher resolves to «Старт».**
`DEFAULT_SCREEN = "start"` (`screens.ts:75`), always — the old land-on-the-blocker ref was removed
deliberately (`CLAUDE.md:414`). Three `.launcher-rise` wrappers animate in at 0/50/100 ms
(`LauncherPanel.tsx:21,136-176`).

What is on screen:

- **Header** (`LaunchBar.tsx:93-119`): equaliser + `HARPYHARE.AI`; a search input placeholded
  «Поиск по настройкам» (`LauncherSearch.tsx:12`); a status line; a «Запустить» button
  (`LaunchButton.tsx:29`), disabled.
- **Status line while permissions are still being asked**: «Проверяю доступы…»
  (`LaunchBar.tsx:16-17`) with a grey dot. Note the keys blocker is already in `blockers` at this
  moment (`useLauncherReadiness.ts:51-54`) but is *hidden* by the `checking` branch — while the
  **sidebar dot on Настройки appears immediately** (`LauncherPanel.tsx:68-86`,
  `Sidebar.tsx:58-66`).
- **Sidebar**: six icon-only buttons, `w-10`, **no labels at any width** (`Sidebar.tsx:76`,
  `CLAUDE.md:400`). Groups: Старт / (Контексты, Пресеты) / then `mt-auto`-pinned
  (Настройки, Доступы, Обновления) (`Sidebar.tsx:79`). The only way to learn what an icon is, is to
  hover for the `title` (`Sidebar.tsx:40`).
- **Screen heading** from `screens.ts:29-34`: «Старт» + a single truncated line «Что нужно сделать
  до запуска. Остальное уже настроено по умолчанию.» (`ScreenShell.tsx:17-25` — `shrink-0` heading,
  `truncate` description, no second line).

**6. Card 1 — «Что нужно для запуска».** `StartScreen.tsx:174`, description = `summary(steps)`
(`StartScreen.tsx:28-32`): «Проверяю доступы…» → then «Осталось шагов: 2.».
Steps are derived, never typed (`start-steps.ts:65-70`):

- **Step «Доступ к API»** (`start-steps.ts:31-42`; title from `API_ACCESS_TITLE`,
  `lib/api-keys.ts:1`). State `todo`. Hint = `missingKeysNotice(...)` =
  **«Добавьте ключи Anthropic и Groq или введите код доступа»** (`lib/api-keys.ts:44-48`).
  Control (`StartScreen.tsx:99-104`): an `Input` with **`autoFocus`** and placeholder
  `XXXXX-XXXXX-XXXXX-XXXXX` (`components/AccessCodeForm.tsx:38,101`), a button «Активировать»
  (`AccessCodeForm.tsx:50`), and a ghost link **«Ввести свои ключи»** (`StartScreen.tsx:92`).
  *Decision forced:* code or keys — with no explanation of either.
  *Knowledge assumed:* that an "access code" exists as a product, where to buy/obtain one, what
  Anthropic is, what Groq is, that they are two separate paid accounts, and that the unlabelled
  focused field wants a code and not a key. **The field has no label** — only the placeholder.
- **Step «Запись системного звука»** (`permission-rows.ts:29-35` via
  `requiredPermissionRows(false)`, `start-steps.ts:49-63`). State `checking` → `todo`. Hint =
  `row.purpose` = **«Приложение слышит собеседника и расшифровывает речь. Без него запускать
  нечего.»**. State chip: «проверяю…» → «нужно сделать» (`StartScreen.tsx:19-23`).
  Controls when `todo` (`StartScreen.tsx:118-154`): «Выдать», «Настройки», «Все доступы →».
  *Knowledge assumed:* that «системный звук» means the other party's audio and not your microphone
  (the purpose line does say «слышит собеседника» — the one place it is stated), and that macOS
  will show a dialog.
- The **microphone step is absent** unless `auto_mode_enabled` (`permission-rows.ts:53-57`,
  default `false`, `bindings.ts:61`), and the **screen-recording row never appears here at all**
  (`need: "optional"`, `permission-rows.ts:48`) — it exists only on the Доступы screen.

**7. Card 2 — «Проверка звука».** `AudioCheckCard.tsx:74`, description **«Выданный доступ ещё не
значит, что звук идёт. Проверка слушает пять секунд и показывает, что расслышала.»**
(`AudioCheckCard.tsx:9-10`). One row, «Системный звук», hint «Голос собеседника: включите видео или
музыку и нажмите проверку.» (`AudioCheckCard.tsx:31`), button «Проверить»
(`AudioCheckCard.tsx:12,95`).
*Undisclosed:* pressing it calls `permissions::mark_requested(Audio)` and `ensure_capture`
(`src-tauri/src/audio_check.rs:69-71`) — i.e. **it raises the macOS TCC prompt**, from a button
labelled «Проверить». It also sends the samples to Groq (`audio_check.rs:131-134`), so it fails
with a key error before step 1 is done.

**8. Card 3 — the footer row.** `StartScreen.tsx:193-207`: the note **«Клавиши, быстрые действия,
размеры окна и вид уже заданы по умолчанию — их можно не трогать.»** (`StartScreen.tsx:25-26`),
a ghost «Все настройки», and a second «Запустить» (same `LaunchButton`, same disabled condition —
`LaunchButton.tsx:25`, `useLauncherReadiness.ts:38-40`).

**9. You type or paste the access code and press «Активировать».**
`AccessCodeForm.activate` (`AccessCodeForm.tsx:18-30`) → `redeemAccessCode`
(`ipc/commands.ts:89-101`): the code is normalised (`lib/access-code.ts:1-7` — uppercased,
non-alphanumerics stripped, `I`/`L`→`1`, `O`→`0`), an idempotency key is derived from a SHA-256 of
it and cached in `localStorage` → `redeem_access_code` (`src-tauri/src/preferences.rs:91-101`) →
`access::redeem` posts to `https://itech-relay.itech-edge.workers.dev/v1/redeem` with 3 attempts /
15 s timeout / 400 ms backoff (`src-tauri/src/access.rs:4,10-65`). On success the token is written
to settings and both API clients are rebuilt (`preferences.rs:103-114,131-143`), then
`LauncherApp.redeem` calls `reload()` (`LauncherApp.tsx:24-31`).
*Result on screen:* the step flips to `done`, the chip reads «готово», the hint becomes «Запросы
уходят от вашего имени — ключи или код уже приняты.» (`start-steps.ts:26`), the form is replaced by
a single link «Изменить доступ» (`StartScreen.tsx:92,97`).

**10. You press «Выдать» on the audio step.**
`permissions.request("audio")` (`usePermissions.ts:39-47`) → `request_permission`
(`permissions.rs:111-129`) → `mark_requested` persists `audio_permission_requested = true` →
`recording::rebuild_capture` → `build_capture` → `AudioCapture::new` — **this call is the TCC
request**. The macOS dialog appears; the command returns *before you answer*, gets `None`, and
reports `Denied` (`app_state.rs:96-112`, `permissions.rs:118`).
*On screen:* the chip goes to «нужно сделать» while the OS dialog is still open, and the button
still says «Выдать». Documented as intentional geometry-stability, not as a labelled retry
(`CLAUDE.md:396`).

**11. You press "Allow" in the macOS dialog.** Nothing in the app re-polls.

**12. You press «Выдать» again.** Now `build_capture` succeeds → `Granted` → the step turns `done`,
the icon becomes a `Check` (`StartScreen.tsx:51`), `stepsLeft` hits 0, the summary becomes «Всё
готово — можно запускать.» (`StartScreen.tsx:31`), the header says «Всё готово к запуску»
(`LaunchBar.tsx:20`) with a `primary` dot, and both «Запустить» buttons enable.
*Nothing tells you that a second press was required.* The alternative recovery is the Доступы
screen's «Проверить заново» (`screens/PermissionsScreen.tsx:93`) — on a screen you have not opened.

**13. You press «Запустить».**
`LauncherApp.handleLaunch` (`LauncherApp.tsx:49-63`): guards on `readiness.ready`, sets `launching`
(header status → «Запускаю основное окно…», `LaunchBar.tsx:15`; equaliser starts animating,
`LaunchBar.tsx:99`; button label → «Запускаю…», `LaunchButton.tsx:29`), persists the draft, then
`launch_main_window` → `swap_to_main_window` (`window.rs:193-211`):
creates the HUD (`window.rs:75-100`: `settings.window_width/height` = 960×680, `transparent`,
`decorations(false)`, `always_on_top`, `visible_on_all_workspaces`, `content_protected`),
**registers the 7 global hotkeys** (`window.rs:105-125`), **destroys the launcher**
(`window.rs:197-199`), and only then, off-thread, raises the capture and (if enabled) auto mode
(`window.rs:200-209`).
*Knowledge assumed:* that the window you were using will vanish and be replaced by a different one,
that all your settings are still there, and how to get back.

**14. The HUD appears — a 960×680 frameless always-on-top card.**
Header (`components/StatusBar.tsx:81-107`): a `Minus` "hide" icon whose `title` is «Скрыть окно —
вернуть: ⌘⇧H» (`StatusBar.tsx:84`); the equaliser; one numbered chat tab `1`
(`ChatTabs.tsx:66-99`); an empty error slot; then icons — auto-mode ear
(`AutoModeIndicator.tsx:22-30`), screen-share eye (`ScreenShareIndicator.tsx:19-27`), keyboard
(`HotkeysPopover.tsx:65`), and a `Square` «Стоп — вернуться в лаунчер» (`StatusBar.tsx:102`).
Body: an empty-state «Чат появится здесь» (`components/AnswerPanel.tsx:285`).
Composer: three default quick-action buttons «Подробнее / Короче / Пример кода`
(`bindings.ts:61` `quick_actions`, `QuickActionsBar.tsx:45-66`), a textarea placeholded
«Расшифровка появится здесь — или напиши вопрос сам» (`Composer.tsx:136`), and a toolbar of four
icons — eraser, notebook, crop, sliders (`Composer.tsx:326-368`).
**Nowhere on this screen is the record key shown.**

**15. You hold ⌘R while the other party speaks.**
Default per platform (`hotkeys.rs:160-168`, `primary_combo!("R")`): **⌘R on macOS, Ctrl+R on
Windows**; `scope: global`; hint «Удерживайте, пока говорит собеседник.». Press →
`recording::on_ptt_pressed` (`recording.rs:101-135`): rebuilds a stalled capture, starts a streaming
STT upload, registers Escape as cancel, emits `state-changed(Recording)`, warms the LLM.
*On screen the only change is the equaliser turning `bg-recording` and animating*
(`StatusBar.tsx:60`) — and it is `aria-hidden` (`EqBars.tsx:13`).
Release → `on_ptt_released` (`recording.rs:193+`) → `deliver_transcript`
(`recording.rs:295-301`): the text is written to the **clipboard**, `transcript-ready` is emitted,
then `focus-prompt`.

**16. The transcript lands in the input field and the caret goes to its end.**
`useTranscription` (`hooks/useTranscription.ts:4-6`) → `appendTranscript` merges it into the draft
(`App.tsx:640-651`); `usePromptFocus` focuses and sets the caret (`hooks/usePromptFocus.ts:9-22`).
Because `auto_send` is `false` by default (`bindings.ts:61`), it stops there.

**17. You press Enter (or ⌘Enter, or the ↑ button).**
Enter in the textarea sends (`Composer.tsx:128-134`); ⌘Enter works from anywhere in the window
(`hotkeys.rs:187-195`, `useWindowControls.ts:55-58`); the ↑ button's `title` is «Отправить (⏎)»
(`Composer.tsx:395`).

**18. The answer streams in.** `llm-delta` coalesced in Rust, revealed in a rAF loop
(`useClaudeStream.ts:63-97`), rendered as markdown. **First real value.**
The chat carries no preset (`presetId: ""`, `lib/chats.ts:53`) and model `claude-haiku-4-5`
(`lib/models.ts:10`) — the shipped interview presets (`config/presets.json`: `golang`, …) are not
applied and were never offered.

---

## Action count to first value

Counting rule: one discrete deliberate user act = 1. A PTT hold+release = 1. An OS dialog button =
1. Typing/pasting into a focused field = 1; focusing a field that is not already focused = 1.

### Path A — access code (macOS)

| # | Action | Evidence |
|---|---|---|
| 1 | Double-click the app | `lib.rs:69-93` |
| 2 | Type/paste the code (field is already focused) | `StartScreen.tsx:101` `autoFocus` |
| 3 | «Активировать» (or Enter) | `AccessCodeForm.tsx:45-51` |
| 4 | «Выдать» (audio) | `StartScreen.tsx:122-129` |
| 5 | "Allow" in the macOS TCC dialog | `permissions.rs:118`, `CLAUDE.md:396` |
| 6 | «Выдать» again (the command already returned `denied`) | `CLAUDE.md:396` |
| 7 | «Запустить» | `LaunchButton.tsx:25-30` |
| 8 | Hold ⌘R while the other party speaks | `hotkeys.rs:160-168` |
| 9 | Enter to send | `Composer.tsx:128-134` |

**= 9 actions.** Add **+1 and a 5-second wait** if you take the app's own advice and run «Проверка
звука» (`AudioCheckCard.tsx:12`, `audio_check.rs:12` `CHECK_SECS = 5`).
Outside-the-app prerequisites: **obtain an access code** (no in-app link, no price, no explanation).

### Path A on Windows

Steps 4–6 vanish — `AUDIO_REQUIRES_PERMISSION = cfg!(target_os="macos")` (`permissions.rs:31`),
the Доступы screen is not rendered (`screens.ts:62`) and `permissionSteps` returns `[]`
(`start-steps.ts:50`). **= 6 actions** (1,2,3,7,8,9), PTT default Ctrl+R.

### Path B — bring your own keys (macOS)

| # | Action | Evidence |
|---|---|---|
| 1 | Double-click the app | `lib.rs:69-93` |
| 2 | Click «Ввести свои ключи» (past the focused code field) | `StartScreen.tsx:92` |
| 3 | Click the Anthropic field | `ApiKeysSection.tsx:53-62` |
| 4 | Paste `sk-ant-…` | `ApiKeysSection.tsx:14` |
| 5 | Click the Groq field | `ApiKeysSection.tsx:53-62` |
| 6 | Paste `gsk_…` | `ApiKeysSection.tsx:15` |
| 7 | Navigate back (header status now names the audio blocker, or the sidebar) | `LaunchBar.tsx:48-65`, `useLauncherReadiness.ts:16-19` |
| 8 | «Выдать» (audio) | `screens/PermissionsScreen.tsx:73-80` or `StartScreen.tsx:122-129` |
| 9 | "Allow" in the macOS TCC dialog | `CLAUDE.md:396` |
| 10 | «Выдать» again | `CLAUDE.md:396` |
| 11 | «Запустить» | `LaunchButton.tsx:25-30` |
| 12 | Hold ⌘R | `hotkeys.rs:160-168` |
| 13 | Enter to send | `Composer.tsx:128-134` |

**= 13 actions**, and **no save step** — the draft autosaves 600 ms after the last keystroke
(`LauncherPanel.tsx:22,104-114`), which is never stated on screen.
Plus **two full out-of-app errands**: create an Anthropic key and a Groq key. Each is a signup +
billing flow. The app offers a «Где взять» button per key that opens
`console.anthropic.com/settings/keys` / `console.groq.com/keys` (`lib/api-keys.ts:17,23`,
`ApiKeysSection.tsx:63-71`) — **+2 clicks** if used, i.e. **15 in-app actions**.

**Path B on Windows: 10 actions** (drop 8–10).

### Best case vs. what it takes to be *sure* it works

The 9- and 13-action counts assume nothing goes wrong and the user guesses PTT unaided. A user who
verifies audio first (+1 press, +5 s) and who reads the hotkeys popover to find the record key
(+1 click to open `HotkeysPopover`) reaches **11 / 15**.

---

## Findings

### 3. Existing onboarding — what `StartScreen` does instead, and where it loses people

**What it is.** `startSteps(readiness)` = `[accessStep, ...permissionSteps]` (`start-steps.ts:65-70`).
The access step's title comes from the same constant `ApiKeysSection` puts on its card
(`API_ACCESS_TITLE`, `lib/api-keys.ts:1`) and its unfinished text from `missingKeysNotice(...)` —
the identical wording the header blocker uses (`useLauncherReadiness.ts:52`). Permission steps come
from `requiredPermissionRows(autoModeEnabled)` (`permission-rows.ts:53-57`), so the set depends on
settings, not only on platform.

**Three states, not two** (`start-steps.ts:13,56-60`): `done` / `todo` / `checking`. While
`checking` the chip says «проверяю…» (`StartScreen.tsx:22`), no «Выдать» button renders
(`StartScreen.tsx:120`), and `stepsLeft` does not count it (`start-steps.ts:72-74`) — so a cold
start never falsely accuses a correctly configured machine.

**What counts as a blocker** (`useLauncherReadiness.ts:49-58`): missing keys → `{screen:"settings",
tab:"access"}`; `!permissions.audioOk` → `{screen:"permissions"}`; `autoModeEnabled &&
!microphoneOk` → `{screen:"permissions"}`. The keys blocker is pushed *before* the `checking` early
return, so it is live from the first render.

**`canLaunch`** = `ready && !checking && !launching` (`useLauncherReadiness.ts:38-40`), where
`ready = missingKeys.length === 0 && audioOk && !microphoneNeeded` (`:66`). One function, two
buttons (`LaunchButton.tsx:25`).

**Header status** (`LaunchBar.tsx:14-21`), in priority order: «Запускаю основное окно…» →
«Проверяю доступы…» → «Сохраняю…» → the first blocker's label → «Всё готово к запуску». When a
blocker is shown and nothing is busy it becomes a clickable `Button` with a chevron that routes to
`{screen, tab}` (`LaunchBar.tsx:48-65`).

**`autoFocus`** lands on the access-code `Input` (`StartScreen.tsx:101` → `AccessCodeForm.tsx:36`),
and only there. `AccessCodeForm` in `ApiKeysSection` gets no `autoFocus` (`ApiKeysSection.tsx:46`).

**Where it loses people:**

- **It never says what the app is.** The screen description is «Что нужно сделать до запуска»
  (`screens.ts:31`) and the card is «Что нужно для запуска» (`StartScreen.tsx:174`). No sentence
  anywhere explains system-audio capture, transcription, the answer stream, or the HUD.
- **The access code is an unexplained token.** On «Старт» the field carries no label at all — only
  `placeholder="XXXXX-XXXXX-XXXXX-XXXXX"` (`AccessCodeForm.tsx:38`). The one explanatory line,
  «Быстрый путь: заводить ключи не нужно.» (`ApiKeysSection.tsx:45`), lives on a settings tab the
  user has not opened. **There is no "where do I get one" affordance** — contrast the keys, which
  each get a «Где взять» button (`ApiKeysSection.tsx:63-71`).
- **It assumes you know which of the two paths is yours** before it explains either.
- **Nothing has a next step after `done`.** When both steps close, the summary says «Всё готово —
  можно запускать.» and the footer note talks about defaults (`StartScreen.tsx:25-26`). No sentence
  about what to do in the HUD.
- **The two-press permission dance is invisible** (see §5).
- **Optional capability is announced only by a door.** The «Все доступы →» link stays even when the
  step is `done` (`StartScreen.tsx:142-152`) — deliberately, per `CLAUDE.md:417` — but the label
  gives no reason to walk through it; screen recording and the microphone are never named on
  «Старт».
- **`AudioCheckCard` is the closest thing to a "does it work?" moment and it is optional, silent
  about triggering a TCC prompt, and unusable before keys exist.**

### 4. Dead ends and undiscoverable capability

Legend: **D** discoverable from the default first screen · **S** semi-discoverable (behind a hover
`title`, an icon, or one obvious click) · **H** hidden (needs opening a screen the new user has no
reason to open, or knowing a hotkey).

**Launcher (`screens.ts`, `settings-tabs.ts`, `sections/*`)**

| Capability | Rating | Why |
|---|---|---|
| Access code / API keys | **D** | The one thing «Старт» puts in front of you (`StartScreen.tsx:99-104`) |
| Audio permission | **D** | Step 2 on «Старт» (`start-steps.ts:49-63`) |
| Audio/mic check | **D** | Second card on «Старт» (`StartScreen.tsx:191`) |
| Launcher search | **S** | A visible input, but labelled «Поиск по настройкам» (`LauncherSearch.tsx:12`) while it also indexes screens, hotkeys and permission rows (`search.ts`); **no shortcut by design** (`CLAUDE.md:410`) |
| Контексты (context library) | **H** | Icon-only sidebar; only the hover `title` and the screen description «Справочные материалы, которые можно подмешать в системный промпт чата.» (`screens.ts:38`) — jargon-first |
| Пресеты, incl. the shipped interview presets | **H** | Same; and a new chat uses none of them (`lib/chats.ts:53`) |
| Доступы (screen recording, microphone) | **H** | Sidebar bottom group; nothing on «Старт» names them (`permission-rows.ts:38-49`) |
| Обновления | **H** | Sidebar; a `primary` dot appears only when an update exists (`LauncherPanel.tsx:75-83`) |
| Настройки → Речь: capture device, STT language, translate-to-English | **H** | `SttSection.tsx:45,74,97` |
| **Фоновый буфер (always-on ring buffer)** | **H** | `SttSection.tsx:108-116`, default **on** (`bindings.ts:61`) — the one continuously-listening feature is a settings row |
| Автослушание (mic + system, labelled turns) | **H** | `AutoModeSection.tsx:54-58`, default off; the product's differentiator is two clicks deep on a tab called «Речь» |
| Настройки → Клавиши (every hotkey incl. PTT) | **H** | `HotkeysSection.tsx:63-84`; after Launch this screen no longer exists |
| Настройки → Действия (quick actions + digit combos) | **H** | `QuickActionsSection.tsx` |
| Настройки → Окно (move/resize/scroll modifiers) | **H** | `WindowSection.tsx:39-86` |
| Настройки → Поведение (screen-share visibility, auto-send, HTML preview, teleprompter resume) | **H** | `BehaviorSection.tsx:22-48` |
| Настройки → Вид (theme, chat font, opacity) | **H** | `AppearanceSection.tsx` |

**HUD**

| Capability | Rating | Why |
|---|---|---|
| Type a question and send | **D** | Placeholder + ↑ button (`Composer.tsx:136,392-399`) |
| Quick actions | **D** | Three buttons ship by default (`bindings.ts:61`, `QuickActionsBar.tsx:45`) |
| **Push-to-talk** | **H** | No on-screen mention. Combination + «Удерживайте…» only in `HotkeysPopover` (`hotkeys.rs:164`, `HotkeysPopover.tsx:60-89`) |
| Cancel a recording (Escape) | **H** | `hotkeys.rs:178-186`, registered only while recording |
| Hide/show the window | **S** | The `Minus` button's `title` names the return combo (`StatusBar.tsx:84`) — but once hidden, only the hotkey brings it back (`window.rs:152-160`) |
| Стоп → back to the launcher | **S** | `Square` icon, `title` «Стоп — вернуться в лаунчер» (`StatusBar.tsx:102`) |
| Auto mode toggle | **S** | Ear icon with a long `title` (`AutoModeIndicator.tsx:5-8,22-30`) |
| Screen-share visibility toggle | **S** | Eye icon (`ScreenShareIndicator.tsx:4-7`); the *default* (invisible in shares) is never announced |
| Hotkeys popover | **S** | Keyboard icon, `title` «Горячие клавиши» (`HotkeysPopover.tsx:65`) |
| Chat tabs / new chat / **close a chat** | **H** | Tabs are bare numbers; closing = click the *active* tab, whose `×` only appears on hover (`ChatTabs.tsx:75-90`) |
| Duplicate chat | **S** | `CopyPlus` icon with the combo in its `title` (`ChatTabs.tsx:109-134`) |
| Region screenshot | **S** | `Crop` icon (`Composer.tsx:353-361`); also a global hotkey ⌘⇧A (`hotkeys.rs:205-213`) — and it needs a permission that «Старт» never mentions |
| Chat context dialog | **S** | `NotebookText` icon, `title` «Контекст чата» (`Composer.tsx:337-352`) |
| Request params (model / препромпт / Thinking / Веб-поиск) | **H** | Behind a `SlidersHorizontal` icon `title`d «Параметры запроса» (`Composer.tsx:251-262`) |
| Clear chat history | **S** | `Eraser` icon (`Composer.tsx:327-336`) |
| Teleprompter | **H** | The `ScrollText` icon appears **only after an assistant reply exists** (`App.tsx:467-471`, `canTeleprompt` `App.tsx:721`); otherwise ⌘⇧T |
| HTML preview | **H** | Opens itself when `auto_preview_html` (default on) finds an HTML block (`App.tsx:620-623`); otherwise via a code-block affordance (`AnswerPanel.tsx:424`) |
| Copy last answer | **H** | `Copy` icon appears only when `canCopy` (`App.tsx:472-476`) |
| Per-message copy / resend / delete | **H** | Hover-revealed gutter buttons (`AnswerPanel.tsx:160-175`) |
| Auto transcript panel + «Ответить» | **H** | Rendered only while auto mode is active (`App.tsx:824-833`) |
| Context-usage gauge | **H** | Appears only when tokens are known (`StatusBar.tsx:99`, `App.tsx:729-732`); meaning lives in a `title` (`StatusBar.tsx:38`) |
| Window move/resize/opacity/scroll by modifier+arrows | **H** | Keyboard-only (`hotkeys.rs:241-276`) |
| **Quit the app** | **dead end** | `close_app` exists (`window.rs:236-240`) and is **not exported in `ipc/commands.ts:9-44` nor called anywhere**; the HUD has `decorations(false)` (`window.rs:91`) |

**Unclear / jargon-y copy (verbatim, with what a first-time reader takes from it)**

- `screens.ts:38` «Справочные материалы, которые можно подмешать в системный промпт чата.» — assumes
  "системный промпт" is known vocabulary; also truncated to one line by `ScreenShell.tsx:20-25`.
- `screens.ts:45` «Препромпты: текст, который встаёт в начало системного промпта.» — defines one
  invented word with another.
- `settings-tabs.ts:29` «Устройства захвата, язык расшифровки, фоновый буфер и автослушание.» —
  four unexplained nouns in one line; this is the tab where the always-on buffer lives.
- `AccessCodeForm.tsx:38` `placeholder="XXXXX-XXXXX-XXXXX-XXXXX"` — the only description of the one
  field that is focused on first run.
- `hotkeys.rs:289` label «Суфлёр», hint «Крупный текст ответа поверх экрана.» — "суфлёр" is theatre
  jargon; the feature is a teleprompter.
- `Composer.tsx:78` `THINKING_PARAM_LABEL = "Thinking"` — untranslated English in a Russian UI.
- `Composer.tsx:223` `placeholder="Препромпт"` / `:226` «Без препромпта».
- `AutoModeSection.tsx:62` «Иначе включается кнопкой в шапке окна или сочетанием клавиш.» — names
  neither the button nor the combination.
- `BehaviorSection.tsx:27` «По умолчанию окно вырезано из захвата — собеседники его не видят.» — the
  single statement of the most product-defining default, on the least-visited tab.
- `permission-rows.ts:46` «Нужна снимку области экрана. Без неё работает всё остальное.» — reads as
  "ignore me"; the screenshot hotkey is nonetheless registered and will fail silently-ish.
- `useLauncherReadiness.ts:25` «Нет доступа к микрофону — его требует автослушание» — on Windows
  this routes to a screen that is not rendered (see §5).
- Mixed address forms: «Проверьте устройство…» (`AudioCheckCard.tsx:16`), «Нажмите «Выдать»»
  (`PermissionsScreen.tsx:100`) vs «проверь в настройках» (`stt.rs:24`, `llm.rs:49`), «Проверь сеть
  или VPN» (`ConnectivityOverlay.tsx:4`), «напиши вопрос сам» (`Composer.tsx:136`).

### 5. Failure paths

**Audio permission denied (macOS).** `request_permission(Audio)` returns `Denied` *before* the user
answers the OS dialog (`permissions.rs:111-119`, `CLAUDE.md:396`). On «Старт» the chip reads «нужно
сделать» (`StartScreen.tsx:21`); on Доступы «нет доступа» (`PermissionsScreen.tsx:11`). Both keep
«Выдать» + «Настройки» (`PermissionsScreen.tsx:62-82`) — `openSettings` deep-links the privacy pane
(`permissions.rs:133-139`). Recovery exists (press «Выдать» again — it is a safe re-probe now that
the flag is set) but is **never labelled as a retry**. The Доступы screen's group description is the
only text that hints at it: «Нажмите «Выдать» — macOS спросит подтверждение; если окно не появилось,
доступ уже решён и меняется в системных настройках. Меняли что-то там — нажмите «Проверить заново».»
(`PermissionsScreen.tsx:100`) — and that text is on a screen «Старт» does not send you to unless you
click «Все доступы».

**Screen recording denied.** `screen_state` = `CGPreflightScreenCaptureAccess()` ||
(flag ? Denied : Unknown) (`permissions.rs:69-78`, `platform/macos.rs:147-153`).
`request_permission(Screen)` returns whatever `CGRequestScreenCaptureAccess()` returns immediately —
`false` on a first request — so the row shows «нет доступа». **Not a blocker** (`need: "optional"`,
`permission-rows.ts:48`), never appears on «Старт», and the only recovery is «Проверить заново» on
the Доступы screen (`PermissionsScreen.tsx:93`). A user who never opens Доступы will press ⌘⇧A in a
call and get a `screenshot-error` in the header line.

**Microphone denied.** `microphone_state` (`permissions.rs:55-63`) probes by *building* a mic
capture. Blocks the launch only while `auto_mode_enabled` (`useLauncherReadiness.ts:47,56`) with the
label «Нет доступа к микрофону — его требует автослушание» (`:25`) pointing at `permissions`.
**On Windows this is a dead end:** `MICROPHONE_REQUIRES_PERMISSION = true` (`permissions.rs:32`) but
the Доступы screen is `platforms: ["macos"]` (`screens.ts:62`) and `permissionSteps` returns `[]`
(`start-steps.ts:50`). Result: «Старт» shows one step, `stepsLeft() === 0`, the summary reads «Всё
готово — можно запускать.» (`StartScreen.tsx:31`) — while both Launch buttons are disabled and the
header says the microphone is missing. Clicking the header routes to `screen: "permissions"`, which
`LauncherPanel.tsx:201` renders unconditionally: a screen absent from the sidebar, titled «Доступы»,
whose card is headed «Разрешения macOS» (`PermissionsScreen.tsx:99`).

**No API keys set.** `missingApiKeys` returns the empty-string keys unless `access_token` is set
(`lib/api-keys.ts:39-42`); the blocker label is «Добавьте ключи Anthropic и Groq или введите код
доступа» / «Добавьте ключ Groq…» (`:44-48`). It is shown in three places at once — header status
(`LaunchBar.tsx:19`), sidebar dot on Настройки (`LauncherPanel.tsx:70-74`), and the «Старт» step
hint (`start-steps.ts:36`). Launch is disabled. Clear and recoverable; the only gap is that it never
says what the keys are for beyond «Нужен для ответов Claude.» / «Нужен для распознавания речи.»
(`ApiKeysSection.tsx:51`, `lib/api-keys.ts:16,22`).

**Invalid access code.** Non-2xx → `redeem_error_message` pulls `error.message` out of the relay's
JSON, else falls back to **«Не удалось активировать код доступа»** (`access.rs:15-17,82-88`). The
string is thrown through `redeemAccessCode`'s `catch` as `String(e)` (`ipc/commands.ts:98-100`) and
rendered under the field in `text-destructive` (`AccessCodeForm.tsx:53`). No retry button — the
field keeps its value (`AccessCodeForm.tsx:24` only clears on success) and pressing «Активировать»
again reuses the cached idempotency key (`ipc/commands.ts:92-93`). Adequate. Two other outcomes
surface raw internal strings: **«Прокси вернул неожиданный ответ на активацию»** and **«Прокси
вернул пустой токен»** (`access.rs:15,17`) — the word «прокси» is meaningless to the user.

**No network — in the launcher.** There is **no connectivity handling in the launcher at all**
(`useConnectivity`/`ConnectivityOverlay` appear only in `App.tsx:655,883`). `access::redeem` retries
3× with 400 ms backoff (`access.rs:12-13,55-63`) then returns `e.to_string()` from `reqwest`
(`access.rs:61,64`) — an **English technical string** (`error sending request for url (...)`)
displayed in a Russian UI (`AccessCodeForm.tsx:53`). No overlay, no "check your connection", no
retry affordance.

**No network — in the HUD.** `useConnectivity` starts from `navigator.onLine`, probes
`probe_connectivity` every 4 s while offline, and is force-set by any `code === "network"` error
(`useConnectivity.ts:11-49`, `App.tsx:712-715`, `lib/errors.ts:51-53`). `ConnectivityOverlay` covers
the whole window: **«Ожидается подключение к интернету» / «Приложению нужен интернет. Проверь сеть
или VPN — экран пропадёт автоматически.»** (`ConnectivityOverlay.tsx:3-4,8`). Good: it states the
recovery is automatic. It also blocks the prompt (`App.tsx:656-657`) and quick actions
(`App.tsx:682`).

**First STT call fails.** `stt-error` → `useSttFeedback` (`App.tsx:159-166`): the message goes into
`StatusBar`'s single truncated line, **only while `state === "idle"`** (`StatusBar.tsx:78,92-97`),
and a `RotateCcw` «Повторить распознавание» appears in the composer **only for
`isRetryable` codes** (`network`/`retryable`, `lib/errors.ts:17`, `Composer.tsx:370-380`), calling
`retryTranscription()` (`App.tsx:184-187`). Exact messages:
- `badApiKey` → **«Неверный ключ Groq — проверь в настройках»** (`stt.rs:24`). *Dead end:* the
  settings are in the launcher, which no longer exists; the user must find «Стоп» first.
- `badAccessCode` → the relay's own message (`stt.rs:26-27`).
- `retryable` → **«Сервис распознавания перегружен, попробуй позже (503)»** (`stt.rs:28`) — retry
  button shown.
- `network` → **«Нет соединения — проверь интернет/VPN: …»** (`stt.rs:30`) — retry button shown
  *and* the connectivity overlay covers the window (`App.tsx:713-715`).
- `permission`/internal → **«Нет разрешения на запись системного звука»** (macOS,
  `recording.rs:18-21`) or **«Захват системного звука недоступен — проверь устройство вывода в
  настройках»** (Windows, `recording.rs:22-26`). No retry button, and the settings named are in the
  other window.
- silence → **«Тишина — нечего распознавать (если звук играл: проверь право «Запись системного
  звука» у macOS и устройство захвата в настройках)»** (`recording.rs:29`, Windows variant `:31`),
  emitted from `recording.rs:239`. The most useful message in the app — and it is squeezed into one
  `truncate`d header line (`StatusBar.tsx:92-97`), readable only via the `title` tooltip.

**First LLM call fails.** `llm-error` → `useClaudeStream` (`useClaudeStream.ts:130-135`): the
partial is dropped, streaming ends, the error is stored per chat and reaches the same single header
line (`App.tsx:709-710`, `AppHeader` `error={error?.message}` `App.tsx:436`). Messages:
**«Неверный ключ Anthropic — проверь в настройках»**, **«Anthropic перегружен, попробуй позже
(529)»**, **«Нет соединения — проверь интернет/VPN: …»**, **«Ошибка API: …»**, **«Остановлено»**
(`llm.rs:49-57`). **There is no retry for the LLM** — `showRetry` is wired to `stt-error` only
(`App.tsx:157,163`) and calls `retryTranscription`. The only recovery is the hover-revealed
«Переотправить (всё, что ниже, будет заменено новым ответом)» on the user message
(`AnswerPanel.tsx:166`, `App.tsx:376-390`). And because `showError` requires `state === "idle"`
(`StatusBar.tsx:78`), an LLM error that arrives while a recording is running is **not displayed at
all**.

**Audio check finds silence.** `check_audio_source` (`audio_check.rs:142-155`): `ensure_idle`
(refuses with **«Идёт запись — дождитесь её окончания»**, `:15,60`, or `auto::recorder_busy_error()`),
starts the capture with the background buffer turned off (`:82`), listens 5 s streaming `audio-level`
every 100 ms (`:13,43-53`), then `verdict` (`:122-140`). Three distinguishable outcomes rendered by
`rowHint` (`AudioCheckCard.tsx:47-56`):
- silence → **«Тишина — звук не дошёл. Проверьте устройство и что источник действительно звучит.»**
  (`AudioCheckCard.tsx:15-16`). *No recovery action on the card* — the capture-device select is on
  Настройки → Речь (`SttSection.tsx:45`) and the card does not link to it.
- sound, no speech → **«Звук идёт, но речи в нём не разобрать.»** (`:17`).
- recognised → **«Расслышала: «…»»** (`:44`).
- backend refusal → `error.message` verbatim (`:54`), e.g. **«Захват системного звука недоступен»**
  (`audio_check.rs:16`) or the Groq key error.
The card is available before the access step is done, so on a truly fresh install the most likely
first result is a Groq key error from a button labelled «Проверить».

### 6. The daily-use loop

| Step | Mechanism | Hotkey visible at that moment? |
|---|---|---|
| Invoke help | Hold the record key. Default **⌘R / Ctrl+R** (`hotkeys.rs:160-168`, `primary_combo!("R")`); registered globally on launch (`window.rs:106,115-125`) | **No.** Only in `HotkeysPopover` behind an icon (`HotkeysPopover.tsx:65`) |
| Know it is recording | `state-changed(Recording)` (`recording.rs:132`) → equaliser turns `bg-recording` and animates (`StatusBar.tsx:60,90`) | n/a — the indicator is `aria-hidden` and unlabelled (`EqBars.tsx:13`) |
| Cancel a recording | Escape, registered only while recording (`hotkeys.rs:178-186`, `recording.rs:131`) | **No** |
| Transcript reaches the field | `deliver_transcript` (`recording.rs:295-301`): clipboard write → `transcript-ready` → `focus-prompt`; merged by `appendTranscript` (`App.tsx:640-651`); caret to end via `usePromptFocus` (`usePromptFocus.ts:9-22`) | n/a |
| Send | Enter in the field (`Composer.tsx:128-134`), ⌘Enter anywhere (`hotkeys.rs:187-195`, `useWindowControls.ts:55-58`), or the ↑ button `title`d «Отправить (⏎)» (`Composer.tsx:395`). Or automatically if `auto_send` (default off, `BehaviorSection.tsx:6-8`) | Partly — the ↑ button's `title` names ⏎ only |
| Read the answer | Streamed into `AnswerPanel`; rAF reveal (`useClaudeStream.ts:63-97`); sticky-to-bottom with a jump button (`AnswerPanel.tsx:404,453`); scroll by **Alt + ↑/↓** (`hotkeys.rs:268-276`) | **No** for the scroll modifier |
| Enlarge for reading | Teleprompter: `ScrollText` icon (only once a reply exists, `App.tsx:467-471`) or **⌘⇧T** global (`hotkeys.rs:286-294`); Space pauses, Esc closes — both stated in the overlay's own `title`s (`Teleprompter.tsx:146,175`) | Icon **S**, hotkey **No** |
| Dismiss the answer | No dismiss. Options: eraser «Очистить историю чата» (`Composer.tsx:332`), delete a message (hover, `AnswerPanel.tsx:173`), new chat `Plus` (`ChatTabs.tsx:103`), or close the tab by clicking the active number (`ChatTabs.tsx:75-90`) | n/a |
| Pause / stop listening | PTT is per-hold — release stops it. Auto mode toggles on the ear icon or **⌘⇧L** (`AutoModeIndicator.tsx:22`, `hotkeys.rs:169-177`). **The background ring buffer cannot be stopped from the HUD at all** — only `buffer_enabled` in the launcher (`SttSection.tsx:108-116`) | Hotkey in the ear's `title` |
| Back to the launcher | `Square` in the header → `stop_main_window` → `swap_to_launcher_window` (`App.tsx:802`, `window.rs:213-234`): auto mode stopped, global hotkeys unregistered, launcher recreated, HUD destroyed. The launcher reopens on «Старт» with a fresh React root | Yes — `title` «Стоп — вернуться в лаунчер» (`StatusBar.tsx:102`) |
| Hide the window | `Minus` → `hide_main_window` (`App.tsx:441`, `window.rs:242-246`). Back: the toggle hotkey **⌘⇧H** (`hotkeys.rs:232-240`, `window.rs:152-160`) or the focus-prompt hotkey **⌘⇧D**, which also shows and focuses (`window.rs:137-143`, `hotkeys.rs:223-231`) | Yes — the button's `title` interpolates the combo (`StatusBar.tsx:84`). **After hiding, nothing on screen names it** |
| Quit | **No in-app path.** `close_app` (`window.rs:236-240`) is not exported by `ipc/commands.ts:9-44` and has no caller. HUD has `decorations(false)` (`window.rs:91`); the launcher is a normal decorated window, so closing it is the only door. No tray, no autostart, no single-instance plugin (`docs/redesign/00-repo-map.md:255`) | n/a |

Steps that require knowing a hotkey **not visible on screen at that moment**: invoke (PTT), cancel a
recording, scroll the chat, move/resize the window, opacity, quick actions 1…9, duplicate chat,
teleprompter open, focus prompt, auto-answer, region screenshot, and un-hiding a hidden window.
That is **12 of the app's 17 registered actions** (`hotkeys.rs:159-313`).

---

## Problems

### P0 — blocks a new user reaching daily use unaided

**P0-1 · The product is never explained anywhere in the product.**
First frame is «Загрузка…» (`LauncherApp.tsx:67`); first screen is a prerequisites checklist headed
«Что нужно для запуска» (`StartScreen.tsx:174`) under a description «Что нужно сделать до запуска»
(`screens.ts:31`). No screen states that the app captures the other party's audio, transcribes it,
and answers. A user who did not read the landing page cannot tell what they are configuring.

**P0-2 · The access code — the intended fast path — is an unlabelled, unexplained, unobtainable
token.** `autoFocus` puts the caret in a field whose only description is
`placeholder="XXXXX-XXXXX-XXXXX-XXXXX"` (`AccessCodeForm.tsx:38`, `StartScreen.tsx:101`). No label,
no "what is this", no "where to get one" — while the *slower* path (own keys) gets two «Где взять»
buttons (`ApiKeysSection.tsx:63-71`). The only explanatory sentence lives on a settings tab the user
has not opened (`ApiKeysSection.tsx:45`).

**P0-3 · macOS audio permission requires two presses of «Выдать» and the UI says nothing.**
`request_permission` returns `Denied` while the TCC dialog is still open (`permissions.rs:111-119`,
`CLAUDE.md:396`); the chip flips to «нужно сделать» under the user's cursor. The re-probe is real and
works, but is indistinguishable from a failed grant. The one sentence explaining it
(`PermissionsScreen.tsx:100`) is on a different screen.

**P0-4 · Push-to-talk is never taught, and after Launch the screen that teaches it is gone.**
`hotkeys.rs:164` «Удерживайте, пока говорит собеседник.» is reachable from Настройки → Клавиши
(destroyed by `swap_to_main_window`, `window.rs:197-199`) and from an unlabelled keyboard icon
(`HotkeysPopover.tsx:65`). The HUD's empty state says «Чат появится здесь»
(`AnswerPanel.tsx:285`) and the composer says «Расшифровка появится здесь — или напиши вопрос сам»
(`Composer.tsx:136`) — both describe an outcome with no instruction for causing it.

**P0-5 · "Am I being listened to?" is unanswerable.** `buffer_enabled: true` by default
(`bindings.ts:61`) means a continuous RAM ring buffer runs the whole session
(`app_state.rs:104`, `window.rs:203`). Its only surface is a switch labelled «Фоновый буфер» with
the hint «Подхватывает сказанное за секунды до нажатия записи.» (`SttSection.tsx:108`) on the Речь
tab. The HUD's only state indicator is a 5-bar equaliser that is `aria-hidden`, has no text, and
whose `barClass` encodes four different states in colour alone (`StatusBar.tsx:55-64`,
`EqBars.tsx:13`). There is no way to pause listening from the HUD without opening the launcher.

### P1

**P1-1 · Windows + auto mode = an unlaunchable app with a contradictory «Старт» and a blocker that
routes to a hidden screen.** `useLauncherReadiness.ts:47,56` computes the microphone blocker on both
platforms; `screens.ts:62` hides the Доступы screen on Windows; `start-steps.ts:50` therefore omits
the step. Result: «Всё готово — можно запускать.» (`StartScreen.tsx:31`) beside a disabled Launch
button, a header reading «Нет доступа к микрофону — его требует автослушание», and a click that
lands on a card headed «Разрешения macOS» (`PermissionsScreen.tsx:99`).

**P1-2 · The launcher has no offline state; a redeem with no network shows a raw English reqwest
error.** `access.rs:61,64` → `ipc/commands.ts:99` → `AccessCodeForm.tsx:53`. Contrast the HUD's
`ConnectivityOverlay` (`App.tsx:883`).

**P1-3 · There is no way to quit.** `close_app` unused (`window.rs:236-240` vs
`ipc/commands.ts:9-44`); HUD frameless (`window.rs:91`); no tray.

**P1-4 · LLM failures have one truncated header line and no retry.** `showError` requires
`state === "idle"` (`StatusBar.tsx:78`), so an error during a recording is dropped entirely;
`showRetry` is STT-only (`App.tsx:157,163`); the only recovery is a hover-revealed «Переотправить»
(`AnswerPanel.tsx:166`).

**P1-5 · «Неверный ключ Anthropic — проверь в настройках» / «Неверный ключ Groq — проверь в
настройках» point at a window that no longer exists** (`llm.rs:49`, `stt.rs:24`, `window.rs:197-199`).
Nothing tells the user that «Стоп» is the way back to those settings.

**P1-6 · «Проверить» silently raises a system permission prompt and needs a working Groq key.**
`audio_check.rs:69-71,108-109,131-134`; the button is on «Старт» above the still-unfinished access
step (`StartScreen.tsx:174-191`).

**P1-7 · Screen recording is an optional permission with a real hotkey and no discovery path.**
`permission-rows.ts:44-49` («Без неё работает всё остальное»), never on «Старт», while ⌘⇧A is
registered from the moment the HUD opens (`hotkeys.rs:205-213`, `window.rs:111`). The failure is a
`screenshot-error` in the truncated header line. The permission also only refreshes on «Проверить
заново» (`PermissionsScreen.tsx:93`).

**P1-8 · The built-in interview presets — the actual product content — never reach a new chat.**
`config/presets.json` ships `golang` and others; `NEW_CHAT_DEFAULTS.presetId = ""`
(`lib/chats.ts:53`); the selector is behind a `SlidersHorizontal` icon (`Composer.tsx:251-262`).
The first answer a new user sees is generic Haiku.

### P2

**P2-1 · The sidebar has no labels at any width** (`Sidebar.tsx:76`, `CLAUDE.md:400`). Six icons,
meaning only in `title`. Half the app (Контексты, Пресеты, Доступы, Обновления) lives behind them.

**P2-2 · Autosave is invisible.** 600 ms debounce (`LauncherPanel.tsx:22,105-114`); the only
feedback is the header status flicking to «Сохраняю…» (`LaunchBar.tsx:18`). No "saved" state.

**P2-3 · The screen description truncates to one line by design** (`ScreenShell.tsx:20-25`,
`CLAUDE.md:412`), so the longest explanations in the app are only readable as tooltips.

**P2-4 · The search input under-promises.** Labelled «Поиск по настройкам» (`LauncherSearch.tsx:12`)
while indexing screens, hotkeys, permission rows, API keys, presets, quick actions and library docs
(`search.ts`). And it has no keyboard entry by design (`CLAUDE.md:410`).

**P2-5 · Chat tab close is a hover secret** (`ChatTabs.tsx:75-90`): the `×` only appears on the
*active* tab on hover, and clicking an active tab closes rather than selects.

**P2-6 · The audio-check verdict names a fix it does not offer.** «Проверьте устройство…»
(`AudioCheckCard.tsx:16`) with no link to `SttSection.tsx:45`.

**P2-7 · Quick actions ship enabled but their digit hints depend on a modifier the user never sees
configured** (`QuickActionsBar.tsx:58`, `lib/quick-actions.quickActionHint`, `hotkeys.rs:214-222`).

**P2-8 · `screen_share_visible: false` is the most consequential default in the app and is stated
once, on the Поведение tab** (`BehaviorSection.tsx:27`). The HUD's eye icon shows the state but not
that it is the default (`ScreenShareIndicator.tsx:4-7`).

### P3

**P3-1 · Mixed address forms** — «вы» in the launcher (`AudioCheckCard.tsx:16`,
`PermissionsScreen.tsx:100`) vs «ты» in backend errors and the HUD (`stt.rs:24`, `llm.rs:49`,
`ConnectivityOverlay.tsx:4`, `Composer.tsx:136`).

**P3-2 · Untranslated / invented vocabulary**: `Thinking` (`Composer.tsx:78`), «Препромпт»
(`Composer.tsx:223`), «Суфлёр» (`hotkeys.rs:289`), «Прокси» (`access.rs:15,17`).

**P3-3 · The window title is `Audio System` in both windows** (`launcher.html:6`, `index.html:6`,
`window.rs:33-35`) — deliberate, but it means the macOS window menu and the Windows taskbar never
show the brand the user bought.

**P3-4 · `DEFAULTS_NOTE` shares a card with the Launch button** (`StartScreen.tsx:193-207`), so the
primary action of the screen sits next to a paragraph about settings the user was told to ignore.

---

## Opportunities

1. **Turn «Старт» into a first-run narrative and keep it as a checklist afterwards.** The step list
   is already derived (`start-steps.ts:65-70`) and the three states already exist — adding a
   one-paragraph "what this does / what happens when you press Запустить" above the card costs
   nothing structurally and closes P0-1 and P0-4 at once.
2. **Give the access code a label, a one-line explanation, and a «Где взять» button** symmetric with
   the API-key rows (`ApiKeysSection.tsx:63-71` is the exact pattern to copy). Closes P0-2.
3. **Make the audio row's second press explicit.** The repeat probe already works
   (`permissions.rs:118`); the row can say «Разрешили в окне macOS? Нажмите ещё раз» when
   `state === "denied" && flag`. Closes P0-3 without touching the fixed geometry rule
   (`CLAUDE.md:396`).
4. **Teach PTT where it is used.** The HUD's empty state (`AnswerPanel.tsx:278-289`) is a free
   canvas: render `effectiveCombo(hotkeys,"record")` plus the registry's own hint
   (`hotkeys.rs:164`) there. `HotkeysPopover` already has all the rendering primitives
   (`ComboChip`, `HotkeysPopover.tsx:50-58`).
5. **Give "listening" a word, not just a colour.** `StatusBar.tsx:55-64` already branches on four
   states; a text label beside the equaliser (and an `aria-live` region instead of `aria-hidden`)
   makes the buffer, PTT and auto mode legible. Pair it with a buffer on/off control in the HUD.
6. **Fix the Windows microphone dead end** by deriving the blocker from the same
   `requiredPermissionRows` + `screenVisible` gate the steps use — or by making the permissions
   screen platform-aware rather than platform-absent. (`useLauncherReadiness.ts:47`,
   `start-steps.ts:50`, `screens.ts:62`.)
7. **Reuse `useConnectivity` in the launcher.** It is window-agnostic (`useConnectivity.ts:11-49`);
   mounting it in `LauncherApp` gives redeem a human offline state instead of a reqwest string.
8. **Preselect a shipped preset for the first chat**, or surface a preset chooser in the HUD's empty
   state. The merge helper already exists (`lib/presets.mergePresets`, used in
   `LauncherPanel.tsx:58`).
9. **Add one quit affordance.** `close_app` is already a registered command (`window.rs:236-240`) —
   it needs an export in `ipc/commands.ts` and a button (or a confirm) in the HUD header.
10. **Route error messages that name settings to the settings.** The error codes are already typed
    (`lib/errors.ts:1-10`); `badApiKey` could render an action that calls `stopMainWindow()` and
    lands the launcher on `settings/access` — the destination type already exists
    (`features/launcher/contract.ts` `LauncherDestination`).
11. **Promote the audio check to the definition of "ready".** It is the only surface that proves the
    whole chain (device → tap → Groq) works (`audio_check.rs:25-34`), and it is currently optional
    and unlabelled as such.
12. **Sidebar labels at ≥900px.** The precedent and the exact breakpoint already exist for the
    nested rail (`SettingsTabsRail.tsx:32,45,55`); the "two text columns" objection
    (`CLAUDE.md:400`) applies to the settings screen specifically, not to every screen.

---

## Open questions for the human

1. **Who is the access code for, and where does a user get one?** Is it sold, given out, or
   bundled? The app has no acquisition path and the relay is a separate repo — should the launcher
   link somewhere, or is the code always delivered out of band?
2. **Which path is the intended default — code or keys?** `autoFocus` says code
   (`StartScreen.tsx:101`), the settings tab lists both as equals (`ApiKeysSection.tsx:43`), and the
   readiness gate treats them as interchangeable (`lib/api-keys.ts:39-42`).
3. **Should the launcher survive behind the HUD instead of being destroyed?** Destroying it
   (`window.rs:197-199`) is what makes every "проверь в настройках" message a dead end. Is the
   destruction load-bearing (memory, hotkey scoping, the disguise) or incidental?
4. **Is auto mode meant to become the default way in?** It is the product's differentiator, ships
   `false` (`bindings.ts:61`), is two levels deep under a tab called «Речь», and is the only thing
   that needs the microphone.
5. **Is the always-on background buffer something the user is supposed to be aware of?** It is on by
   default and never surfaced outside a settings row. Should the HUD show it, and should there be a
   HUD-level pause?
6. **How is the app supposed to be quit?** No tray, no HUD close, `close_app` unused. Is
   "leave it running, hide it with ⌘⇧H" the intended model?
7. **Should a shipped preset be preselected for a first chat?** Doing so changes the first answer
   materially and is a product decision, not a UI one.
8. **Is the region screenshot meant to be a first-class capability?** If yes, screen recording
   probably belongs on «Старт» as an optional-but-named step; if no, the hotkey arguably should not
   be registered by default.
9. **What is the intended reading of the equaliser?** Four distinct states currently map to colour
   alone (`StatusBar.tsx:55-64`). Is a text state label acceptable in the HUD's height budget?
10. **Address form** — is the split between «вы» (launcher) and «ты» (backend messages, HUD)
    intentional voice, or drift to be unified?
