# 01 — Synthesis (end of Phase 1)

Six analyses, deduplicated and ranked against the target outcome:

> A new user installs the app, opens it, completes a short onboarding, and then uses the app freely —
> without reading docs, without hunting for settings, and without ever wondering whether the assistant
> is listening or what it is doing right now. The launcher must be self-explanatory. The palette must
> feel intentional, distinctive and calm, and become the single source of truth for colour.

Sources: [`analysis/01-architecture.md`](analysis/01-architecture.md) ·
[`02-user-journey.md`](analysis/02-user-journey.md) ·
[`03-visual-audit.md`](analysis/03-visual-audit.md) ·
[`04-tauri-platform.md`](analysis/04-tauri-platform.md) ·
[`05-realtime-state.md`](analysis/05-realtime-state.md) ·
[`06-a11y-perf.md`](analysis/06-a11y-perf.md).

Findings I independently re-derived or corrected during synthesis are marked **[verified]** or
**[corrected]**.

---

## 1. Top problems, deduplicated and ranked

Eight themes. Each is tied to the clause of the target outcome it defeats. Sub-items carry the
originating report's id so the detail is one click away.

### T1 · The product never explains itself — P0

*Defeats: "without reading docs".*

| | Finding | Evidence |
| --- | --- | --- |
| T1.1 | No screen in either window says what the app does. First frame is «Загрузка…»; first real screen is a prerequisites checklist headed «Что нужно для запуска». A user who never saw the landing page cannot tell what they are configuring. | `LauncherApp.tsx:67`, `StartScreen.tsx:174`, `screens.ts:31` (B-P0-1) |
| T1.2 | **The access code — the `autoFocus`ed field, the intended fast path — is unlabelled.** Its only description is `placeholder="XXXXX-XXXXX-XXXXX-XXXXX"`. No label, no "what is this", no "where to get one". Meanwhile the *slower* path (own API keys) gets two «Где взять» buttons. | `AccessCodeForm.tsx:38` vs `ApiKeysSection.tsx:63-71` (B-P0-2) |
| T1.3 | **Push-to-talk is never taught, and the screen that teaches it is destroyed at the moment it becomes relevant.** The one instructive string, «Удерживайте, пока говорит собеседник.», lives in Настройки → Клавиши and behind an unlabelled keyboard icon. The HUD's empty states describe an outcome («Чат появится здесь») with no instruction for causing it. | `hotkeys.rs:164`, `window.rs:197-199`, `AnswerPanel.tsx:285`, `Composer.tsx:136` (B-P0-4) |
| T1.4 | The shipped interview presets — the actual product content — never reach a new chat (`NEW_CHAT_DEFAULTS.presetId = ""`), so the first answer a new user ever sees is generic Haiku. | `lib/chats.ts:53`, `config/presets.json` (B-P1-8) |

**Measured cost:** first streamed answer takes **9 actions** on macOS via access code, **13** via own
keys (plus two out-of-app signup/billing errands), **6/10** on Windows. The definition of done asks
for ≤5.

### T2 · Nothing answers "is it listening?" — P0, the largest cluster

*Defeats: "without ever wondering whether the assistant is listening or what it is doing right now".*

| | Finding | Evidence |
| --- | --- | --- |
| T2.1 | **The always-on ring buffer has no representation anywhere.** `buffer_enabled` defaults `true`; the ring starts with the HUD; idle-with-buffer renders **identically** to idle-deaf. Its only control is a settings row in a window that must be destroyed to reach. | `settings.rs:221`, `window.rs:204`, `StatusBar.tsx:63`, `SttSection.tsx:108` (E-P0-1, B-P0-5) |
| T2.2 | **Nothing is perceptible while the HUD is hidden or another app is focused — which is the *designed* PTT scenario.** No tray, no menu-bar item, no notification, no overlay. Recording, transcribing, auto-listening and the buffer all continue with zero feedback. | `CLAUDE.md:299`, `window.rs:244` (E-P0-2) |
| T2.3 | **The single listening indicator is `aria-hidden`, colour-only, 2.5 px wide, and is deleted outright by `prefers-reduced-motion`.** | `EqBars.tsx:13,17`, `index.css:149-155` (E-P0-3) |
| T2.4 | **`Recording`, `Transcribing` and auto-listening are three states rendered as one animation in two reds** that measure **1.09:1** apart from each other and from error. With reduced motion on, "capturing your audio" and "something failed" are pixel-identical. **[verified]** | `StatusBar.tsx:60-63`, `index.css:27,37` (C-P0-1, E-P0-4) |
| T2.5 | **The brand mark and the capture indicator are the same component.** `EqBars` is the logo in the launcher header (`bg-primary`) and the microphone-is-open signal in the HUD (`bg-recording`). Same five bars; the only difference is which red. | `LaunchBar.tsx:99` vs `StatusBar.tsx:90` (C-P0-3) |
| T2.6 | **There is no mute and no pause.** The only way to stop being heard is Stop, which destroys the HUD, unregisters every global hotkey and stops auto mode. **[corrected]** `set_ptt_suspended` is *not* a broken mute — it exists solely to stop a bare-letter PTT key firing while you type, and correctly no-ops on the default ⌘R. The absence of a real pause is the finding; the "inert command" framing is not. | `window.rs:213-220`, `usePttSuspend.ts:18`, `hotkey-capture.ts:84-93` (E-P0-5) |
| T2.7 | **Once the app is running there is no health surface at all.** The launcher is destroyed on launch and the HUD has no permission, device or audio-health view — so "is the tap still pointed at the right device?" is unanswerable after the one moment it was asked. | `window.rs:197-198`; `usePermissions`/`useAudioCheck` have no HUD consumer (A-P0-1) |
| T2.8 | **No error anywhere is announced to assistive tech.** Six error surfaces, zero live regions, exactly one `aria-live` in the entire codebase; recorder state is `aria-hidden`. | `StatusBar.tsx:92`, `LauncherPanel.tsx:159`, `AccessCodeForm.tsx:53`, `AudioCheckCard.tsx:82`, `UpdatesScreen.tsx:107`, `ContextLibraryPanel.tsx:492` (F-P0-6) |

### T3 · The palette cannot carry the meanings assigned to it — P0

*Defeats: "intentional, distinctive and calm" and "both themes pass contrast".*

The whole semantic palette runs on **three hues**: neutral 285, red 18–30, and one blue outlier at 245
that exists only because a focus ring was invisible. Every affirmative state in the app — ready to
launch, permission granted, step done, update available — is painted in a colour whose everyday
semantic is *danger*, and painted so darkly it barely separates from the ground.

| | Finding | Measured |
| --- | --- | --- |
| T3.1 | **`--primary` `#a51c34` fails the 3:1 non-text floor in every role it occupies** — the ready dot, the active-tab bar, list markers, progress fills, the equaliser, and (worst) the screen-share privacy icon whose loud state means "you ARE visible". | **1.57–2.71:1** across all four scopes; 2.16:1 as the privacy icon; 1.79:1 as switch-ON vs OFF; 1.44:1 when the Launch button is disabled (C-P0-4, F-P0-3) |
| T3.2 | **The indicator-dot vocabulary collapses.** CLAUDE.md states `--destructive` was separated from `--primary` in hue *and* lightness so 6 px dots stay distinguishable. It holds for hue only. Add the third term (`muted-foreground`) and all three converge. | `destructive` vs `primary` **1.71:1**; `muted-foreground` vs `destructive` 1.52–1.70:1 **[verified]** (F-P0-4) |
| T3.3 | **`--destructive` fails AA as text in 11 of 12 pairings** (3.12–4.44:1), and `destructive-foreground` on a destructive fill is 4.00:1. Errors are the one message class that must be readable. | (F-P0-5) |
| T3.4 | **No focusable control in the HUD has a conformant focus indicator.** `ring-ring/60` = 1.92–2.06:1, `ring-ring/40` = 1.52:1. **[corrected]** the *launcher's* blue ring at `/60` does pass (3.59–3.68:1); it is inputs at `/40` (2.29:1) that fail there. So the launcher's detached blue was a correct instinct the HUD never inherited. | **[verified]** (F-P0-1, F-P0-2) |
| T3.5 | **`--app-opacity` has no legibility floor.** Minimum 0.2; at that setting over a light desktop the HUD measures 1.30:1. The redesign must decide whether that is a supported configuration. | `settings.rs:89` (C-P0-5, F-P1-7) |
| T3.6 | Structural debt behind the above: an **undocumented 16-step alpha ladder** running parallel to the four named shadows; **12 free `oklch()` literals** in `index.css` plus a fully independent 7-hue syntax palette; **26 % of the palette is dead** (`--card-foreground`, `--accent-foreground`, `--secondary*`, `--accent`, `--muted`). | `index.css:217,232,237,245,250,258,263,272,275,301,366,370` (C-P1-3/4/5) |
| T3.7 | Reduced motion covers **3 of 13** animation sources; `tw-animate-css` 1.4.0 ships no guard of its own. The invariant is written as if the `index.css` block were sufficient. | (C-P1-1, F-P1-5) |

**The good news, and it is substantial:** zero hex/rgb/hsl/oklch literals exist in any `.ts`/`.tsx`,
and **no launcher component reads a CSS variable directly**. Only four Tailwind palette classes
survive, all of them scrims. A whole new palette is a single-file edit plus four scrim conversions.
**[verified]**

### T4 · Permission flow is stale, mistitled and platform-broken — P0

*Defeats: "permission steps show live status" and "degrade gracefully on denial".*

| | Finding | Evidence |
| --- | --- | --- |
| T4.1 | **Permission status is fetched once on mount and never refreshed.** The canonical loop — press «Настройки», grant in System Settings, alt-tab back — leaves the launcher stale with Launch still disabled. The fix is frontend-only and prompt-safe: `permissions_status` cannot raise a prompt while the `*_requested` flags are false. | `usePermissions.ts:30-37`, `permissions.rs:46-51,70` (D-P0-1) |
| T4.2 | **macOS audio requires «Выдать» to be pressed twice and nothing says so.** The TCC prompt is async, so `request_permission` returns `Denied` while the dialog is still open; the chip flips to «нужно сделать» under the user's cursor. The re-probe works and is indistinguishable from a failed grant. | `permissions.rs:111-119`, `CLAUDE.md:396` (B-P0-3, D-P1-2) |
| T4.3 | **On Windows the one real permission has no reachable UI.** With auto mode on and the microphone denied, the launch is blocked — but the Доступы screen is filtered out of the sidebar and «Старт» omits every permission step. So «Старт» says «Всё готово — можно запускать.» beside a disabled button, and the header blocker routes to a screen headed «Разрешения macOS». **[verified]** | `useLauncherReadiness.ts:45`, `screens.ts:62`, `start-steps.ts:50`, `PermissionsScreen.tsx:99` (B-P1-1, D-P0-2) |
| T4.4 | A denied *optional* permission has no degradation story: screen recording surfaces only later, as a `screenshot-error` in a truncated header line, while ⌘⇧A is registered from the moment the HUD opens. | `permission-rows.ts:44-49`, `screenshot.rs:68-77`, `window.rs:111` (D-P1-3, B-P1-7) |

### T5 · Settings are hunted, not found — P1

*Defeats: "without hunting for settings" and "every core action in 2 clicks or one shortcut".*

- **13 unlabelled targets**: 6 sidebar icons with no labels at any width, plus 7 tab icons below 900 px.
  Meaning lives only in `title`. (A-P1-2, B-P2-1)
- **14 tab stops to reach a settings control.** `role="tablist"`/`role="tab"` are declared on both rails
  with no roving `tabIndex`, no arrow keys, no `aria-controls`, and **no `role="tabpanel"` anywhere**;
  activating a screen does not move focus. (F-P1-1, F-P1-2)
- **Five auto-mode settings are unfindable by the launcher's own search** — `SETTINGS_ROWS` is the one
  hand-maintained part of an otherwise registry-derived index, and it omits exactly the newest feature.
  (A-P1-1)
- The search under-promises: labelled «Поиск по настройкам» while indexing screens, hotkeys, permissions,
  keys, presets, quick actions and library docs — and it has **no keyboard entry**, by policy. (B-P2-4)
- The `opacity` hotkey has no settings row on any tab and is excluded from search by name. (F-P1-9)
- `SettingRow`'s `htmlFor` is never passed by any caller, so **every visible label in every settings row
  is a floating text node** — clicking a label does not focus its control. (F-P1-8)

### T6 · The launcher lies about what was saved — P1

- **`draft` never adopts the clamped `Settings` that Rust returns.** `set_settings` returns the clamped
  value and the store adopts it, but `LauncherPanel` syncs only `access_token` back into `draft`. After
  `Settings::clamp` steals a conflicting hotkey or trims quick actions past the limit, the launcher keeps
  displaying a binding that no longer exists on disk. **[verified]** (`useSettingsStore.ts:57`,
  `LauncherPanel.tsx:93-97`, A-P0-3)
- **Autosave has one shared status slot and no recovery.** «Сохраняю…» occupies *and outranks* the
  blocker line, so the acknowledgement is a ~600 ms flash that also hides the thing the user was told to
  fix; a failed save produces a banner with no retry while `lastQueuedDraft` has already advanced, so the
  change is never re-attempted. (`LaunchBar.tsx:15-20`, `LauncherPanel.tsx:107,159-164`, A-P0-4)

### T7 · Dead ends after launch — P1

- Every error message that says «проверь в настройках» points at a window that no longer exists, and
  nothing tells the user that «Стоп» is the way back. (`llm.rs:49`, `stt.rs:24`, `window.rs:197-199`, B-P1-5)
- **There is no way to quit.** `close_app` is registered in the contract and imported nowhere; the HUD is
  frameless; there is no tray. **[verified]** (`bindings.rs:46`, absent from `ipc/commands.ts`, B-P1-3)
- **The launcher has no connectivity handling at all** — `useConnectivity`/`ConnectivityOverlay` are
  HUD-only, so a redeem with no network prints a raw English `reqwest` string into a Russian UI.
  (`access.rs:61,64` → `AccessCodeForm.tsx:53`, B-P1-2)
- LLM failures get one truncated header line, are **suppressed entirely** while `state !== "idle"`, and
  have no retry — the retry button is STT-only. (`StatusBar.tsx:78`, `App.tsx:157,163`, B-P1-4)
- A second launch produces a second process whose global-shortcut registrations fail one by one into an
  `eprintln!`; the user gets a HUD whose PTT is silently dead. (`window.rs:121-124`, D-P1-4)

### T8 · Privacy is under-declared — P1, and it is the honesty problem

*Defeats: "an honest privacy step: what is captured, when, and how to pause it".*

- **Every finished transcript and every screenshot is silently written to the system clipboard.** No
  setting, no indication, no mention in any UI copy. **[verified]** (`recording.rs:296-297`,
  `screenshot.rs:27`, E-P1-1)
- **The ring's preroll silently extends every recording backwards.** The user believes they recorded from
  the keypress; several seconds of prior audio went to Groq too. (`capture.rs:442-449`, E-P2-6)
- `screen_share_visible: false` is the most consequential default in the app and is stated exactly once,
  on the Поведение tab. (`BehaviorSection.tsx:27`, B-P2-8)
- `App.last_recording` retains the last recording's raw samples indefinitely with no UI and no clear
  path. (`recording.rs:241`, E-P2-7)
- On Windows, loopback needs no consent and raises no OS indicator — the OS will not tell the user
  either. (`permissions.rs:31`)

### Lower-ranked, carried forward

**P2:** no live preview for the Appearance sliders **[corrected from A-P0-2 — the settings do take
effect, in the HUD, and the section title says so; the defect is the absent preview]** · a sub-0.3 s PTT
tap discards silently · `cancel_stream` emits nothing · `Transcribing` cannot be cancelled · the Windows
WASAPI start can block 5 s with no feedback · the streaming→buffered STT fallback is invisible · a
screenshot un-hides a deliberately hidden HUD · chat-tab close is a hover secret · two hairline
mechanisms with no rule · 63 native `title=` attributes are the entire explanatory layer · 148 dead lines
in `components/ui` · 9 icon collisions across 58 glyphs.

**P3:** mixed address forms («вы» in the launcher, «ты» in backend errors and the HUD) · untranslated
vocabulary (`Thinking`, «Препромпт», «Суфлёр», «Прокси») · the brand line is the smallest,
lowest-contrast type in its own front door (10.5 px mono uppercase at 55 % alpha) · no heading scale ·
`--window-radius` generates no utility · the search index is rebuilt on every keystroke · doc drift in
`apps/desktop/CLAUDE.md` (`:109` says 37 settings fields, there are 36; `:327` describes a
`normalizeDraft` behaviour that no longer exists; `:386` describes the removed `landed` ref; the
"400 ms `count_tokens` debounce" no longer exists in `App.tsx:281-301`).

---

## 2. What must be preserved

Discovered constraints, platform limits, and things that already work well. **None of these is
negotiable without an explicit decision.**

### 2.1 Structural — cannot change without a product decision

1. **Two windows, mutually exclusive.** `launcher` and `main` are created in Rust (`tauri.conf.json`
   declares `"windows": []`), and launching destroys the launcher. Global hotkeys exist only while the
   HUD lives. A third window touches `vite.config`, `capabilities/default.json` and `knip.json` at once.
2. **The launcher cannot be resized, re-centred or focused from the app.** `set_window_size` is
   hard-wired to `main_window(&app)` and no window setter beyond `start-dragging` is granted.
   **[verified]** → **the redesign must work at 1000×720 and stay correct down to 520×480**, with no
   "onboarding shrinks the window" move available.
3. **The process disguise.** The bundle is "Audio System"; `window_title` reads
   `package_info().name`, so no UI hardcodes it and the disguise survives any header redesign.
4. **`bindings.ts` must come out byte-identical on macOS and Windows.** No `#[cfg]`-dependent value may
   reach it; CI enforces `git diff --exit-code`.
5. **Russian, hardcoded, no i18n layer.** ~533 Russian literals inline in `.tsx`. New copy is written the
   same way.

### 2.2 Platform limits

6. **macOS TCC is asynchronous** — `request_permission` returns before the user answers. Hence the rule
   that a permission row's **geometry must not depend on its state** (fixed action column, `min-w-18`,
   `min-h-9`), so the button never moves under a finger. Keep this; fix the *copy*, not the layout.
7. **Core Audio has no preflight** — the only way to learn microphone/audio status is to open the device,
   so a status query can itself be the prompt. Hence `*_requested` flags and the "no prompt without a
   button press" rule.
8. **No `transition-opacity` in the HUD.** In a transparent frameless window an opacity animation
   promotes a WKWebView compositing layer and leaves unflushed pixels. The launcher is opaque and may
   animate (`.launcher-rise` is the precedent).
9. **`--window-radius` (22 px) is coupled to Rust's `WINDOW_CORNER_RADIUS_LOGICAL_PX`.** The native clip
   draws the shape, the CSS draws the background; both are needed.
10. **`visible_on_all_workspaces` is a silent no-op on Windows; `contentProtected` needs Windows 10
    2004+ and silently does nothing below it.**

### 2.3 Architecture that is working and should be exploited, not replaced

11. **The IA is data, not markup.** `LAUNCHER_SCREENS`, `SETTINGS_TABS`, `PERMISSION_ROWS`,
    `HOTKEY_ACTIONS`, `SETTINGS_LIMITS`, `API_KEY_IDS`. The sidebar, the search index, breadcrumbs, the
    screen chrome and the start steps all derive from them. Renaming/reordering/merging a screen is a
    data edit.
12. **One navigation primitive** — `goTo({screen, tab})` is the single funnel for sidebar, search,
    blockers and in-screen links. A wizard, a router or a palette drops in behind it untouched.
13. **One form vocabulary, 156 lines** — `fields.tsx` (`SettingGroup/Row/Block/Select/Switch/Slider`).
    Restyling ~30 setting rows is one file.
14. **Bounds and hotkey metadata cannot drift** — every numeric control reads `SETTINGS_LIMITS`, every
    hotkey row reads `HOTKEY_ACTIONS`.
15. **Token discipline.** Zero colour literals in 27 components and 12 primitives. **Protect this — it is
    what makes a palette rewrite a one-file edit.**
16. **The five-step type scale and its `cn` font-size group.** Zero raw Tailwind sizes anywhere. The
    *values* need work; the *mechanism* survives untouched. Shared primitives cannot hold two scales.
17. **Surface-by-lightness in the launcher, alpha in the HUD** — with `--popover` (0.245) deliberately
    *above* `--card` (0.21) so a dropdown does not dissolve into the card it hangs over. Keep the
    principle even if every value changes.
18. **One stylesheet, one seam.** Nothing in `:root` is edited for the launcher's sake.
19. **No hardcoded hotkey combinations** — including no ⌘K for the launcher search. A new shortcut is an
    action in the `hotkeys.rs` registry.
20. **Permissions are granted from exactly one place**, and no system prompt appears without a button
    press. `setup_app` must not create the capture.
21. **The launcher lands on «Старт»** — the old "land on the blocker" behaviour was removed deliberately.

### 2.4 Real-time behaviours that are deliberate (from `05-realtime-state.md`, 16 entries)

Selected load-bearing ones: PTT is designed to work while **another** app is focused, so a finished
transcript deliberately does **not** raise the HUD · auto mode answers **manually** by default · auto
mode and PTT are **mutually exclusive** · there is deliberately **no autoscroll during streaming** ·
the final delta buffer must flush **before** `llm-done` · the resize tween must abort when the actual
size diverges (mouse-resize fight) · a target matching the native-size echo means "do not touch the
window at all".

### 2.5 What is genuinely good and should visibly survive the redesign

- The HUD's silhouette — a 22 px-rounded translucent slab with no chrome — is the one distinctive thing
  in the product, and it comes from `--window-radius`, `--app-opacity` and the native corner clip, not
  from colour.
- The «Проверка звука» card is the only surface in the product that proves the whole chain
  (device → tap → Groq key) actually works, and distinguishes silence from sound-without-speech from
  recognised text. It must not be left behind in a window that gets destroyed.
- Named-property transitions everywhere (28 of them, never a bare `transition-all`), the global icon
  stroke rule, and the empty `transition-opacity` grep.

---

## 3. Feature mapping — old → new (outline; completed in Phase 2)

The complete checklist is **95 items** in
[`analysis/01-architecture.md` §Feature inventory](analysis/01-architecture.md), covering every screen,
section, row, button, link, empty state and status string, plus the note that **28 of 36 `Settings`
fields** are launcher-editable today. Phase 2 §2.2 carries every one of those 95 to a destination.

Preliminary structure, to be justified in the brief:

| Today | Proposed destination |
| --- | --- |
| «Старт» screen (steps + audio check + defaults note + 2nd Launch) | **Split.** First run → a dedicated **onboarding flow**; afterwards → a **Ready** home screen that keeps the checklist, the audio check and Launch. |
| Header: brand · search · status line · Launch | Kept, re-proportioned. The status line becomes the launcher's primary **listening/readiness** object rather than a truncated caption. |
| Sidebar: 6 icon-only items in 3 groups | Kept as the navigation model. **Labels added at ≥900 px** (the nested rail's own precedent), `title` retained below. |
| Настройки → 7 tabs | Kept. Tab set re-examined for the auto-mode/speech split only. |
| Контексты · Пресеты · Доступы · Обновления | Kept as screens; restyled onto the new tokens. |
| `EqBars` used as both brand mark and capture meter | **Split into two components** — a brand mark and a capture meter that merely happen to be bars today. |
| Permission rows | Kept, with fixed geometry preserved, live refresh added, and TCC-async copy added. |
| No-feature-loss risks flagged so far | None. Nothing in the inventory is proposed for removal. Two *additions* need approval (see §4). |

---

## 4. Questions for the human — batched

Ranked by how much they change the brief. Each carries my recommendation so Phase 2 can proceed either
way.

### Blocking-ish (materially change the design)

**Q1 · What answers "is it listening?" once the HUD is running and hidden?**
This is the single biggest decision in the task. Today: nothing. Options — (a) a small always-on-top,
click-through "listening" pip window; (b) a tray / menu-bar item; (c) accept HUD-only and make the HUD
indicator excellent. (b) contradicts the deliberate "Audio System" disguise and a JS-created tray would
be owned by a webview destroyed on every launcher↔HUD swap. (a) needs `window.rs` work and a third
entry point. *Recommendation: (c) for this pass, done properly — a state that carries colour + motion +
icon + word — and flag (a) as a follow-up with a costed sketch.*

**Q2 · Should the launcher survive behind the HUD instead of being destroyed?**
Destroying it (`window.rs:197-199`) is what makes every «проверь в настройках» message a dead end, what
strands the audio check, and what makes "Стоп" a full teardown of hotkeys and auto mode. Is the
destruction load-bearing (memory, hotkey scoping, the disguise) or incidental? *Recommendation: keep the
destruction for this pass (it is structural and cheap to get wrong), and instead make «Стоп» honest in
the UI and route `badApiKey`-class errors to an action that stops the HUD and lands the launcher on
`settings/access` — the `LauncherDestination` type already exists.*

**Q3 · Is a light theme in scope, and may `window.rs:67` lose `.theme(Some(tauri::Theme::Dark))`?**
That one argument is the only blocker: on macOS tao turns it into an app-wide, never-reset
`[NSApp setAppearance:]`, so both `theme()` and the webview's `prefers-color-scheme` are pinned.
`core:window:allow-theme` **is already granted**. **[verified]** Removing it makes the launcher's native
title bar and scrollbars follow the OS. A third `Settings.theme` value is a Rust clamp change +
`bindings.ts` regeneration. *Recommendation: yes — deliver full light and dark sets, remove the pin, and
change `theme` to `"system" | "light" | "dark"` (retiring the near-identical `"gray"`/`"black"` pair,
which differ by ~0.05 L and cost 14 override declarations).*

**Q4 · Privacy defaults — three calls I should not make alone:**
(a) the ring buffer is **on by default** and never surfaced outside a settings row; (b) **every
transcript and every screenshot is silently copied to the system clipboard**; (c) the preroll silently
extends every recording backwards. *Recommendation: keep all three behaviours (they are real features),
but declare all three in the onboarding privacy step, give the buffer a HUD-level indicator **and** a
pause, and add a single settings row for the clipboard write. (b) in particular is a genuine cross-app
leak that no UI currently admits to.*

### Needed for copy, not for structure

**Q5 · Where does a user get an access code?** Sold, granted, delivered out of band? The onboarding
needs one true sentence and possibly a link. *Recommendation: if there is no self-serve source, say so
plainly («Код выдаёт владелец подписки») and make «Ввести свои ключи» equally prominent.*

**Q6 · Should a shipped preset be preselected for a first chat?** It changes the first answer materially
and is a product decision. *Recommendation: yes for the first chat only; it is the difference between
"the product works" and "generic Haiku".*

**Q7 · What is the `--app-opacity` floor?** The permitted 0.2 guarantees an unreadable window (1.30:1).
*Recommendation: raise the minimum to 0.75 **or** keep the range and put text only on opaque cards. I
will design for the latter so the slider keeps its range.*

**Q8 · Accessibility target — AA or AAA?** Nothing in the repo states one. *Recommendation: AA
(4.5:1 text, 3:1 non-text), stated explicitly in the brief and enforced by a checked-in contrast script.
Note the type scale tops out at 15 px, so the 3:1 large-text allowance applies to nothing.*

### Answer only if you disagree with my plan

**Q9 · Two additions that touch Rust.** (i) removing the theme pin (Q3); (ii) nothing else. Everything
else in the brief is frontend-only: live permission refresh is prompt-safe and needs no Rust; the
Windows microphone dead end is a readiness-derivation fix; `close_app` needs an export and a button, not
a new command.

**Q10 · Two behaviours I plan to *fix* rather than merely restyle**, because the launcher's job is
readiness: the stale-draft bug (T6) and the Windows auto-mode dead end (T4.3). Say if either should stay
as-is.

**Q11 · Screenshots.** `screencapture` fails — this Terminal lacks macOS Screen Recording permission. If
you want before/after screenshots in the Phase 4 report, grant it in System Settings → Privacy &
Security → Screen Recording. Otherwise the report ships with ASCII wireframes only.

**Q12 · Out of scope, confirming:** `apps/landing/src/components/app-demo/*` is a static hand-built copy
of this UI and **will be wrong the day this ships**. Flagged as a follow-up, not fixed here.
