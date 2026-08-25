# 02 — Design brief

Scope: the **desktop launcher** (`launcher` window) and the **colour system for the whole desktop
app**. Secondary surfaces (HUD, dialogs, tray-less notifications) adopt the new system; structural
changes there only where cheap and clearly better.

Decisions already taken by the owner at the Phase 1 boundary:

| | Decision |
| --- | --- |
| **Listening visibility** | HUD-only, done properly. A pip window is a costed follow-up, not this pass. |
| **Themes** | Full light **and** dark, following the OS. Remove the `Theme::Dark` pin. `Settings.theme` becomes `system \| light \| dark`; `gray`/`black` retire. |
| **Launcher lifetime** | Destruction on launch stays. The dead ends it creates get fixed instead. |
| **Privacy** | All three capture behaviours stay. All three get declared, the buffer gets a HUD indicator **and** a pause, the clipboard write gets a settings row. |

---

## 2.1 Design principles

**P1 · One state, one colour — and `state/listening` means exactly one thing.**
Aqua `#4ccbd1` means *audio is being captured right now*, and nothing else in the product may use it.
→ *Decision it drives:* `EqBars` stops being the brand mark. The launcher header gets a real wordmark;
the bars survive only as a capture meter. The «Проверка звука» meter — the one moment the launcher
genuinely opens a tap — switches from brand red to `state/listening`, which is where the user *learns*
the vocabulary before it matters.

**P2 · Colour is never the only carrier.**
Every state is colour **+ glyph + word**, and motion only ever as a fourth, optional layer.
→ *Decision it drives:* the readiness dots become `✓ / ! / ·` glyphs, so the fact that
`state/success` and `state/danger` are 1.2:1 apart in luminance — unavoidable for two colours that must
each clear 3:1 on the same ground, and indistinguishable to a red-green colour-blind user — stops
mattering. It also means `prefers-reduced-motion` can silence every animation without destroying a
signal, which today it does.

**P3 · Quiet at rest, loud only while capturing.**
The resting palette is warm-stone neutrals and one oxblood accent used sparingly; chromatic energy is
reserved for capture, and for failure.
→ *Decision it drives:* section headings, links, badges and chips stay neutral (an existing rule,
now enforced by the token names themselves); no screen has a coloured header; the accent appears on
exactly one control per screen — the primary action.

**P4 · First run is a conversation, not a form.**
Onboarding asks one thing per screen and says why in one sentence, rather than presenting a
prerequisites checklist and leaving the user to work out the order.
→ *Decision it drives:* four steps (three on Windows), visible progress, and the app explains what it
*is* before it asks for an API key — which today it never does, anywhere.

**P5 · Never ask twice, never ask for nothing.**
Defaults are real defaults; anything not needed for first value is skippable; a denied permission says
what will not work and lets the user continue.
→ *Decision it drives:* permission status refreshes on window focus, so the "grant in System Settings,
alt-tab back" loop resolves itself and the macOS double-press of «Выдать» disappears. The microphone
and screen-recording permissions never appear in onboarding, because neither is needed for first value.

**P6 · The window tells the truth about what it captured.**
Everything captured is declared where it happens, not only in a settings row.
→ *Decision it drives:* a dedicated privacy step naming the background buffer, the preroll and the
clipboard write; a permanent buffer indicator in the HUD; a real pause control; and a settings row for
the clipboard write that today has no UI at all.

**P7 · Registry, not markup.**
Screens, tabs, permissions, hotkeys and numeric bounds stay derived from their registries so search,
breadcrumbs, onboarding steps and readiness can never drift apart.
→ *Decision it drives:* onboarding steps derive from `PERMISSION_ROWS` and `useLauncherReadiness`, not
from a hand-written list — so marking another permission `need: "launch"` puts it into onboarding by
itself. The one hand-maintained index (`SETTINGS_ROWS`) gains the five missing auto-mode rows and a
test that fails when a section's label and its search entry drift.

---

## 2.2 Information architecture

### The new map

```
launcher window (1000×720, min 520×480 — cannot be resized by the app)
│
├─ ONBOARDING  ← shown while settings.onboarding_done === false; re-enterable from Настройки
│   ├─ 1. Что это и доступ к API      (mandatory)
│   ├─ 2. Доступ к системному звуку   (macOS only; auto-skipped on Windows)
│   ├─ 3. Что приложение слышит       (privacy; one real choice)
│   └─ 4. Готово                      (the hotkey + Запустить)
│
└─ LAUNCHER  ← after onboarding
    ├─ header:  wordmark · search · STATUS · Запустить
    ├─ sidebar: Старт · Контексты · Пресеты  ⟂  Настройки · Доступы · Обновления
    └─ screens:
        ├─ Старт      readiness home: what is left, audio check, how to use it
        ├─ Контексты  (unchanged structure, restyled)
        ├─ Пресеты    (unchanged structure, restyled)
        ├─ Настройки  7 tabs (unchanged set, restyled; 2 new rows)
        ├─ Доступы    now visible on Windows when it has anything to say
        └─ Обновления (unchanged structure, restyled)

main window (HUD) — adopts the token system; the status area gains the listening vocabulary,
                    a buffer indicator and a pause control.
```

### What is removed, merged or moved

**Nothing is removed. Nothing is merged. Nothing is moved between screens.** The IA is already
registry-driven and sound; the failures found in Phase 1 are about *presentation, onboarding and
state legibility*, not about where things live. Re-shuffling would spend the no-feature-loss budget
without buying anything.

Three **additions** and one **visibility fix**:

| Change | Why | Where |
| --- | --- | --- |
| **+ Onboarding flow** | T1 — the product never explains itself; 9–13 actions to first value | new, in the launcher window |
| **+ Row «Копировать в буфер обмена»** | T8 — every transcript and screenshot is silently copied; no UI admits it | Настройки → Поведение |
| **+ Theme value «Как в системе»** | Q2 — follow the OS | Настройки → Вид |
| **Доступы visible on Windows** when it has a row to show, retitled away from «Разрешения macOS» | T4.3 — today the Windows microphone blocker routes to a screen absent from the sidebar | `screens.ts` platform filter |

### Full old → new mapping

All **95 inventory items** from
[`analysis/01-architecture.md` §Feature inventory](analysis/01-architecture.md). "Restyled" = same
behaviour, new tokens/primitives, no structural change.

| # | Today | New home | Change |
| --- | --- | --- | --- |
| 1 | Brand: `EqBars` + `harpyhare.ai` mono/uppercase/55 % | Header, left | **Wordmark replaces the equaliser.** Real type at `--text-caption`, `text/secondary`. The bars leave the launcher header entirely (P1). |
| 2 | macOS traffic-light inset `pl-16` | unchanged | Kept; the magic number becomes a named constant. |
| 3 | Window drag by header | unchanged | Kept, incl. `data-no-drag` on the results list. |
| 4 | Search field + 8 results + keyboard + empty + overflow + index | Header, centre | Restyled. Label → «Поиск по приложению» (it indexes more than settings). Index gains the 5 missing auto-mode rows. |
| 5 | Readiness status line, 5 texts, ghost button with chevron | Header, right — **the status object** | **Redesigned** (§2.4). Autosave stops occupying the blocker's slot. |
| 6 | Status dot: muted / destructive / primary | → status object | **Glyph + colour + word** (P2). `state/success` replaces the accent for "fine". |
| 7 | «Запустить» button, disabled unless ready | unchanged position | Restyled; keeps `canLaunch` and the shared `LaunchButton`. Gains a reason when disabled. |
| 8 | Save-error banner, no retry | under header | **Gains a retry** and stops being swallowed by the next autosave. |
| 9 | Sidebar: 6 icon buttons, 3 groups, `system` pinned bottom | unchanged | **Labels at ≥900 px**, icons-only below (the settings rail's own precedent and breakpoint). |
| 10 | Active marker: 2 px accent bar + `surface-active` | unchanged | Uses `accent/indicator` (≥3:1 everywhere) instead of `accent/primary` (2.4:1). |
| 11 | Notice dot per item | unchanged | Colour + **glyph**. |
| 12 | `title` = "label — notice" | unchanged | Kept; now redundant at ≥900 px, still the only affordance below it. |
| 13 | Screen heading + description from registry | unchanged | Restyled. Description may wrap to 2 lines (today it truncates by design — P2-3). |
| 14 | Card «Что нужно для запуска» + summary | Старт | Restyled; summary keeps the 3-state logic. |
| 15 | Step «Доступ к API» + code form + «Ввести свои ключи» | Старт (+ onboarding step 1) | Restyled. The code field **gains a label and a «Где взять» affordance** (T1.2). |
| 16 | Step «Запись системного звука» + Выдать/Настройки/Все доступы | Старт (+ onboarding step 2) | Restyled; **fixed geometry preserved**; gains "the system is asking you now" copy and live refresh. |
| 17 | Step «Микрофон» (only when auto mode on) | Старт | Unchanged logic; **not** in onboarding (not needed for first value). |
| 18 | Card «Проверка звука» + live meter + 3 outcomes | Старт | Restyled. **Meter switches to `state/listening`** (P1). Outcome text gains a route to the device setting (P2-6). |
| 19 | Footer card: defaults note + Все настройки + 2nd Запустить | Старт | **Replaced by a «Как пользоваться» card** carrying the PTT hotkey (T1.3), with the actions kept. |
| 20–30 | Контексты: summary, +Материал, +Папка, Импорт, native drop, empty zones, doc rows, drag-between-folders, folder rename/delete, import error | unchanged | **Restyled only.** 605 lines of drag/IO behaviour untouched — flagged as a follow-up, not touched here. |
| 31–35 | Пресеты: own presets, row, editor, add, built-ins | unchanged | Restyled only. |
| 36 | Settings tab rail, icons <900 px | unchanged | Restyled; gains roving `tabIndex` + arrows + `aria-controls` + a real `tabpanel`. |
| 37 | Description line above each tab | unchanged | Restyled. |
| 38–41 | Ключи: token active + Отвязать, code block, Anthropic key + Где взять, Groq key + Где взять | unchanged | Restyled. |
| 42–46 | Речь: capture device, language, translate, buffer on/off, buffer depth | unchanged | Restyled. Buffer rows gain a one-line privacy note pointing at the HUD indicator. |
| 47–52 | Автослушание: enable-on-launch, instant reply, mic device, 3 sliders | unchanged | Restyled. **All five added to the search index** (T5). |
| 53–61 | Клавиши: 12 combo rows in 5 groups, capture button, reset, unassigned hint, theft note | unchanged | Restyled. Theft note gains a live region. |
| 62–66 | Действия: combination row, attachments switch, empty note, per-action name/combo/delete/prompt, Добавить + limit note | unchanged | Restyled. |
| 67–70 | Окно: 3 modifier+step pairs, theft note | unchanged | Restyled. |
| 71–74 | Поведение: screen-share, auto-send, HTML preview, teleprompter resume | unchanged | Restyled **+ one new row: «Копировать распознанный текст и снимки в буфер обмена»**. |
| 75–77 | Вид: theme, chat font size, window opacity | unchanged | Restyled. Theme gains «Как в системе». **Both sliders gain a live preview strip** (P0→P2 correction from Phase 1). Opacity min rises to 0.75 (§2.5). |
| 78–83 | Доступы: Проверить заново, explanation card, 3 rows with need/status/actions | unchanged | Restyled; **visible on Windows when it has a row**; retitled; auto-refreshing. |
| 84–91 | Обновления: version, caption, Проверить, available card, release notes, progress, error, actions | unchanged | Restyled. Release-notes markdown becomes `React.lazy` (F-P1-6: 705 KB shared chunk). |
| 92–93 | `.launcher-rise` cascade; screen/tab crossfade | unchanged | Kept, retimed to the motion tokens (§2.6). |
| 94 | Autosave, 600 ms, «Сохраняю…» in header | unchanged mechanism | **Own slot**, not the blocker's; explicit saved/failed states; failed saves retry. |
| 95 | Full-window «Загрузка…» | unchanged | Restyled; no longer the first thing a new user reads (onboarding owns first run). |
| J | 28 of 36 `Settings` fields editable; 8 not | unchanged | The 8 stay HUD-owned or Rust-internal. **`onboarding_done` and the clipboard flag are added** → 38 fields, 30 launcher-editable. |
| J | No launcher control for: quit, app-data folder, logs, reset, export/import, HUD cheat-sheet | **quit is added** | «Выйти» in Настройки (T7 — `close_app` exists and is unreachable). The rest stay out of scope. |

**No feature is lost. Nothing requires approval to remove.**

---

## 2.3 Onboarding spec

**Goal, and its only goal:** permissions, the minimum configuration, and one successful "it works"
moment. Nothing else belongs here — no tour of quick actions, no preset picking, no hotkey editing.

**Mechanics**
- Lives **inside the launcher window** (it cannot be resized by the app — §2 of the synthesis), as a
  full-window replacement for the sidebar+screen area. The header keeps the wordmark and the drag
  region; search and Launch are hidden.
- Gated by a new `Settings.onboarding_done: bool` (default `false`). Existing installs are migrated to
  `true` when any API access is already configured, so no current user is sent back through it.
- **Resumable**: progress is the settings themselves, so quitting mid-flow and returning lands on the
  first unfinished step.
- **Re-enterable**: Настройки → Ключи → «Пройти первичную настройку заново».
- Progress: `Шаг N из 4` plus a 4-segment bar. Windows shows `из 3` — step 2 is dropped from the
  registry, not skipped visually (P7: the step list derives from `requiredPermissionRows`).
- Every step except step 1 has a secondary «Пропустить» that states the consequence.
- Navigation: `Enter` = primary action, `Esc` does nothing (no accidental exit), Back on steps 2–4.

### Step 1 · Что это и доступ к API — *mandatory*

**Purpose:** tell the user what they installed, then take the one input without which nothing works.

```
┌────────────────────────────────────────────────────────────┐
│  harpyhare.ai                                  Шаг 1 из 4  │
│  ▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱                                          │
│                                                            │
│  Подсказки во время разговора                              │
│                                                            │
│  Приложение слушает звук собеседника — из звонка, встречи  │
│  или видео, — расшифровывает речь и предлагает ответ.      │
│  Окно остаётся у вас: собеседники его не видят даже при    │
│  демонстрации экрана.                                      │
│                                                            │
│  ── Код доступа ──────────────────────────────────────     │
│  Код выдаёт владелец подписки. Он заменяет оба ключа.      │
│  ┌──────────────────────────────────┐  ┌───────────────┐   │
│  │ XXXXX-XXXXX-XXXXX-XXXXX          │  │  Активировать │   │
│  └──────────────────────────────────┘  └───────────────┘   │
│                                                            │
│  У меня свои ключи Anthropic и Groq →                      │
└────────────────────────────────────────────────────────────┘
```

**Copy (final).**
- Heading: `Подсказки во время разговора`
- Body: `Приложение слушает звук собеседника — из звонка, встречи или видео, — расшифровывает речь и предлагает ответ. Окно остаётся у вас: собеседники его не видят даже при демонстрации экрана.`
- Field label: `Код доступа`
- Field hint: `Код выдаёт владелец подписки. Он заменяет оба ключа.`
- Primary: `Активировать` → while pending `Активирую…`
- Secondary: `У меня свои ключи Anthropic и Groq →` (expands the two key fields inline, each with its
  existing «Где взять» link — the same components as `ApiKeysSection`)
- Errors: the typed `AppError.message` verbatim; **plus** an offline state — `useConnectivity` is
  mounted in the launcher for the first time, so «Нет соединения — проверьте интернет и повторите»
  replaces the raw `reqwest` string (T7).

**Edge cases.** Empty input → primary disabled. Invalid code → inline error under the field, field
keeps focus and its text. Already-configured (re-entry) → the step renders as done with
«Доступ уже настроен» and the primary becomes `Дальше`. No network → primary disabled with the offline
line.

### Step 2 · Доступ к системному звуку — *macOS only, skippable*

**Purpose:** the one OS permission required for the product to work at all.

```
┌────────────────────────────────────────────────────────────┐
│  harpyhare.ai                                  Шаг 2 из 4  │
│  ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱                                          │
│                                                            │
│  Разрешите записывать системный звук                       │
│                                                            │
│  Без этого приложение не услышит собеседника — оно берёт   │
│  звук, который macOS отдаёт в наушники или колонки.        │
│  Микрофон при этом не включается.                          │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ·  Запись системного звука        не выдан           │  │
│  │                                                      │  │
│  │    [ Разрешить ]   [ Открыть настройки macOS ]       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  Пропустить — настроить позже                     [Дальше] │
└────────────────────────────────────────────────────────────┘
```

**Copy (final).**
- Heading: `Разрешите записывать системный звук`
- Body: `Без этого приложение не услышит собеседника — оно берёт звук, который macOS отдаёт в наушники или колонки. Микрофон при этом не включается.`
- Status chip: `не выдан` (·) / `система спрашивает…` (·) / `выдан` (✓) / `отказано` (!)
- Primary: `Разрешить` → `Запрашиваю…`
- Secondary: `Открыть настройки macOS` → `open_permission_settings("audio")`
- Skip: `Пропустить — настроить позже`
- Denied state adds: `Пока доступа нет, приложение не сможет расслышать собеседника. Выдать его можно в любой момент на экране «Доступы».`

**The TCC asynchrony is solved here, not papered over.** `request_permission` returns `denied` while
the system dialog is still open. So: on press, the chip goes to `система спрашивает…` and stays there;
`permissions_status` is then polled every 700 ms for up to 30 s **and** re-queried on `tauri://focus`.
The moment it returns `granted` the step **auto-advances**. The user never presses «Разрешить» twice.
Row geometry stays fixed across every state (the existing invariant — the button must not move under a
finger).

**Edge cases.** Granted before arriving → renders done, auto-advances after 400 ms. Denied at the OS
level → the denial copy plus both buttons stay live («Разрешить» re-probes, which legitimately catches
"allowed after the command already returned"). Skipped → step 4 shows a warning line instead of the
ready line. On Windows this step does not exist and the counter reads `из 3`.

### Step 3 · Что приложение слышит — *skippable, one real choice*

**Purpose:** the honest privacy declaration, and the one genuine default worth asking about.

```
┌────────────────────────────────────────────────────────────┐
│  harpyhare.ai                                  Шаг 3 из 4  │
│  ▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱                                          │
│                                                            │
│  Что приложение слышит и когда                             │
│                                                            │
│  ●  Пока вы держите клавишу записи — звук уходит на        │
│     расшифровку. Это единственный момент, когда что-то     │
│     покидает компьютер.                                    │
│  ●  Фоновый буфер держит последние секунды звука в         │
│     памяти, чтобы не терять начало фразы. На диск он не    │
│     пишется и стирается, когда вы его выключаете.          │
│  ●  Расшифровка и снимки экрана копируются в буфер         │
│     обмена, чтобы их можно было вставить куда угодно.      │
│  ●  Микрофон включается только в автослушании — оно        │
│     выключено.                                             │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Фоновый буфер                              [ ●——  ]  │  │
│  │ Подхватывает сказанное за секунды до нажатия.        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  Слушание видно в окне и ставится на паузу одной кнопкой.  │
│                                            [Дальше]        │
└────────────────────────────────────────────────────────────┘
```

**Copy (final)** — heading `Что приложение слышит и когда`; the four bullets verbatim as above; the
toggle row label `Фоновый буфер` with hint `Подхватывает сказанное за секунды до нажатия.`; the closing
line `Слушание видно в окне и ставится на паузу одной кнопкой.`; primary `Дальше`.

Bullet 3 is the first time in the product's life that the clipboard write is admitted (T8). The toggle
writes `buffer_enabled` through the ordinary `set_settings` path — no new mechanism.

**Edge cases.** Toggling the buffer off here is honoured immediately (`apply_buffer_settings_change`
already clears the ring). No skip link — the step *is* the disclosure — but `Дальше` is always enabled,
so it costs one keypress.

### Step 4 · Готово — *the "it works" moment*

**Purpose:** hand over exactly one thing to remember, and launch.

```
┌────────────────────────────────────────────────────────────┐
│  harpyhare.ai                                  Шаг 4 из 4  │
│  ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰                                          │
│                                                            │
│  Всё готово                                                │
│                                                            │
│           ┌───────────────────────────────┐                │
│           │            ⌘ R                │                │
│           │  удерживайте, пока говорит    │                │
│           │        собеседник             │                │
│           └───────────────────────────────┘                │
│                                                            │
│  Отпустите — расшифровка попадёт в поле ввода. Остальные   │
│  сочетания перечислены в окне по кнопке с клавиатурой.     │
│                                                            │
│  ✓ Доступ к API      ✓ Системный звук                      │
│                                                            │
│  Открыть настройки                        [▶ Запустить]    │
└────────────────────────────────────────────────────────────┘
```

**Copy (final).** Heading `Всё готово`. The combo comes from `effectiveCombo(settings.hotkeys, "record")`
formatted per platform — **never a literal** (P7). Caption `удерживайте, пока говорит собеседник` is
`hotkeys.rs`'s own `hint` for the `record` action, so the two can't drift. Body:
`Отпустите — расшифровка попадёт в поле ввода. Остальные сочетания перечислены в окне по кнопке с клавиатурой.`
Primary `Запустить`; secondary `Открыть настройки`.

If step 2 was skipped or denied, the checklist line becomes
`! Системный звук — не выдан. Приложение не расслышит собеседника.` and the primary becomes
`Всё равно запустить`, with «Выдать доступ» offered as the recommended action.

**Ends by dropping the user into the launcher in a ready state** — pressing Запустить runs the existing
`launch_main_window`, and the HUD opens with its composer focused and its empty state showing the same
hotkey card (T1.3: the HUD's empty state stops describing an outcome and starts teaching the cause).

### Step count against the definition of done

macOS: **4 onboarding steps → Запустить → hold ⌘R = first value.** That is 5 steps with zero
documentation. Windows: 3 steps. Today's equivalents are 9 and 6 *actions* with no explanation at all.

---

## 2.4 Launcher spec

### The three questions

| Question | Answered by |
| --- | --- |
| **Is it listening?** | The header **status object**. In the launcher the honest answer is normally *no* — «Не слушает» — because the launcher captures nothing. The exception is «Проверка звука», which opens a real tap; during it the status object and the meter both go `state/listening`. That is deliberately where the vocabulary is taught. |
| **What is it doing / suggesting?** | The same object's second line: the first blocker in words, or «Всё готово», or «Сохраняю…» in its own slot. |
| **What can I do next?** | One primary action: **Запустить**. Never more than one accent-filled control on screen. |

### Layout — default 1000×720

```
┌────────────────────────────────────────────────────────────────────────────────┐
│●●●   harpyhare.ai        ┌──────────────────────┐    ✓ Всё готово   ┌─────────┐│ h-9
│                          │ Поиск по приложению  │      к запуску    │▶Запустить││ drag
│                          └──────────────────────┘                   └─────────┘│
├────────────────────────────────────────────────────────────────────────────────┤
│┌────────────┐ ┌──────────────────────────────────────────────────────────────┐ │
││ ▶ Старт    │ │ Старт                                                        │ │
││ ▤ Контексты│ │ Что нужно сделать до запуска. Остальное настроено.           │ │
││ ▣ Пресеты  │ ├──────────────────────────────────────────────────────────────┤ │
││            │ │ ЧТО НУЖНО ДЛЯ ЗАПУСКА              Всё готово — можно        │ │
││            │ │                                     запускать.               │ │
││            │ │ ┌──────────────────────────────────────────────────────────┐ │ │
││            │ │ │ ✓  Доступ к API                              готово      │ │ │
││            │ │ │    Запросы уходят от вашего имени.                       │ │ │
││            │ │ ├──────────────────────────────────────────────────────────┤ │ │
││            │ │ │ ✓  Запись системного звука                   готово      │ │ │
││            │ │ └──────────────────────────────────────────────────────────┘ │ │
││            │ │ ПРОВЕРКА ЗВУКА                                               │ │
││            │ │ ┌──────────────────────────────────────────────────────────┐ │ │
││            │ │ │ Системный звук   ▁▂▅▇▅▂▁ (aqua)      [ Проверить ]       │ │ │
││ ⚙ Настройки│ │ │ Расслышала: «…»                                          │ │ │
││ 🛡 Доступы │ │ └──────────────────────────────────────────────────────────┘ │ │
││ ⬇ Обновления│ │ КАК ПОЛЬЗОВАТЬСЯ                                            │ │
│└────────────┘ │ ┌──────────────────────────────────────────────────────────┐ │ │
│               │ │  ⌘R  удерживайте, пока говорит собеседник                │ │ │
│               │ │  Все сочетания → Настройки · Клавиши      [Все настройки]│ │ │
│               │ └──────────────────────────────────────────────────────────┘ │ │
│               └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

Zones: **header** `h-9`, drag region, macOS traffic-light inset · **sidebar** `w-40` at ≥900 px
(icon + label), `w-10` below · **screen** `ScreenShell` heading + description, then a scrolling column
of `SettingGroup` cards.

### Layout — smallest sensible size 520×480

```
┌──────────────────────────────────────────┐
│●●● harpyhare.ai            ✓  ┌─────────┐│  search collapses to an icon;
│                               │▶Запустить││  status collapses to glyph + tooltip
├──────────────────────────────────────────┤
│┌──┐ ┌──────────────────────────────────┐ │
││▶ │ │ Старт                            │ │  sidebar → icons only (w-10)
││▤ │ ├──────────────────────────────────┤ │  screen description wraps or hides
││▣ │ │ ✓ Доступ к API        готово     │ │  setting rows stack: label above
││  │ │ ✓ Системный звук      готово     │ │  control (SettingRow's 14rem
││⚙ │ │ ─────────────────────────────────│ │  column drops below 640px)
││🛡│ │ ⌘R удерживайте, пока говорит…    │ │
││⬇ │ └──────────────────────────────────┘ │
│└──┘                                      │
└──────────────────────────────────────────┘
```

Breakpoints: **900 px** — sidebar labels and the settings tab-rail labels (existing, calculated
threshold, reused). **640 px** — `SettingRow` switches from a two-column grid to stacked; the header's
search collapses to an icon button that opens the field over the header.

**Pinned / always-on-top does not apply** — that is the HUD's property, and the launcher cannot be
resized or repositioned by the app at all.

### The status object

Replaces the truncated caption. Colour + glyph + word, always all three.

| Situation | Glyph | Colour | Line 1 | Line 2 |
| --- | --- | --- | --- | --- |
| Ready | `✓` | `state/success` | Всё готово | к запуску |
| Blocker | `!` | `state/danger` | *blocker label* | нажмите, чтобы исправить → |
| Checking | `·` | `text/muted` | Проверяю доступы | — |
| Launching | `▶` | `accent/indicator` | Запускаю окно | — |
| **Audio check running** | `((•))` | **`state/listening`** | Слушаю | проверка звука |
| Saving | `·` | `text/muted` | Сохраняю | *(own slot, never replaces a blocker)* |
| Save failed | `!` | `state/danger` | Не удалось сохранить | Повторить |

Blocker and save-failed are buttons; the rest are `role="status"` with `aria-live="polite"` — the first
live region the app has ever had.

### Designed states for the launcher

- **Empty** — Контексты and Пресеты keep their existing empty states, restyled; «Старт» has no empty
  state (it always has at least the access step).
- **Loading** — the full-window «Загрузка…» becomes a skeleton of the real layout (header + sidebar +
  one card) so the window does not visibly re-flow when settings arrive.
- **Error** — the save-error banner gains `Повторить`; a launch failure shows the same banner; a redeem
  failure stays inline under its field; a network failure shows a dedicated offline line (the launcher
  gains `useConnectivity`, which today is HUD-only).
- **Paused** — not a launcher state (nothing is captured here) except during the audio check, which has
  its own «Слушаю» state and can be stopped.

### Keyboard

- Real tabs: roving `tabIndex`, `←/→` (sidebar `↑/↓`), `Home`/`End`, `aria-controls`, and a
  `role="tabpanel"` that receives focus on activation — turning **14 tab stops into 2**.
- A `sr-only` skip link before the sidebar.
- Every shortcut visible: the «Как пользоваться» card on Старт carries the PTT combo; Настройки →
  Клавиши lists all 12 combo actions; the HUD keeps its popover. **No new hardcoded combos** — the
  launcher search still has no shortcut, by the project's own standing rule.
- Focus: one treatment everywhere — a **2 px `focus/ring` ring plus a 2 px offset in the surface
  colour**. The offset is what makes one ring colour work on every fill, including the accent and
  danger fills, where a flush ring cannot reach 3:1 against both the control and its surround.

### Other surfaces

| Surface | Change |
| --- | --- |
| **HUD** | Adopts every token. `StatusBar` gains the listening vocabulary (§2.6), a **pause control** and a **buffer indicator**. `EqBars` splits into `CaptureMeter` (aqua, HUD) and the launcher wordmark. Errors gain a live region and LLM errors gain retry + a route back to settings. Empty state teaches the PTT combo. |
| **Dialogs / popovers / tooltips** | Retokenised. `bg/overlay` scrim replaces `bg-black/55`. The dead `tooltip.tsx` is either adopted (replacing 63 native `title=`) or deleted — **decided in stage 2, flagged, not assumed**. |
| **Teleprompter / PreviewPanel** | Retokenised only (`bg-black/85` → `bg/overlay`, `bg-white` → a named `--surface-preview`). Structural work flagged as follow-up. |
| **Tray / notifications** | Do not exist and are not added (owner decision Q1). |

---

## 2.5 Colour palette

### Source of truth

**`apps/desktop/src/index.css`** stays the single source. Structure changes:

- Tokens are declared on `:root` (light) and re-declared under **both** `@media (prefers-color-scheme: dark)`
  guarded as `:root:not([data-theme="light"])` **and** `:root[data-theme="dark"]`, so "system" works and
  an explicit choice wins in both directions.
- `@theme inline` maps them to Tailwind utilities exactly as today.
- **Borders become opaque neutrals, not white-alpha.** This is the single change that makes a light
  theme mechanically possible — a `oklch(1 0 0 / 10%)` hairline cannot be retinted for a light ground.
- The undocumented 16-step alpha ladder collapses into named tokens; the 12 free `oklch()` literals and
  the four shadow colours are re-derived from them.
- **After implementation: zero hardcoded colours in components.** Today's four survivors
  (`PreviewPanel` `bg-white`, `AttachmentChip` `bg-black/75 text-white`, `Teleprompter` `bg-black/85`,
  `dialog` `bg-black/55`) become `--surface-preview`, `--scrim-chip`, `--bg-overlay`, `--bg-overlay`.

### The tokens

Every value below was chosen by search against the contrast requirements and then **verified: 196
checks across both themes, 0 failures, and every token inside the sRGB gamut** (chroma is clamped to
the gamut boundary so nothing is silently gamut-mapped by the browser). The validator ships as
`apps/desktop/scripts/check-contrast.mjs` and runs in `npm test`.

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--bg-base` | `#110f0e` `oklch(0.17 0.005 40)` | `#f4efed` `oklch(0.955 0.006 40)` | launcher window ground |
| `--bg-surface` | `#1c1917` `oklch(0.215 0.006 40)` | `#fefbfa` `oklch(0.99 0.004 40)` | cards, setting groups |
| `--bg-elevated` | `#272221` `oklch(0.258 0.007 40)` | `#fffdfc` `oklch(0.995 0.002 40)` | popovers, menus, dialogs |
| `--bg-inset` | `#0b0808` `oklch(0.14 0.005 40)` | `#ebe4e2` `oklch(0.925 0.008 40)` | input wells, code blocks |
| `--bg-overlay` | `oklch(0.11 0.004 40 / 72%)` | `oklch(0.25 0.01 40 / 45%)` | modal scrim, teleprompter |
| `--hud-base` | `#201d1c` `oklch(0.235 0.005 40)` | `#f8f3f2` `oklch(0.968 0.005 40)` | HUD shell (takes `--app-opacity`) |
| `--hud-surface` | `#2d2928` `oklch(0.285 0.006 40)` | `#fefcfb` `oklch(0.9925 0.003 40)` | HUD cards, composer |
| `--hud-elevated` | `#363230` `oklch(0.32 0.007 40)` | `#fffdfc` `oklch(0.995 0.002 40)` | HUD popovers |
| `--border-subtle` | `#34312f` `oklch(0.315 0.006 40)` | `#dcd6d3` `oklch(0.88 0.008 40)` | separators, card hairlines |
| `--border-strong` | `#837c79` `oklch(0.592 0.01 40)` | `#867d7a` `oklch(0.598 0.012 40)` | input boundaries (**≥3:1 on every surface**) |
| `--text-primary` | `#f4efed` `oklch(0.955 0.006 40)` | `#261f1c` `oklch(0.245 0.012 40)` | body, headings |
| `--text-secondary` | `#bfb9b7` `oklch(0.79 0.008 40)` | `#59504e` `oklch(0.44 0.012 40)` | hints, descriptions |
| `--text-muted` | `#a29b99` `oklch(0.695 0.008 40)` | `#6c6360` `oklch(0.508 0.012 40)` | captions, placeholders |
| `--text-inverse` | `#1a1513` `oklch(0.2 0.01 40)` | `#fdf9f8` `oklch(0.985 0.004 40)` | text on light chips in dark mode |
| `--accent-primary` | `#bd4049` `oklch(0.55 0.16 20)` | `#a52333` `oklch(0.475 0.165 20)` | the one primary action, per screen |
| `--accent-hover` | `#a6333d` `oklch(0.495 0.15 20)` | `#8f0b24` `oklch(0.415 0.16 20)` | hover/active on the above |
| `--accent-subtle` | `#411e1f` `oklch(0.285 0.055 20)` | `#fbe3e2` `oklch(0.935 0.026 20)` | tinted wash behind accent content |
| `--accent-on` | `#fef7f5` `oklch(0.98 0.008 30)` | `#fef9f8` `oklch(0.985 0.006 30)` | text on an accent fill |
| `--accent-indicator` | `#e66d71` `oklch(0.68 0.15 20)` | `#950d27` `oklch(0.43 0.165 20)` | small accent marks (active-tab bar, markers) |
| `--state-listening` | `#4ccbd1` `oklch(0.775 0.11 200)` | `#007176` `oklch(0.498 0.085 200)` | **audio is being captured right now** |
| `--state-listening-dim` | `#348f94` `oklch(0.6 0.085 200)` | `#3b8e92` `oklch(0.598 0.08 200)` | armed-but-idle (buffer running) |
| `--state-processing` | = `--text-secondary` | = `--text-secondary` | **deliberately neutral** — see below |
| `--state-success` | `#51bd6f` `oklch(0.715 0.15 150)` | `#007533` `oklch(0.49 0.136 150)` | granted, done, ready |
| `--state-warning` | `#fac25b` `oklch(0.845 0.135 80)` | `#926700` `oklch(0.545 0.113 80)` | degraded, optional-missing |
| `--state-danger` | `#ff735f` `oklch(0.72 0.175 30)` | `#ae170a` `oklch(0.48 0.185 30)` | blockers, errors, destructive |
| `--focus-ring` | `#57baea` `oklch(0.75 0.115 232)` | `#00729b` `oklch(0.52 0.106 232)` | the only focus treatment |

**Why `--accent-indicator` exists.** No single accent can be both a fill that carries light text at
4.5:1 *and* a small graphical mark at 3:1 against the HUD's lightest surface — the two requirements pull
its luminance in opposite directions, and that is exactly why today's `--primary` measures 1.57–2.71:1
in every indicator role. Splitting the role is the fix the a11y audit recommended, and it costs one
token.

**Why `--state-processing` is neutral.** Six chromatic states would not be calm, and processing is the
one state that is always accompanied by moving text («Распознаю…», the answer streaming in). Its
carrier is motion + word. This leaves exactly one chromatic capture signal — aqua — which means
precisely "your audio is being captured", in every mode, in both windows. That single fact is the whole
answer to *"am I being listened to?"*

### Measured contrast

Full matrix in the validator; headline values:

| Pair | Dark | Light | Need |
| --- | --- | --- | --- |
| `text-primary` on `bg-base` | 16.76:1 | 14.22:1 | 4.5 |
| `text-secondary` on `bg-surface` | 9.03:1 | 7.60:1 | 4.5 |
| `text-muted` on `bg-surface` | 6.40:1 | 5.68:1 | 4.5 |
| `text-muted` on `hud-elevated` (worst text case) | 4.64:1 | 5.77:1 | 4.5 |
| `accent-on` on `accent-primary` | 4.97:1 | 6.97:1 | 4.5 |
| `state-danger` as text on `bg-surface` | 6.55:1 | 6.97:1 | 4.5 |
| `state-listening` vs `bg-base` | 9.80:1 | 5.08:1 | 3.0 |
| `state-listening` vs `hud-surface` | 7.38:1 | 5.67:1 | 3.0 |
| `accent-indicator` vs `bg-surface` | 5.65:1 | 8.62:1 | 3.0 |
| `border-strong` vs `bg-surface` | 4.27:1 | 3.90:1 | 3.0 |
| `focus-ring` vs `bg-surface` | 8.01:1 | 5.26:1 | 3.0 |

**Target: WCAG AA — 4.5:1 for text, 3:1 for UI components and graphical objects.** The type scale tops
out at 15 px, so the 3:1 large-text allowance applies to **nothing**; every text token is held to 4.5:1.

Contrast between two *state* colours is deliberately **not** a requirement: colours that must each clear
3:1 against the same ground necessarily land at similar luminance, and `success`/`danger` are
indistinguishable to a red-green colour-blind user at any luminance. That is what P2 (glyph + word,
always) is for.

### Default mode, and the OS setting

**Default: follow the OS** (`Settings.theme = "system"`). The product runs alongside meetings all day
on both kinds of desk, and the current dark-only choice is not a product decision — it is an artefact of
`window.rs:67` pinning `Theme::Dark`. Existing installs on `"gray"`/`"black"` migrate to `"dark"`, so
nobody's window changes appearance on update; only new installs get `"system"`.

### The `--app-opacity` floor — measured, not guessed

The HUD shell is translucent, so its contrast depends on the user's desktop. Measured, dark shell over
the worst case (a white desktop):

| opacity | `text-primary` | `text-muted` |
| --- | --- | --- |
| 0.20 (today's min) | **1.33:1** | **1.81:1** |
| 0.70 | 5.40:1 | **2.25:1** |
| 0.75 | ~6.4:1 | **2.6:1** |
| 0.90 (today's default) | 10.86:1 | 4.53:1 |

**Decision: the minimum rises from 0.20 to 0.75**, and the rule becomes *no text below
`text-primary` weight sits on the bare shell* — secondary and muted text live on `hud-surface`, which
is opaque. Together those two give AA at every permitted setting. `Settings::clamp` raises saved values
below 0.75 on next load, self-healing and silent. This is a one-constant change in
`settings::limits::window::OPACITY`.

### Identity — rationale

The palette's neutral is not grey. It is a **warm stone at hue 40**, the same family as the landing
page's cream ink (`oklch(0.979 0.01 39)`), which means the app finally shares a temperature with the
brand it belongs to. That single move is what separates it from every shadcn-neutral desktop app: the
current UI is a cool violet-grey at hue 285 chosen by a scaffold, and against oxblood it reads as
accidental. Warm stone against oxblood reads as chosen. It is also quieter — a warm dark is what a
room looks like at night, and this is software that sits open beside a conversation for an hour.

The accent stays **oxblood**, because it is the brand: the landing is an oxblood poster and the
wordmark lives on it. What changes is its job. Today the oxblood does five jobs — brand, ready,
recording, error and focus — and does none of them legibly, at 1.57–2.71:1 in every indicator role.
Now it does one: **the single primary action on a screen**, plus a lighter sibling for the small marks
that identify where you are. Every affirmative meaning it used to carry moves to green, every failure
to a brighter red-orange, and focus to a blue that was already in the codebase as an emergency patch
and is now a deliberate, shared, one-app-one-focus-colour decision.

The one genuinely new colour is **aqua**, and it earns its place by being the answer to the product's
hardest question. It sits almost opposite oxblood on the hue circle — 200 against 20 — so it can never
be mistaken for the brand, for an error, or for a warning; it is the colour of a level meter on audio
hardware rather than the colour of a recording light, which is the honest metaphor here, because the
app is *monitoring* rather than *recording to tape*. It is used at low chroma so it reads as a
present, steady signal rather than an alarm; it is the only chromatic thing in the interface that
moves; and it appears in exactly one circumstance — while audio is being captured. A user who learns
one colour in this product learns that one, and they learn it in the launcher's audio check, before it
ever matters in a call.

---

## 2.6 Typography, spacing, radius, elevation, motion

### Type

The five-step scale and its `cn` font-size group **survive as a mechanism** (they are the reason the
codebase has zero raw Tailwind sizes). Two values change and one step is added, because the current
working range is 2 px wide and there is no heading step.

| Token | Now | New | Size / weight / line-height | Use |
| --- | --- | --- | --- | --- |
| `--text-hint` | 10.5 | **10.5** | 10.5 / 500 / 1.35 | uppercase micro-labels, combo chips |
| `--text-caption` | 11.5 | **11.5** | 11.5 / 400 / 1.45 | hints under a row label |
| `--text-body` | 12.5 | **13** | 13 / 400 / 1.5 | every control and row label |
| `--text-chat` | var | var (10–20) | var / 400 / 1.6 | chat text only |
| `--text-title` | 15 | **16** | 16 / 600 / 1.3 | screen headings |
| `--text-display` | — | **new 22** | 22 / 600 / 1.25 | onboarding headings only |

Fonts unchanged: `--font-sans` (SF Pro Text / Segoe UI Variable Text, explicit because WebView2's
default is optically wrong), `--font-mono` for combos, versions and numerics.

### Spacing

89 % of 276 existing utilities already sit in six steps. The scale is formalised at
**2 · 4 · 6 · 8 · 12 · 16 · 24 · 32 px**, adding the two top steps the audit found missing (there is
currently nothing above 16 px, which is why screens feel dense). Section gap 24, card padding 12/10,
row gutter 16.

### Radius

`--radius: 8px` and its ladder stay (`sm` 4 / `md` 6 / `lg` 8 / `xl` 12). `--window-radius: 22px` stays
and stays coupled to Rust's `WINDOW_CORNER_RADIUS_LOGICAL_PX`; it is **renamed into the namespace** as
`--radius-window` so the three `rounded-[var(--window-radius)]` literals become `rounded-window`.

### Elevation

Four levels, re-derived from named tokens instead of the 16-step ad-hoc alpha ladder, and — critically
— **re-tinted per theme** (on light, elevation is a soft grey shadow; on dark it is a shadow plus a
top inner light).

| Level | Token | Use |
| --- | --- | --- |
| 0 | none | page ground |
| 1 | `--shadow-raise` | cards, setting groups |
| 2 | `--shadow-btn` | filled buttons |
| 3 | `--shadow-pop` | popovers, menus, search results |
| 4 | `--shadow-modal` | dialogs |

### Motion

All UI feedback ≤200 ms, per the brief.

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | entrances, most transitions |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | reversible state changes |
| `--dur-instant` | 100 ms | hover, focus, colour |
| `--dur-fast` | 150 ms | screen/tab crossfade (today's value) |
| `--dur-slow` | 200 ms | popover/dialog entrance |
| `--dur-enter` | 380 ms | `.launcher-rise` cascade only (today's value) |
| `--dur-listening` | **2200 ms** | the listening pulse |

**The listening motion**, specifically: a 2 px `state/listening` ring around the capture glyph,
`transform: scale(1 → 1.35)` with the stroke fading from 100 % to 0 % over 2200 ms, `--ease-out`,
infinite — one slow breath, not a blink. The meter bars keep the existing `scaleY` equaliser at their
current 1.1 s cadence when audio is actually arriving, so *armed* (slow ring) and *hearing sound*
(moving bars) are two different pictures.

This is a **continuous keyframe animation, not a transition**, which is what the HUD's compositing rule
actually forbids: the documented WKWebView artefact comes from opacity *transitions* that promote and
then collapse a layer on hover. `.eq-bar` and `.thinking-shimmer` have run continuously in the
transparent window for a long time without traces. No `transition-opacity` is introduced anywhere.

**Reduced-motion fallback.** Today's block silences 3 of 13 animation sources and, worse, deletes the
only listening signal. New rule: `@media (prefers-reduced-motion: reduce)` silences **every**
animation — including the five Radix primitives and the four `animate-pulse` sites that currently
escape — and the listening state falls back to a **solid filled aqua ring plus the word «Слушаю»**,
which is legible without a single moving pixel. P2 is what makes that possible.

---

## 2.7 Component inventory

**Keep + retokenise (no structural change)** — `components/ui/*` (badge, button, dialog, input, label,
popover, scroll-area, select, slider, switch, textarea, tooltip); `AnswerPanel`, `AttachmentChip`,
`ChatTabs`, `Composer`, `ConnectivityOverlay`, `HotkeysPopover`, `HtmlBlockChip`, `IconButton`,
`PreviewPanel`, `QuickActionsBar`, `SectionLabel`, `Teleprompter`, `ThinkingIndicator`,
`UpdateDialog`, `AutoTranscript`, `AutoModeIndicator`, `ScreenShareIndicator`, `AccessCodeForm`;
launcher `ContextLibraryPanel`, `HotkeyCapture`, `ScreenShell`, `SettingsTabsRail`, all nine
`sections/*`, all four `screens/*`.

**Modify**

| Component | Change |
| --- | --- |
| `features/launcher/LaunchBar.tsx` | wordmark replaces `EqBars`; status object replaces the caption; autosave gets its own slot |
| `features/launcher/Sidebar.tsx` | labels ≥900 px; roving tabIndex + arrows + `aria-controls`; glyph in the notice dot |
| `features/launcher/SettingsTabsRail.tsx` | same tabs treatment; `role="tabpanel"` on the target |
| `features/launcher/LauncherPanel.tsx` | onboarding gate; `useConnectivity`; draft adopts the clamped settings; save retry |
| `features/launcher/useLauncherReadiness.ts` | microphone blocker derived through `screenVisible` (fixes the Windows dead end) |
| `features/launcher/screens/StartScreen.tsx` | «Как пользоваться» card replaces the defaults note |
| `features/launcher/AudioCheckCard.tsx` | meter → `state/listening`; outcome routes to the device setting |
| `features/launcher/screens/PermissionsScreen.tsx` | platform-neutral title; visible on Windows when non-empty |
| `features/launcher/fields.tsx` | generated id + `htmlFor`; stacked layout <640 px; slider preview strip |
| `hooks/usePermissions.ts` | refresh on `tauri://focus` + poll while a request is pending |
| `components/StatusBar.tsx` | listening vocabulary, pause control, buffer indicator, live region, LLM retry |
| `lib/window-controls.ts` | `applyTheme` handles `system \| light \| dark` + `prefers-color-scheme` listener |
| `features/launcher/search.ts` | five auto-mode rows; label-parity test |

**New**

| Component | Purpose |
| --- | --- |
| `features/onboarding/OnboardingFlow.tsx` + `steps/*` (4) + `onboarding-steps.ts` | §2.3, steps derived from the permission registry |
| `components/Wordmark.tsx` | the brand mark that `EqBars` used to be |
| `components/CaptureMeter.tsx` | the capture indicator `EqBars` also used to be |
| `components/StateBadge.tsx` | colour + glyph + word, the one implementation of P2 |
| `components/LiveRegion.tsx` | one `role="status"` per window; every transient message routes through it |
| `features/launcher/StatusObject.tsx` | the header status |
| `apps/desktop/scripts/check-contrast.mjs` | the 196-check validator, run by `npm test` |

**Delete**

| Target | Why |
| --- | --- |
| `:root[data-theme="black"]` + `body.launcher` black overrides | the gray/black pair retires |
| `--card-foreground`, `--accent-foreground`, `--secondary`, `--secondary-foreground`, `--accent`, `--muted` | 26 % of the palette, zero or dead consumers |
| the 12 free `oklch()` literals + the 16-step ad-hoc alpha ladder in `index.css` | replaced by named tokens |
| `components/ui/badge.tsx`, `scroll-area.tsx` | zero importers, invisible to knip |
| unused `Button` sizes (`icon`, `icon-sm` are identical), the 5 dead `aria-invalid:` rule sets | dead |

`tooltip.tsx` is **not** deleted yet: it is either adopted (replacing 63 native `title=` attributes,
which in a content-protected window are drawn by the OS *outside* the protected surface — worth
checking) or removed. Decided in stage 2, reported either way.

---

## 2.8 Implementation plan

Each stage ends with `typecheck + lint + test + build` green, then one commit. Stages are sequential
unless marked parallel.

| # | Stage | Files | Risk |
| --- | --- | --- | --- |
| **1** | **Tokens.** New palette, type, spacing, radius, elevation, motion in `index.css`; theme switching for `system\|light\|dark`; migrate the 4 hardcoded classes; delete the dead tokens and the black theme. **Rust:** drop `.theme(Some(Dark))`; `theme` clamp + migration; `OPACITY.min` 0.2→0.75; `onboarding_done` + clipboard fields → `cargo test` regenerates `bindings.ts`. Ship `check-contrast.mjs`. | `index.css`, `lib/window-controls.ts`, `ipc/types.ts`, `settings.rs`, `window.rs`, `recording.rs`, `screenshot.rs`, `scripts/` | **Highest.** Touches both windows at once and regenerates the contract. Mitigation: contrast validator in CI; `contract.test.ts` catches any field drift; the landing is rebuilt and diffed. |
| **2** | **Primitives.** `button`, `input`, `switch`, `select`, `slider`, `textarea`, `dialog`, `popover`, `tooltip`(decide), + new `StateBadge`, `LiveRegion`, `Wordmark`, `CaptureMeter`. Focus ring + offset everywhere. Delete dead primitives/variants. | `components/ui/*`, 4 new components | Medium — shared by both windows; the type-scale change moves every control's height. |
| **3** | **Onboarding.** The 4 steps, real permission checks, OS deep links, live refresh, persisted progress, re-entry. | `features/onboarding/*`, `hooks/usePermissions.ts`, `LauncherPanel.tsx` | Medium — new surface, no existing behaviour displaced. Can run **parallel with 4** (disjoint files) once 2 lands. |
| **4** | **Launcher.** Header + status object, sidebar labels + real tabs, Старт incl. the how-to card, all screens/sections retokenised, `fields.tsx`, draft-adoption fix, Windows dead-end fix, search index fix, connectivity, quit. | `features/launcher/**` | Medium — 7 markup-coupled test files will need updating alongside. |
| **5** | **Secondary surfaces.** HUD `StatusBar` listening vocabulary + pause + buffer indicator + live region + LLM retry; dialogs, teleprompter, preview, updater retokenised. | `components/*`, `App.tsx` | Medium — the HUD's compositing constraints; no `transition-opacity`. |
| **6** | **Polish.** Empty/loading/error states, micro-interactions, keyboard hints, the reduced-motion sweep (all 13 sources), <640 px behaviour, `React.lazy` for release-notes markdown, `rehype-highlight` language subset. | across | Low. |

**Parallelisable:** 3 ‖ 4 after 2 lands (disjoint file sets: `features/onboarding/**` vs
`features/launcher/**`, with `LauncherPanel.tsx` owned by 4 and integrated by me). Everything else is
sequential because stage 1 defines the vocabulary the rest consume.

**Rust changes — the complete list, nothing else.** All are in stage 1.

1. `window.rs:67` — remove `.theme(Some(tauri::Theme::Dark))` *(unblocks the OS theme; owner-approved)*
2. `settings.rs` — `theme` clamp to `system|light|dark` + migration from `gray|black` → `dark`
3. `settings.rs` — `limits::window::OPACITY.min` 0.2 → 0.75
4. `settings.rs` — new `onboarding_done: bool` (default `false`, migrated to `true` when access exists)
5. `settings.rs` + `recording.rs` + `screenshot.rs` — new `copy_results_to_clipboard: bool`
   (default **`true`**, preserving today's behaviour) guarding the two clipboard writes

Items 2–5 regenerate `bindings.ts` via `cargo test`; CI's `git diff --exit-code` check is satisfied by
committing the regenerated file. **Item 5 is the only one that changes runtime behaviour of core
logic** — it is a two-line guard, it defaults to today's behaviour, and it exists because the owner
asked for the clipboard write to be controllable. Flagging it explicitly per the hard rules.

**Testing.** The 7 markup-coupled launcher tests are updated in the stage that breaks them, never
disabled. `search.test.ts` and `start-steps.test.ts` are pure logic and must keep passing untouched —
they are the guarantee that routing and step semantics survive the rewrite. New: contrast validator,
onboarding step-derivation tests, `StateBadge` glyph/word tests.

---

## 2.9 Out of scope

- **`apps/landing/**` — read-only.** Verified: it shares no code with the desktop app. Its build output
  is hashed (60 files) before and after and must be identical.
- **`apps/landing/src/components/app-demo/*`** — a static hand-built copy of the current desktop UI. It
  **will be visually wrong the day this ships.** Flagged as a follow-up; not touched.
- **`config/presets.json`, `itech-relay`, `resumes`** — other consumers / other repos.
- **A pip or tray window for listening-while-hidden** — owner chose HUD-only; a costed sketch goes in
  the final report.
- **`ContextLibraryPanel`'s two drag systems and file IO** (605 lines) — restyled, not restructured.
- **The syntax-highlight palette** (9 independent hues) — re-derived from the new neutrals for
  harmony, but not redesigned as a colour scheme.
- **Notifications, autostart, single-instance, updater rework** — none exist; none added.
- **Chat/HUD structural redesign** — the HUD adopts the system and gains the listening vocabulary; its
  layout is not redesigned.
- **`close_app` beyond wiring one button**, app-data folder access, logs, settings export/import,
  reset-to-defaults.
- **AAA contrast** — the target is AA, stated and enforced.
