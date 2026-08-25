# 06 — Accessibility, keyboard & performance (analyst F)

Read-only audit of `apps/desktop` at baseline. Every number below is measured, not estimated.
Contrast was computed with a purpose-written OKLab→sRGB script (method in **Measured contrast**).

## Summary

1. Zero `div onClick` in the whole app — every action sits on a real `<button>`/`<input>`/Radix node.
2. The failure is not reachability but **focus visibility**: `focus-visible:ring-ring/60` measures
   **2.06–2.21:1** in the HUD and `ring-ring/40` measures **1.50–2.30:1** everywhere. Both fail 3:1.
3. The stated invariant "focus is one thing, `focus-visible:ring-2`, no `ring-[3px]`" is **half true**:
   no `ring-[3px]` survives, but `slider.tsx:50` uses `ring-4`.
4. `--primary` #A51C34 reaches **1.82–2.71:1** against every surface in all four scopes — it fails
   3:1 as a graphical object everywhere, including the 6px dots the design depends on.
5. `primary` vs `destructive` as 6px dots is **1.71:1** — the two dots are separable by hue, not by
   luminance; a deuteranope or a greyscale display cannot tell them apart.
6. `destructive` as error text is **3.12–4.64:1** — it fails AA 4.5:1 in 11 of 12 pairings.
7. Every border/input hairline is **1.16–1.46:1**; every surface step is **1.02–1.42:1**. Structure is
   carried entirely by lightness deltas far below 3:1.
8. Almost nothing qualifies as large text: the scale tops out at 15px (`--text-title`).
9. **One** `aria-live` exists in the codebase; recording start/stop, streaming and errors are silent.
10. Prebuilt `dist` exists: launcher entry **864,942 B raw / 242,178 B gzip**; the 705 KB shared
    chunk is loaded by both windows because `UpdatesScreen` pulls in `react-markdown`.

---

## Keyboard reachability

### Method

A script walked every opening JSX tag in every non-test `.tsx` file and reported any tag carrying
`onClick`/`onDoubleClick`/`onKeyDown`/`onPointerDown`/`onMouseDown` that is not natively focusable.
Six hits came back, and **all six are `onMouseDown`**, none of them an action:

| path:line | element | handler | what it is |
| --- | --- | --- | --- |
| `apps/desktop/src/App.tsx:777` | `<div>` | `onMouseDown` | window drag (`useWindowDrag`) |
| `apps/desktop/src/features/launcher/LaunchBar.tsx:94` | `<header>` | `onMouseDown` | window drag |
| `apps/desktop/src/components/StatusBar.tsx:82` | `<header>` | `onMouseDown` | window drag |
| `apps/desktop/src/features/launcher/LauncherSearch.tsx:113` | `<div>` | `onMouseDown` | `preventDefault` so the input keeps focus |
| `apps/desktop/src/features/launcher/ContextLibraryPanel.tsx:228` | `<div>` | `onMouseDown` | starts a doc drag |
| `apps/desktop/src/components/QuickActionsBar.tsx:48` | `<div>` | `onMouseDown` | `preventDefault` so the prompt keeps focus |

So the classic "unfocusable div button" problem does not exist here. What does exist is a smaller
set of genuinely unreachable *controls* and *information*:

### Controls and information with no keyboard path

| # | path:line | What | Why it is unreachable | Keyboard workaround |
| --- | --- | --- | --- | --- |
| 1 | `features/launcher/ContextLibraryPanel.tsx:228-235` | `DocRow` drag handle — move a doc into a folder | `onMouseDown` on a `<div>` with no `tabIndex`; the `GripVertical` (`:236`) is decoration; the `title="Перетащи, чтобы переложить в папку"` sits on the same non-focusable div, so the tooltip is mouse-only | Yes, indirectly: Pencil (`:197`) → `DocEditor` folder `Select` (`:341-358`) → Save (`api.moveDoc` at `:428`) |
| 2 | `features/launcher/ContextLibraryPanel.tsx:472-480` + `:433-438` | Import a file **into a specific folder** | The Import button always imports to `ROOT_FOLDER_ID` (`:436`); only a native mouse drop (`useNativeFileDrop`, `DROP_FOLDER_ATTR` at `:515`, `:555`) can target a folder | Import to root, then workaround #1 |
| 3 | `components/StatusBar.tsx:40` | Context-usage figure — "12 345 из 200 000 токенов" | The number is rendered; its meaning lives only in `title` on a non-focusable `<div>` | none |
| 4 | `components/ChatTabs.tsx:89-90` | The "this tab will close" affordance | `group-hover:hidden` / `hidden group-hover:block` — no `group-focus-visible:` variant, so focusing the tab never swaps the digit for the ✕ | The `aria-label` does change (`:81`), so AT is told; a sighted keyboard user is not |
| 5 | `features/launcher/HotkeyCapture.tsx:18-38` | Escaping capture mode without assigning a key | `window.addEventListener("keydown", …, capture=true)` with unconditional `preventDefault`+`stopPropagation` (`:21-22`); `"Tab"` is in `NAMED_CODES` (`lib/hotkey-capture.ts:33`), so Tab is *assigned as the hotkey* instead of moving focus | Escape only — it is in the button label (`:56`), which is the one thing saving this |
| 6 | `components/Teleprompter.tsx:120` | Everything under the full-screen teleprompter overlay | `absolute inset-0 z-50` with no focus trap, no `role="dialog"`, no `aria-modal`, no `inert` — the chat, composer and status bar underneath stay in the tab order | none |
| 7 | `components/ConnectivityOverlay.tsx:8` | Same, for the offline overlay | Same: `absolute inset-0 z-50`, opaque, no trap. `App` only `blur()`s the prompt field, not the rest | none |
| 8 | `features/launcher/fields.tsx:36,41,47` | Programmatic label association for every settings row | `SettingRow` accepts `htmlFor` and passes it to `<Label>`, but **no caller anywhere passes it** (verified by grep over `features/launcher/**`) — every `<Label>` renders without a `for` | The controls carry their own `aria-label`, so AT is fine; click-the-label-to-focus is lost |

Everything else in `features/launcher/**` is a real focusable node: `LaunchButton.tsx:22`,
`LaunchBar.tsx:50`, `Sidebar.tsx:36`, `SettingsTabsRail.tsx:23`, `LauncherSearch.tsx:64` and `:127`,
`ScreenShell` actions, all four screens, all nine sections, `fields.tsx` (Radix `Select`/`Switch`/
`Slider`), `HotkeyCapture.tsx:42`, `AudioCheckCard.tsx:86`, `ContextLibraryPanel` buttons and
`EmptyDropZone.tsx:386`.

### The hover-reveal clusters are keyboard-safe (checked, not assumed)

`PresetsSection.tsx:38`, `ContextLibraryPanel.tsx:195` and `AnswerPanel.tsx:158` use
`pointer-events-none opacity-0 … focus-within:pointer-events-auto focus-within:opacity-100`.
`pointer-events-none` does not block keyboard focus, so tabbing into the cluster fires
`focus-within` and the buttons become visible and clickable. `AttachmentChip.tsx:17` does the same
with `focus-visible:` on the button itself. Only `ChatTabs.tsx:89-90` (item 4 above) lacks the
focus variant.

### Focus order as the DOM produces it — launcher

`LauncherPanel.tsx:136` renders, in order:

1. `LaunchBar` (`:138`) → **search input** (`LauncherSearch.tsx:64`)
2. `StatusLine` — a `<Button>` **only** when `blocker && !busy` (`LaunchBar.tsx:48-64`); otherwise a
   plain `<span>` (`:67-74`)
3. `LaunchButton` (`LaunchBar.tsx:116`) — `disabled` until `canLaunch()` (`LaunchButton.tsx:25`),
   therefore **removed from the tab order** on a fresh install
4. error banner (`LauncherPanel.tsx:159-164`) — no tab stop
5. `Sidebar` (`:168`) — 6 buttons (5 on Windows; `permissions` is macOS-only, `screens.ts:62`)
6. the active screen (`:181-214`)

Where it is illogical:

- **The tab order changes under the user.** During the first frames `readiness.checking` is true
  (`useLauncherReadiness.ts:45`, `usePermissions.ts:28` starts `loaded=false`), so stop 2 is a
  `<span>`. When `permissions_status` resolves and a blocker exists, the same slot becomes a
  `<button>` and a tab stop appears mid-interaction. Symmetrically, the Launch button materialises
  in the tab order the moment readiness flips.
- **On a fresh install the header offers exactly one tab stop.** Nothing is configured, so
  `LaunchButton` is disabled and skipped; the user tabs from the search field straight into the
  sidebar. The primary call to action is not in the tab order at the one moment it matters.
- **Six sidebar stops sit between the header and the screen.** There is no skip link, no `<nav>`,
  no `<main>`, no landmark at all (`role=` appears 10 times in the codebase and none of them is a
  landmark). Reaching the first control of the Start screen costs 7 tabs; reaching the first
  control of a settings section costs 7 + 7 (`SettingsTabsRail` renders all `SETTINGS_TABS`,
  `SettingsTabsRail.tsx:57`) = **14 tab stops**.
- **`role="tablist"` is a promise the code does not keep.** `Sidebar.tsx:74` and
  `SettingsTabsRail.tsx:53` declare `role="tablist" aria-orientation="vertical"` and each child
  declares `role="tab" aria-selected` (`Sidebar.tsx:38-39`, `SettingsTabsRail.tsx:25-26`). The
  ARIA tabs pattern requires roving `tabIndex` (one stop for the whole list) plus Arrow-key
  movement. Neither exists — no `tabIndex` anywhere in the launcher, no `onKeyDown` on either rail.
  There is also **no `aria-controls` and no `role="tabpanel"` anywhere in the repo**, so a screen
  reader announces "tab, selected, 3 of 6" and has no panel to jump to.
- **Activating a screen does not move focus.** `LauncherPanel.tsx:177-180` remounts the screen with
  `key={screen}`; nothing calls `.focus()`. After clicking "Старт" (the first sidebar item) focus
  stays on that button and the user must tab past the remaining 5 sidebar items to reach the
  content they just asked for.
- **The search listbox options are focusable but unusable by Tab.** `LauncherSearch.tsx:127` renders
  each hit as a real `<button role="option">`, so they enter the tab order — but `onBlur` on the
  input (`:86`) sets `open=false`, unmounting the list the instant focus leaves. The working path is
  ArrowUp/ArrowDown/Enter (`:94-108`) driving `aria-activedescendant` (`:72-74`), which is correct;
  the focusable `<button>`s are dead weight and a latent trap.

### Focus order — HUD chrome (briefly)

`StatusBar.tsx:82` → Hide (`:83`) · `EqBars` (`aria-hidden`, `EqBars.tsx:13`) · `ChatTabs` (N tabs +
New `:103` + Duplicate `:126`) · error `<span>` (`:92`, not focusable) · context gauge (`:40`, not
focusable — item 3 above) · `actions` (HotkeysPopover `:65`, ScreenShareIndicator, AutoModeIndicator)
· `UpdateBadge` (`:113`) · Stop (`:102`). Then `QuickActionsBar` (`:48`, `role="group"`), then
`Composer` (prompt `Composer.tsx:117`, then the toolbar buttons `:255`–`:396`).

Notes: `Composer.tsx:137` sets `focus-visible:ring-0` on the prompt and delegates the indicator to
the card's `focus-within:ring-ring/60` (`:561`) — a legitimate replacement, but see below for its
measured contrast. Radix dialogs (`ui/dialog.tsx`) do trap focus and are labelled by `DialogTitle`;
`UpdateDialog.tsx:72-103` has no `DialogDescription`, so Radix logs a missing-description warning.
`PreviewPanel.tsx:67` gives the iframe a `title`, which is correct.

---

## Visible focus

### Does the invariant hold?

| Claim | Verdict | Evidence |
| --- | --- | --- |
| "No `ring-[3px]` left" | **TRUE** | `grep -E 'ring-\[' ` over `**/*.tsx` + `index.css` → 0 hits |
| "Focus is one thing: `focus-visible:ring-2`" | **FALSE** | `components/ui/slider.tsx:50` uses `focus-visible:ring-4 focus-visible:ring-ring/40` (and `hover:ring-4`). It is the only `ring-4` in the codebase, so the rule is broken in exactly one place |
| No plain `focus:` styles | **one exception** | `components/ui/select.tsx:102` uses `focus:bg-surface-active focus:text-foreground` on `SelectItem` — correct for a Radix menu item (Radix drives `focus` there, not the browser) |
| Every `outline-none` has a replacement | **TRUE** | 19 `outline-none`/`outline-hidden` sites; every one pairs with a `focus-visible:ring-*`, a `focus-visible:border-ring`, or (`popover.tsx:26`, `dialog.tsx:53`) sits on a container that is not itself a tab stop |

Three distinct ring recipes are in use, not one:

| Recipe | Where | Sites |
| --- | --- | --- |
| `focus-visible:ring-2 focus-visible:ring-ring/60` | `button.tsx:7`, `switch.tsx:17`, `dialog.tsx:62`, `scroll-area.tsx:18`, `Sidebar.tsx:45`, `SettingsTabsRail.tsx:32`, `LauncherSearch.tsx:134`, `ChatTabs.tsx:83`, `HtmlBlockChip.tsx:20`, `AttachmentChip.tsx:17`, `AnswerPanel.tsx:323`, `Composer.tsx:430`, `ContextLibraryPanel.tsx:390` | 14 |
| `focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40` | `input.tsx:11`, `textarea.tsx:9`, `select.tsx:33` | 3 |
| `focus-visible:ring-4 focus-visible:ring-ring/40` | `slider.tsx:50` | 1 |
| `focus-visible:ring-destructive/40` | `button.tsx:14` (destructive variant) | 1 |
| `focus-visible:ring-0` (deliberate, delegated) | `Composer.tsx:137` → parent `focus-within:ring-ring/60` at `:561` | 1 |

### Rings that are invisible against their own background (measured)

`--ring` is `oklch(0.58 0.14 18)` = **#BF525A** in the HUD (`index.css:32`) and
`oklch(0.74 0.1 245)` = **#73B1E6** in the launcher (`index.css:123`). The alpha suffix is not
cosmetic — it is what the ring actually paints.

| Element | Ring as written | Ring after alpha | Sits on | Ratio | 3:1 |
| --- | --- | --- | --- | ---: | --- |
| every `Button`, `Switch`, sidebar/rail tab, chat tab, dialog close — **HUD/gray** | `ring-ring/60` | #803F45 | `background` #212124 | **2.06** | FAIL |
| same — **HUD/gray** | `ring-ring/60` | #844248 | `card` #2B2B2E | **1.92** | FAIL |
| same — **HUD/black** | `ring-ring/60` | #78363C | `background` #0D0D0F | **2.21** | FAIL |
| same — **HUD/black** | `ring-ring/60` | #7B3A40 | `card` #161618 | **2.17** | FAIL |
| same — **Launcher/gray** | `ring-ring/60` | #4B7191 | `background` #0F0F12 | 3.69 | PASS |
| same — **Launcher/black** | `ring-ring/60` | #476D8D | `background` #060607 | 3.70 | PASS |
| `Input`/`Textarea`/`SelectTrigger` — HUD/gray | `ring-ring/40` | #60353A | `background` #212124 | **1.58** | FAIL |
| `Input`/`Textarea`/`SelectTrigger` — HUD/black | `ring-ring/40` | #54292D | `background` #0D0D0F | **1.60** | FAIL |
| `Input`/`Textarea`/`SelectTrigger` — Launcher/gray | `ring-ring/40` | #375066 | `background` #0F0F12 | **2.28** | FAIL |
| `Input`/`Textarea`/`SelectTrigger` — Launcher/black | `ring-ring/40` | #314A60 | `background` #060607 | **2.21** | FAIL |
| `Slider` thumb (`ring-4`) — all four scopes | `ring-ring/40` | as above | as above | **1.49–2.30** | FAIL |
| `Button variant="default"` (primary fill) — HUD | `ring-ring/60` | #B43C4B | `primary` #A51C34 | **1.32** | FAIL |
| `Button variant="default"` (primary fill) — Launcher | `ring-ring/60` | #87769F | `primary` #A51C34 | **1.82** | FAIL |
| `Button variant="destructive"` — HUD/gray (`button.tsx:14`) | `ring-destructive/40` | #742F2F | `card` #2B2B2E | **1.48** | FAIL |
| `Button variant="destructive"` — HUD/gray | `ring-destructive/40` | #742F2F | `destructive` #E23532 fill | **2.19** | FAIL |
| `Button variant="outline"` (`button.tsx:16`) | `focus-visible:border-ring` only | #BF525A / #73B1E6 | 1px border, **no ring at all** | — | the indicator is a 1px border-colour change, not a ring |

Even at full opacity the ring fails in places: `--ring` #BF525A vs `--popover` #2D2D30 is **2.97:1**
(HUD/gray), vs `surface-active` **2.17:1**, vs the `primary` fill **1.63:1**, vs `destructive`
**1.05:1**. The launcher's blue ring is the only one that reliably passes (7.01–8.89:1 on flat
surfaces, 3.28:1 on a primary fill) and it still fails against a `destructive` fill (1.92:1).

**Net:** in the HUD, *no* focusable control currently has a WCAG-conformant focus indicator. In the
launcher, buttons and tabs pass; every text field, select and slider fails because of `/40`.

---

## Shortcuts

### The registry (`src-tauri/src/hotkeys.rs:159-313`, 17 actions)

`primary_combo!(x)` expands to `Cmd+x` on macOS and `Ctrl+x` on Windows (`:47-54`).
`primary_combo!()` with no key is the bare modifier.

| # | id | group | label | hint | kind | scope | macOS | Windows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `record` | Запись | Записать системный звук | Удерживайте, пока говорит собеседник. | `combo` | `global` | ⌘R | Ctrl+R |
| 2 | `auto_mode` | Запись | Автослушание | Слушает собеседника и вас, пока включено. | `combo` | `global` | ⌘⇧L | Ctrl+Shift+L |
| 3 | `cancel_recording` | Запись | Отменить запись | Слушается только пока идёт запись. | `combo` | `recording` | Esc | Esc |
| 4 | `send` | Отправка | Отправить | Работает из любого места окна, не только из поля ввода. | `combo` | `hud` | ⌘⏎ | Ctrl+Enter |
| 5 | `auto_answer` | Отправка | Ответить на услышанное | Отправляет накопленную расшифровку. Слушается и когда окно не в фокусе. | `combo` | `global` | ⌘⇧⏎ | Ctrl+Shift+Enter |
| 6 | `screenshot` | Отправка | Снимок области экрана | Выделенная область уходит вложением в чат. | `combo` | `global` | ⌘⇧A | Ctrl+Shift+A |
| 7 | `quick_action` | Отправка | Быстрое действие | Модификатор с цифрой: 1…9 по порядку кнопок. | `modifier_digits` | `hud` | ⌘ +1…9 | Ctrl +1…9 |
| 8 | `focus_prompt` | Отправка | Сфокусировать поле ввода | Поднимает окно и ставит каретку в конец текста. | `combo` | `global` | ⌘⇧D | Ctrl+Shift+D |
| 9 | `toggle_window` | Окно | Скрыть или показать | Работает, даже когда окно спрятано. | `combo` | `global` | ⌘⇧H | Ctrl+Shift+H |
| 10 | `move_window` | Окно | Передвинуть | Модификатор со стрелками. | `modifier_arrows` | `hud` | ⌘ +←→↑↓ | Ctrl +←→↑↓ |
| 11 | `resize_window` | Окно | Изменить размер | Модификатор со стрелками. | `modifier_arrows` | `hud` | ⌘⇧ +←→↑↓ | Ctrl+Shift +←→↑↓ |
| 12 | `opacity` | Окно | Прозрачность | Модификатор с плюсом и минусом. | `modifier_plus_minus` | `hud` | ⌘⇧ +− | Ctrl+Shift +− |
| 13 | `scroll_chat` | Чат | Скролл переписки | Модификатор со стрелками вверх и вниз. | `modifier_arrows` | `hud` | ⌥ +↑↓ | Alt +↑↓ |
| 14 | `duplicate_chat` | Чат | Дубликат чата | Новый чат с параметрами текущего, без сообщений. | `combo` | `hud` | ⌘⇧N | Ctrl+Shift+N |
| 15 | `teleprompter` | Чат | Суфлёр | Крупный текст ответа поверх экрана. | `combo` | `global` | ⌘⇧T | Ctrl+Shift+T |
| 16 | `teleprompter_close` | Суфлёр | Закрыть суфлёр | Слушается только пока суфлёр открыт. | `combo` | `teleprompter` | Esc | Esc |
| 17 | `teleprompter_pause` | Суфлёр | Пауза суфлёра | Останавливает автопрокрутку. | `combo` | `teleprompter` | ␣ | Space |

Note #11 and #12 ship with the **same default combo** (`Cmd+Shift` / `Ctrl+Shift`). That is legal:
`key_spaces_overlap` (`hotkeys.rs:409-414`) declares `ModifierArrows` and `ModifierPlusMinus`
non-overlapping, because one claims the arrows and the other claims `-`/`=`. Same for #7.
`scopes_coexist` (`:390-396`) lets `Escape` serve both #3 and #16 because Recording and Teleprompter
cannot be live at once.

### Discoverability

| Surface | Where | Covers |
| --- | --- | --- |
| `HotkeysPopover` | HUD `StatusBar` actions cluster, behind an icon-only trigger (`components/HotkeysPopover.tsx:65`, `title="Горячие клавиши"`) | **All 17**, via `hotkeyGroups` (`lib/hotkeys.ts:185-203`), plus 3 field hints |
| `HotkeysSection` | launcher → Настройки → **Клавиши** (`sections/HotkeysSection.tsx:65`) | **12 of 17** — it filters `kind === "combo"` |
| `QuickActionsSection` | launcher → Настройки → **Действия** (`sections/QuickActionsSection.tsx:115-129`) | #7 `quick_action` (modifier only, digits fixed) |
| `WindowSection` | launcher → Настройки → **Окно** (`sections/WindowSection.tsx:10-34`) | #10, #11, #13 (modifier + step slider each) |
| `fieldHints` | injected into the "Отправка" group of `HotkeysPopover` only (`lib/hotkeys.ts:173-183`) | Enter = send, Shift+Enter = newline, ⌘V = paste screenshot |
| launcher search | `features/launcher/search.ts:165-178` | 16 of 17 — `opacity` is explicitly excluded |

**Not discoverable at the moment it is needed:**

- **#12 `opacity` has no settings row at all.** `search.ts:56` says so in code:
  `HOTKEYS_WITHOUT_SETTINGS_ROW = new Set(["opacity"])`. Its only appearance in the whole UI is the
  `HotkeysPopover`, which lives in the HUD. From the launcher, ⌘⇧+/− is unfindable and unchangeable.
  (`AppearanceSection.tsx:44-56` exposes the opacity *value*, not the shortcut.)
- **The three field bindings are not configurable and only listed in the HUD popover.** `Enter` to
  send is hardcoded in `Composer.tsx:129-134` (`e.key === "Enter" && !e.shiftKey && !isComposing`);
  Shift+Enter for a newline is the browser default. Neither appears in `HotkeysSection`, so a user
  browsing the launcher's "Клавиши" tab never learns them. `AccessCodeForm.tsx:45-47` and
  `ContextLibraryPanel.tsx:284-290` add their own unlisted Enter/Escape bindings.
- **The `HotkeysPopover` itself is behind an icon-only button** with no visible label, in the HUD
  only. There is no shortcut to open it, and there is no equivalent overview in the launcher —
  `HotkeysSection` shows editors, not a cheat sheet, and omits 5 of 17 actions.
- **The launcher has no hotkeys of its own and no ⌘K for its search.** This is deliberate
  (invariant 13, "no hardcoded hotkey combinations"), and it is respected: `LauncherSearch.tsx` has
  no `window` keydown listener, and `create_launcher_window` (`src-tauri/src/window.rs:47-73`)
  registers nothing — global shortcuts are attached in `launch_main_window` only. The cost is that
  the launcher's search is mouse-or-Tab only, and every screen switch is a mouse-or-Tab operation.

### Conflicts with OS/browser bindings the defaults knowingly steal

| Combo | Action | What it displaces (macOS) | What it displaces (Windows/WebView2) |
| --- | --- | --- | --- |
| ⌘R / Ctrl+R | #1 record | — (in a webview, Reload) | Reload |
| ⌘⇧T / Ctrl+Shift+T | #15 teleprompter | Reopen closed tab | Reopen closed tab |
| ⌘⇧N / Ctrl+Shift+N | #14 duplicate chat | New incognito window | New incognito window |
| ⌘⇧A / Ctrl+Shift+A | #6 screenshot | Search tabs (Chrome) | Search tabs |
| ⌘⇧H / Ctrl+Shift+H | #9 toggle window | macOS: Hide Others is ⌘⌥H, so free | Home (some browsers) |
| ⌘⇧D / Ctrl+Shift+D | #8 focus prompt | Bookmark all tabs | Bookmark all tabs |
| ⌘ + digit / Ctrl + digit | #7 quick actions | **Switch to tab N** | Switch to tab N |
| ⌥ + ↑↓ | #13 scroll chat | — | — |
| Esc | #3, #16 | Radix dialog close | Radix dialog close |
| Space | #17 teleprompter pause | Scroll / activate focused button | Scroll / activate focused button |

The three that matter for a redesign: **⌘/Ctrl + digit** (#7) blocks the most natural keyboard
navigation gesture for a tabbed launcher; **Esc** (#3, #16) is already double-booked with Radix
dialog dismissal and with `HotkeyCapture`'s own cancel (`HotkeyCapture.tsx:23`); **Space** (#17)
collides with "activate the focused button" whenever the teleprompter is open, which is exactly
when the overlay has no focus trap (see Keyboard item 6).

---

## Measured contrast

**Method.** A script in the scratchpad implements `oklch()` → OKLab (polar→rectangular) → linear
sRGB via Ottosson's matrices exactly as specified in CSS Color 4 → gamma-encoded sRGB (per-channel
gamut clip) → WCAG relative luminance → `(L1+0.05)/(L2+0.05)`. It self-checks against the CSS
Color 4 sample values: `oklch(0.62796 0.25768 29.234)` → **#FF0000**, `oklch(0.86644 0.2948
142.495)` → **#00FF00**, `oklch(0.45201 0.31321 264.052)` → **#0000FF**, `oklch(0.59987 0 0)` →
**#808080**, white-on-black **21.00:1** — all exact. Translucent tokens (`--border`, `--input`,
`--surface`, `--code-surface` in `:root`) are composited source-over onto the opaque surface they
actually sit on before the ratio is taken; the parent used for each pairing is named in the table.

**Cascade note for scope D.** `--border`/`--input`/`--ring` are declared both in
`:root[data-theme="black"]` (`index.css:48-49`) and in `body.launcher` (`index.css:121-123`). These
are different elements: `:root` is `<html>`, `body.launcher` is `<body>`. Custom properties inherit,
so on `<body>` and everything below it the `body.launcher` values win. Scope D therefore uses
`border` 8%, `input` 10%, `ring` blue — not the black theme's 9%/11%/oxblood.

**The font scale makes "large text" essentially unreachable.** `index.css:84-88`: `--text-hint`
10.5px, `--text-caption` 11.5px, `--text-body` 12.5px, `--text-chat` = `--chat-font-size` (default
13.5px, range 10–20px, `src-tauri/src/settings.rs:96`), `--text-title` 15px. Against the
≥18.66px-regular / ≥14px-bold threshold: **nothing at hint/caption/body qualifies**. `--text-title`
15px is used twice (`ScreenShell.tsx:17`, `ui/dialog.tsx:111`) and both times with `font-semibold`
(600, not 700) — treat it as body text. Only `--text-chat` raised to its 20px maximum would qualify,
and that is the user's chat font, not UI chrome. **So the 3:1 large-text allowance applies to
nothing in this UI. Every text pairing below is judged at 4.5:1.**

### A. HUD / gray — `:root` (index.css:6-38)

| use | fg | bg | ratio | need | verdict |
| --- | --- | --- | ---: | ---: | --- |
| body text 12.5px | `foreground` #EEEEEE | `background` #212124 | 13.84 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `card` #2B2B2E | 12.21 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `popover` #2D2D30 | 11.79 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `surface` #38383A (over card) | 10.15 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `surface-active` #424245 | 8.62 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `muted` / `secondary` #353538 | 10.57 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `accent` #443637 | 9.86 | 4.5 | PASS |
| hint 10.5 / caption 11.5 | `muted-foreground` #A1A1A6 | `background` #212124 | 6.21 | 4.5 | PASS |
| hint 10.5 / caption 11.5 | `muted-foreground` #A1A1A6 | `card` #2B2B2E | 5.48 | 4.5 | PASS |
| hint 10.5 / caption 11.5 | `muted-foreground` #A1A1A6 | `popover` #2D2D30 | 5.29 | 4.5 | PASS |
| hint 10.5 / caption 11.5 | `muted-foreground` #A1A1A6 | `surface` #38383A | 4.56 | 4.5 | PASS |
| hint 10.5 / caption 11.5 | `muted-foreground` #A1A1A6 | `surface-active` #424245 | **3.87** | 4.5 | **FAIL** |
| hint 10.5 / caption 11.5 | `muted-foreground` #A1A1A6 | `muted` #353538 | 4.74 | 4.5 | PASS |
| btn label on fill | `primary-foreground` #FCF3F1 | `primary` #A51C34 | 6.84 | 4.5 | PASS |
| btn label on fill | `destructive-foreground` #FCF3F1 | `destructive` #E23532 | **4.00** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `background` #212124 | **3.66** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `card` #2B2B2E | **3.23** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `popover` #2D2D30 | **3.12** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `surface` #38383A | **2.68** | 4.5 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `background` #212124 | **2.14** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `card` #2B2B2E | **1.89** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `popover` #2D2D30 | **1.82** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `surface` #38383A | **1.57** | 3 | **FAIL** |
| UI object: destructive | `destructive` #E23532 | `card` #2B2B2E | 3.23 | 3 | PASS |
| UI object: destructive | `destructive` #E23532 | `surface` #38383A | **2.68** | 3 | **FAIL** |
| UI object: recording | `recording` #E54056 | `background` #212124 | 3.98 | 3 | PASS |
| UI object: recording | `recording` #E54056 | `card` #2B2B2E | 3.51 | 3 | PASS |
| hairline border | `border` #37373A | `background` #212124 | **1.36** | 3 | **FAIL** |
| hairline border | `border` #404043 | `card` #2B2B2E | **1.37** | 3 | **FAIL** |
| hairline border | `border` #424245 | `popover` #2D2D30 | **1.37** | 3 | **FAIL** |
| hairline border | `border` #4C4C4E | `surface` #38383A | **1.36** | 3 | **FAIL** |
| hairline input | `input` #3C3C3E | `background` #212124 | **1.45** | 3 | **FAIL** |
| hairline input | `input` #444447 | `card` #2B2B2E | **1.46** | 3 | **FAIL** |
| hairline input | `input` #474749 | `popover` #2D2D30 | **1.46** | 3 | **FAIL** |
| focus ring (solid) | `ring` #BF525A | `background` #212124 | 3.48 | 3 | PASS |
| focus ring (solid) | `ring` #BF525A | `card` #2B2B2E | 3.07 | 3 | PASS |
| focus ring (solid) | `ring` #BF525A | `popover` #2D2D30 | **2.97** | 3 | **FAIL** |
| focus ring (solid) | `ring` #BF525A | `surface` #38383A | **2.55** | 3 | **FAIL** |
| focus ring (solid) | `ring` #BF525A | `primary` #A51C34 | **1.63** | 3 | **FAIL** |
| focus ring (solid) | `ring` #BF525A | `destructive` #E23532 | **1.05** | 3 | **FAIL** |
| surface vs bg | `surface` #2F2F31 | `background` #212124 | **1.19** | 3 | **FAIL** |
| surface vs card | `surface` #38383A | `card` #2B2B2E | **1.20** | 3 | **FAIL** |
| surface-active vs bg | `surface-active` #3A3A3C | `background` #212124 | **1.40** | 3 | **FAIL** |
| surface-active vs card | `surface-active` #424245 | `card` #2B2B2E | **1.42** | 3 | **FAIL** |
| surface-active vs surface | `surface-active` #4E4E50 | `surface` #38383A | **1.41** | 3 | **FAIL** |
| card vs background | `card` #2B2B2E | `background` #212124 | **1.13** | 3 | **FAIL** |
| popover vs background | `popover` #2D2D30 | `background` #212124 | **1.17** | 3 | **FAIL** |
| muted vs background | `muted` #353538 | `background` #212124 | **1.31** | 3 | **FAIL** |
| accent vs card | `accent` #443637 | `card` #2B2B2E | **1.24** | 3 | **FAIL** |
| code-surface vs card | `code-surface` #1E1E20 | `card` #2B2B2E | **1.18** | 3 | **FAIL** |

### B. HUD / black — `:root[data-theme="black"]` (index.css:40-50)

| use | fg | bg | ratio | need | verdict |
| --- | --- | --- | ---: | ---: | --- |
| body text 12.5px | `foreground` #EEEEEE | `background` #0D0D0F | 16.78 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `card` #161618 | 15.65 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `popover` #18181B | 15.32 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `surface` #242426 | 13.43 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `surface-active` #2F2F32 | 11.48 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `muted` / `secondary` #1D1D1F | 14.60 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `accent` #2B1E1E | 13.92 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `background` #0D0D0F | 6.73 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `card` #161618 | 6.28 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `popover` #18181B | 6.14 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `surface` #242426 | 5.39 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `surface-active` #2F2F32 | 4.60 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `muted` #1D1D1F | 5.86 | 4.5 | PASS |
| btn label on fill | `primary-foreground` #FCF3F1 | `primary` #A51C34 | 6.84 | 4.5 | PASS |
| btn label on fill | `destructive-foreground` #FCF3F1 | `destructive` #E23532 | **4.00** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `background` #0D0D0F | **4.44** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `card` #161618 | **4.14** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `popover` #18181B | **4.05** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `surface` #242426 | **3.55** | 4.5 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `background` #0D0D0F | **2.59** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `card` #161618 | **2.42** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `popover` #18181B | **2.37** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `surface` #242426 | **2.08** | 3 | **FAIL** |
| UI object: destructive | `destructive` #E23532 | `card` #161618 | 4.14 | 3 | PASS |
| UI object: destructive | `destructive` #E23532 | `surface` #242426 | 3.55 | 3 | PASS |
| UI object: recording | `recording` #E54056 | `background` #0D0D0F | 4.82 | 3 | PASS |
| UI object: recording | `recording` #E54056 | `card` #161618 | 4.50 | 3 | PASS |
| hairline border | `border` #232325 | `background` #0D0D0F | **1.23** | 3 | **FAIL** |
| hairline border | `border` #2B2B2D | `card` #161618 | **1.28** | 3 | **FAIL** |
| hairline border | `border` #2D2D2F | `popover` #18181B | **1.29** | 3 | **FAIL** |
| hairline border | `border` #37373A | `surface` #242426 | **1.32** | 3 | **FAIL** |
| hairline input | `input` #28282A | `background` #0D0D0F | **1.31** | 3 | **FAIL** |
| hairline input | `input` #2F2F32 | `card` #161618 | **1.36** | 3 | **FAIL** |
| hairline input | `input` #313134 | `popover` #18181B | **1.37** | 3 | **FAIL** |
| focus ring (solid) | `ring` #BF525A | `background` #0D0D0F | 4.22 | 3 | PASS |
| focus ring (solid) | `ring` #BF525A | `card` #161618 | 3.94 | 3 | PASS |
| focus ring (solid) | `ring` #BF525A | `popover` #18181B | 3.85 | 3 | PASS |
| focus ring (solid) | `ring` #BF525A | `surface` #242426 | 3.38 | 3 | PASS |
| focus ring (solid) | `ring` #BF525A | `primary` #A51C34 | **1.63** | 3 | **FAIL** |
| focus ring (solid) | `ring` #BF525A | `destructive` #E23532 | **1.05** | 3 | **FAIL** |
| surface vs bg | `surface` #1B1B1E | `background` #0D0D0F | **1.14** | 3 | **FAIL** |
| surface vs card | `surface` #242426 | `card` #161618 | **1.17** | 3 | **FAIL** |
| surface-active vs bg | `surface-active` #28282A | `background` #0D0D0F | **1.31** | 3 | **FAIL** |
| surface-active vs card | `surface-active` #2F2F32 | `card` #161618 | **1.36** | 3 | **FAIL** |
| surface-active vs surface | `surface-active` #3C3C3E | `surface` #242426 | **1.41** | 3 | **FAIL** |
| card vs background | `card` #161618 | `background` #0D0D0F | **1.07** | 3 | **FAIL** |
| popover vs background | `popover` #18181B | `background` #0D0D0F | **1.10** | 3 | **FAIL** |
| muted vs background | `muted` #1D1D1F | `background` #0D0D0F | **1.15** | 3 | **FAIL** |
| accent vs card | `accent` #2B1E1E | `card` #161618 | **1.12** | 3 | **FAIL** |
| code-surface vs card | `code-surface` #0F0F11 | `card` #161618 | **1.06** | 3 | **FAIL** |

### C. Launcher / gray — `body.launcher` (index.css:112-124)

| use | fg | bg | ratio | need | verdict |
| --- | --- | --- | ---: | ---: | --- |
| body text 12.5px | `foreground` #EEEEEE | `background` #0F0F12 | 16.53 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `card` #18181B | 15.32 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `popover` #202023 | 14.03 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `surface` #212124 | 13.84 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `surface-active` #2D2D31 | 11.80 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `muted` / `secondary` #353538 | 10.57 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `accent` #443637 | 9.86 | 4.5 | PASS |
| hint / caption | `muted-foreground` #A1A1A6 | `background` #0F0F12 | 7.42 | 4.5 | PASS |
| hint / caption | `muted-foreground` #A1A1A6 | `card` #18181B | 6.88 | 4.5 | PASS |
| hint / caption | `muted-foreground` #A1A1A6 | `popover` #202023 | 6.30 | 4.5 | PASS |
| hint / caption | `muted-foreground` #A1A1A6 | `surface` #212124 | 6.21 | 4.5 | PASS |
| hint / caption | `muted-foreground` #A1A1A6 | `surface-active` #2D2D31 | 5.30 | 4.5 | PASS |
| hint / caption | `muted-foreground` #A1A1A6 | `muted` #353538 | 4.74 | 4.5 | PASS |
| btn label on fill | `primary-foreground` #FCF3F1 | `primary` #A51C34 | 6.84 | 4.5 | PASS |
| btn label on fill | `destructive-foreground` #FCF3F1 | `destructive` #E23532 | **4.00** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `background` #0F0F12 | **4.37** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `card` #18181B | **4.05** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `popover` #202023 | **3.71** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `surface` #212124 | **3.66** | 4.5 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `background` #0F0F12 | **2.56** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `card` #18181B | **2.37** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `popover` #202023 | **2.17** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `surface` #212124 | **2.14** | 3 | **FAIL** |
| UI object: destructive | `destructive` #E23532 | `card` #18181B | 4.05 | 3 | PASS |
| UI object: destructive | `destructive` #E23532 | `surface` #212124 | 3.66 | 3 | PASS |
| UI object: recording | `recording` #E54056 | `background` #0F0F12 | 4.75 | 3 | PASS |
| UI object: recording | `recording` #E54056 | `card` #18181B | 4.40 | 3 | PASS |
| hairline border | `border` #222225 | `background` #0F0F12 | **1.21** | 3 | **FAIL** |
| hairline border | `border` #2A2A2D | `card` #18181B | **1.25** | 3 | **FAIL** |
| hairline border | `border` #323235 | `popover` #202023 | **1.27** | 3 | **FAIL** |
| hairline border | `border` #333336 | `surface` #212124 | **1.27** | 3 | **FAIL** |
| hairline input | `input` #272729 | `background` #0F0F12 | **1.28** | 3 | **FAIL** |
| hairline input | `input` #2F2F31 | `card` #18181B | **1.33** | 3 | **FAIL** |
| hairline input | `input` #363639 | `popover` #202023 | **1.35** | 3 | **FAIL** |
| focus ring (solid) | `ring` #73B1E6 | `background` #0F0F12 | 8.38 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `card` #18181B | 7.76 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `popover` #202023 | 7.11 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `surface` #212124 | 7.01 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `primary` #A51C34 | 3.28 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `destructive` #E23532 | **1.92** | 3 | **FAIL** |
| surface vs bg | `surface` #212124 | `background` #0F0F12 | **1.19** | 3 | **FAIL** |
| surface vs card | `surface` #212124 | `card` #18181B | **1.11** | 3 | **FAIL** |
| surface-active vs bg | `surface-active` #2D2D31 | `background` #0F0F12 | **1.40** | 3 | **FAIL** |
| surface-active vs card | `surface-active` #2D2D31 | `card` #18181B | **1.30** | 3 | **FAIL** |
| surface-active vs surface | `surface-active` #2D2D31 | `surface` #212124 | **1.17** | 3 | **FAIL** |
| card vs background | `card` #18181B | `background` #0F0F12 | **1.08** | 3 | **FAIL** |
| popover vs background | `popover` #202023 | `background` #0F0F12 | **1.18** | 3 | **FAIL** |
| muted vs background | `muted` #353538 | `background` #0F0F12 | **1.56** | 3 | **FAIL** |
| accent vs card | `accent` #443637 | `card` #18181B | **1.55** | 3 | **FAIL** |
| code-surface vs card | `code-surface` #111113 | `card` #18181B | **1.07** | 3 | **FAIL** |

### D. Launcher / black — `:root[data-theme="black"] body.launcher` (index.css:126-132)

| use | fg | bg | ratio | need | verdict |
| --- | --- | --- | ---: | ---: | --- |
| body text 12.5px | `foreground` #EEEEEE | `background` #060607 | 17.54 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `card` #0D0D0F | 16.78 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `popover` #131316 | 15.97 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `surface` #161619 | 15.65 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `surface-active` #212125 | 13.84 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `muted` / `secondary` #1D1D1F | 14.60 | 4.5 | PASS |
| body text 12.5px | `foreground` #EEEEEE | `accent` #2B1E1E | 13.92 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `background` #060607 | 7.04 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `card` #0D0D0F | 6.73 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `popover` #131316 | 6.40 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `surface` #161619 | 6.28 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `surface-active` #212125 | 5.55 | 4.5 | PASS |
| hint / caption | `muted-foreground` #97989D | `muted` #1D1D1F | 5.86 | 4.5 | PASS |
| btn label on fill | `primary-foreground` #FCF3F1 | `primary` #A51C34 | 6.84 | 4.5 | PASS |
| btn label on fill | `destructive-foreground` #FCF3F1 | `destructive` #E23532 | **4.00** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `background` #060607 | 4.64 | 4.5 | PASS |
| error text | `destructive` #E23532 | `card` #0D0D0F | **4.44** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `popover` #131316 | **4.22** | 4.5 | **FAIL** |
| error text | `destructive` #E23532 | `surface` #161619 | **4.14** | 4.5 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `background` #060607 | **2.71** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `card` #0D0D0F | **2.59** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `popover` #131316 | **2.47** | 3 | **FAIL** |
| UI object: primary fill | `primary` #A51C34 | `surface` #161619 | **2.42** | 3 | **FAIL** |
| UI object: destructive | `destructive` #E23532 | `card` #0D0D0F | 4.44 | 3 | PASS |
| UI object: destructive | `destructive` #E23532 | `surface` #161619 | 4.14 | 3 | PASS |
| UI object: recording | `recording` #E54056 | `background` #060607 | 5.04 | 3 | PASS |
| UI object: recording | `recording` #E54056 | `card` #0D0D0F | 4.82 | 3 | PASS |
| hairline border | `border` #19191B | `background` #060607 | **1.16** | 3 | **FAIL** |
| hairline border | `border` #202023 | `card` #0D0D0F | **1.20** | 3 | **FAIL** |
| hairline border | `border` #262629 | `popover` #131316 | **1.23** | 3 | **FAIL** |
| hairline border | `border` #28282B | `surface` #161619 | **1.24** | 3 | **FAIL** |
| hairline input | `input` #1E1E20 | `background` #060607 | **1.23** | 3 | **FAIL** |
| hairline input | `input` #252527 | `card` #0D0D0F | **1.27** | 3 | **FAIL** |
| hairline input | `input` #2B2B2E | `popover` #131316 | **1.31** | 3 | **FAIL** |
| focus ring (solid) | `ring` #73B1E6 | `background` #060607 | 8.89 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `card` #0D0D0F | 8.50 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `popover` #131316 | 8.09 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `surface` #161619 | 7.93 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `primary` #A51C34 | 3.28 | 3 | PASS |
| focus ring (solid) | `ring` #73B1E6 | `destructive` #E23532 | **1.92** | 3 | **FAIL** |
| surface vs bg | `surface` #161619 | `background` #060607 | **1.12** | 3 | **FAIL** |
| surface vs card | `surface` #161619 | `card` #0D0D0F | **1.07** | 3 | **FAIL** |
| surface-active vs bg | `surface-active` #212125 | `background` #060607 | **1.27** | 3 | **FAIL** |
| surface-active vs card | `surface-active` #212125 | `card` #0D0D0F | **1.21** | 3 | **FAIL** |
| surface-active vs surface | `surface-active` #212125 | `surface` #161619 | **1.13** | 3 | **FAIL** |
| card vs background | `card` #0D0D0F | `background` #060607 | **1.05** | 3 | **FAIL** |
| popover vs background | `popover` #131316 | `background` #060607 | **1.10** | 3 | **FAIL** |
| muted vs background | `muted` #1D1D1F | `background` #060607 | **1.20** | 3 | **FAIL** |
| accent vs card | `accent` #2B1E1E | `card` #0D0D0F | **1.21** | 3 | **FAIL** |
| code-surface vs card | `code-surface` #09090B | `card` #0D0D0F | **1.02** | 3 | **FAIL** |

### The 6px indicator dots (`size-1.5`, `Sidebar.tsx:61`, `LaunchBar.tsx:40`, `StartScreen.tsx:39`, `PermissionsScreen.tsx:20`, `LauncherPanel.tsx:161`)

A 6px dot is a graphical object: 3:1 is required against its background, and — because the design's
whole point is telling two dots apart — against the sibling dot too.

| scope | pair | ratio | 3:1 |
| --- | --- | ---: | --- |
| all four | `primary` #A51C34 vs `destructive` #E23532 | **1.71** | **FAIL** |
| A / C (gray) | `primary` #A51C34 vs `muted-foreground` #A1A1A6 | **2.90** | **FAIL** |
| A / C (gray) | `destructive` #E23532 vs `muted-foreground` #A1A1A6 | **1.70** | **FAIL** |
| B / D (black) | `primary` #A51C34 vs `muted-foreground` #97989D | **2.59** | **FAIL** |
| B / D (black) | `destructive` #E23532 vs `muted-foreground` #97989D | **1.52** | **FAIL** |
| A. HUD/gray | `primary` on `background` #212124 / `card` #2B2B2E / `surface` #38383A | 2.14 / 1.89 / 1.57 | **FAIL** ×3 |
| A. HUD/gray | `destructive` on same | 3.66 / 3.23 / 2.68 | PASS / PASS / **FAIL** |
| A. HUD/gray | `muted-foreground` on same | 6.21 / 5.48 / 4.56 | PASS ×3 |
| B. HUD/black | `primary` on #0D0D0F / #161618 / #242426 | 2.59 / 2.42 / 2.08 | **FAIL** ×3 |
| B. HUD/black | `destructive` on same | 4.44 / 4.14 / 3.55 | PASS ×3 |
| C. Lnch/gray | `primary` on #0F0F12 / #18181B / #212124 | 2.56 / 2.37 / 2.14 | **FAIL** ×3 |
| C. Lnch/gray | `destructive` on same | 4.37 / 4.05 / 3.66 | PASS ×3 |
| D. Lnch/black | `primary` on #060607 / #0D0D0F / #161619 | 2.71 / 2.59 / 2.42 | **FAIL** ×3 |
| D. Lnch/black | `destructive` on same | 4.64 / 4.44 / 4.14 | PASS ×3 |

The CLAUDE.md rationale — "`--destructive` has been separated from `--primary` in BOTH hue AND
lightness so 6px dots are distinguishable" — is only half realised. The **hue** separation (18 vs 27)
is real. The **lightness** separation (OKLCH L 0.47 vs 0.60) produces a luminance ratio of just
**1.71:1**, well under 3:1. On a greyscale display, in a screenshot converted to mono, or for a
protan/deutan viewer, "blocker" and "ready" dots are the same dot. The `muted-foreground`
"checking" dot is additionally within 1.52–1.70:1 of `destructive` — three states, no two of which
are separable by luminance. Note the dots in `LaunchBar.tsx:41` and `StartScreen.tsx:40` also use
`/40` alpha on `muted-foreground`, which drops them further.

Additionally, the `primary` dot never reaches 3:1 against **any** surface in **any** scope
(1.57–2.71:1), so the "ready / fine / brand" dot is itself sub-threshold as a graphical object.

### The HUD's semi-transparent case: `.app-shell`

`index.css:161-167` paints `.app-shell` as
`color-mix(in oklch, var(--background) calc(var(--app-opacity) * 100%), transparent)`.
`--app-opacity` defaults to `0.9` (`index.css:7`) and the user may set **0.20–1.00**
(`src-tauri/src/settings.rs:89`).

**Assumption, and why.** The desktop behind the window is unknown and unmeasurable — the HUD is
`transparent` + `alwaysOnTop` and floats over whatever the user is doing (a video call, an IDE, a
browser). I therefore evaluate three backdrops and treat **white (#FFFFFF, luminance 1.0) as the
worst case**, because the theme is dark: the lighter the backdrop, the more it lifts the composited
shell and the more it crushes both `foreground` (light-on-light) and `destructive`. A white
video-call background or a light IDE theme is not a corner case; it is the common case for this
product's use.

| `--app-opacity` | theme | desktop behind | composited `.app-shell` | `foreground` | 4.5 | `muted-foreground` | 4.5 | `destructive` | 4.5 |
| ---: | --- | --- | --- | ---: | --- | ---: | --- | ---: | --- |
| 1.00 | gray | any | #212124 | 13.84 | PASS | 6.21 | PASS | 3.66 | FAIL |
| 1.00 | black | any | #0D0D0F | 16.78 | PASS | 6.73 | PASS | 4.44 | FAIL |
| **0.90 (default)** | gray | white | #37373A | 10.19 | PASS | 4.57 | PASS | 2.69 | FAIL |
| 0.90 | gray | mid grey | #2B2B2D | 12.25 | PASS | 5.50 | PASS | 3.24 | FAIL |
| 0.90 | gray | black | #1E1E20 | 14.39 | PASS | 6.46 | PASS | 3.80 | FAIL |
| 0.90 | black | white | #252527 | 13.19 | PASS | 5.29 | PASS | 3.49 | FAIL |
| 0.90 | black | black | #0C0C0E | 16.92 | PASS | 6.79 | PASS | 4.47 | FAIL |
| 0.75 | gray | white | #59595B | 6.07 | PASS | **2.72** | **FAIL** | 1.60 | FAIL |
| 0.75 | gray | mid grey | #39393B | 9.96 | PASS | **4.47** | **FAIL** | 2.63 | FAIL |
| 0.75 | black | white | #49494B | 7.71 | PASS | **3.09** | **FAIL** | 2.04 | FAIL |
| 0.60 | gray | white | #7A7A7C | **3.71** | **FAIL** | **1.66** | **FAIL** | 1.02 | FAIL |
| 0.60 | black | white | #6E6E6F | **4.41** | **FAIL** | **1.77** | **FAIL** | 1.17 | FAIL |
| 0.60 | gray | mid grey | #474749 | 7.99 | PASS | **3.59** | **FAIL** | 2.11 | FAIL |
| 0.50 | gray | white | #909091 | **2.75** | **FAIL** | **1.23** | **FAIL** | 1.38 | FAIL |
| 0.50 | black | white | #868687 | **3.14** | **FAIL** | **1.26** | **FAIL** | 1.20 | FAIL |
| **0.20 (minimum)** | gray | white | #D3D3D3 | **1.30** | **FAIL** | **1.72** | **FAIL** | — | FAIL |
| 0.20 | black | white | #CFCFCF | **1.35** | **FAIL** | **1.85** | **FAIL** | — | FAIL |

At the default 0.90 the primary text is safe on any backdrop and `muted-foreground` is marginal
(4.57:1 over white — a 0.07 margin). Below 0.75 the HUD's secondary text fails on a light desktop;
below 0.60 the primary text fails too; at the permitted minimum 0.20 the window is functionally
unreadable over anything light (1.30:1). **`--app-opacity` is a user-settable slider with no lower
guard on legibility.** Note that `card`/`popover`/`muted` are opaque (`index.css:14,16,18`), so any
card inside the shell is unaffected — only text directly on `.app-shell` is at risk.

### Hardcoded literals (the four Tailwind palette survivors)

| site | colour | composited | vs `foreground` #EEEEEE |
| --- | --- | --- | ---: |
| `components/PreviewPanel.tsx:17` | `bg-white` | #FFFFFF | 1.16:1 — the iframe is an isolated document, so this is correct, but any chrome drawn over it would be invisible |
| `components/AttachmentChip.tsx:17` | `bg-black/75` over `background` | #080809 | 17.27:1 — `text-white` on it, fine |
| `components/Teleprompter.tsx:120` | `bg-black/85` | #050505 | 17.61:1 — fine |
| `components/ui/dialog.tsx:31` | `bg-black/55` | #0F0F10 | 16.56:1 — scrim, fine |

### Code-block palette (`index.css:213-282`), on `code-surface` over launcher/gray `card` = #111113

All nine highlight tokens pass 4.5:1: prose `code` #F2A6A8 9.75, `pre code` #CDCDD4 11.93,
`hljs-comment` #7F7F86 4.78, `hljs-keyword` #EF7D88 7.14, `hljs-string` #93C089 9.08, `hljs-number`
#E4AF72 9.62, `hljs-title` #93C7D9 10.29, `hljs-attr` #CDB4D2 9.93, `hljs-deletion` #EA696E 6.09.
This is the one part of the palette that is already conformant.

### Scrollbars (`index.css:358-371`) — 4px wide, a graphical object

| scope | thumb `oklch(1 0 0 / 14%)` | vs background | 3:1 | hover 28% | 3:1 |
| --- | --- | ---: | --- | ---: | --- |
| A. HUD/gray | #404043 on #212124 | **1.56** | FAIL | #5F5F61 **2.53** | FAIL |
| B. HUD/black | #2F2F31 on #0D0D0F | **1.45** | FAIL | #515152 **2.44** | FAIL |
| C. Lnch/gray | #313133 on #0F0F12 | **1.47** | FAIL | #525254 **2.46** | FAIL |
| D. Lnch/black | #28282A on #060607 | **1.39** | FAIL | #4B4B4D **2.34** | FAIL |

---

## Reduced motion and semantics

### What the `@media (prefers-reduced-motion: reduce)` block covers

`index.css:149-155` silences exactly three selectors: `.launcher-rise`, `.eq-bar`,
`.thinking-shimmer`. Those match the three `@keyframes` declared in the file (`:134` `launcher-rise`,
`:325` `eq`, `:349` `thinking-shimmer`) — so **every keyframe the project itself authors is covered.**

### What it misses

All motion introduced by Tailwind/`tw-animate-css` utilities is outside the block.
`tw-animate-css` ships **no** `prefers-reduced-motion` guard of its own (verified: 0 occurrences of
the string in `node_modules/tw-animate-css/dist/*.css`). Four of fourteen `animate-*` sites carry
`motion-reduce:animate-none`; **ten do not**:

| path:line | class | covered by `motion-reduce`? |
| --- | --- | --- |
| `features/launcher/LauncherPanel.tsx:179` | `animate-in fade-in-0 slide-in-from-bottom-1` | ✅ yes |
| `features/launcher/LauncherSearch.tsx:118` | `animate-in fade-in-0 slide-in-from-top-1` | ✅ yes |
| `features/launcher/screens/SettingsScreen.tsx:43` | `animate-in fade-in-0 slide-in-from-bottom-1` | ✅ yes |
| `components/ThinkingIndicator.tsx:35` | `animate-in fade-in` | ✅ yes |
| `features/launcher/screens/UpdatesScreen.tsx:48` | `animate-pulse` (indeterminate download bar) | ❌ **no** |
| `components/ChatTabs.tsx:93` | `animate-pulse` (streaming dot, 6px) | ❌ **no** |
| `components/StatusBar.tsx:121` | `animate-pulse` (update-in-progress icon) | ❌ **no** |
| `components/UpdateDialog.tsx:130` | `animate-pulse` | ❌ **no** |
| `components/ConnectivityOverlay.tsx:10` | `animate-spin` (full-screen offline spinner) | ❌ **no** |
| `components/ui/dialog.tsx:31` | `animate-in/out fade` (overlay) | ❌ **no** |
| `components/ui/dialog.tsx:53` | `animate-in/out fade + zoom-95` | ❌ **no** |
| `components/ui/popover.tsx:26` | `animate-in/out fade + zoom-95 + slide` | ❌ **no** |
| `components/ui/select.tsx:58` | `animate-in/out fade + zoom-95 + slide` | ❌ **no** |
| `components/ui/tooltip.tsx:40` | `animate-in/out fade + zoom-95 + slide` | ❌ **no** |

The uncovered ones that matter most under a vestibular-disorder lens: the **`zoom-in-95`/`zoom-out-95`
scale animations** on dialog, popover, select and tooltip (scale changes are the classic trigger),
and the **continuously looping** `animate-spin` in `ConnectivityOverlay` and `animate-pulse` in four
places. `slide-in-from-*` is a 4px translate — mild, but still motion.

`transition-*` is not addressed by the block at all. 26 sites: 18 `transition-colors` (harmless —
colour interpolation is not vestibular motion), plus `transition-[width]` ×3 (`UpdatesScreen.tsx:49`
download bar, `StatusBar.tsx:44` context gauge, and `AudioCheckCard.tsx:62`'s level meter is inline
width with no transition), `transition-transform` ×1 (`switch.tsx:25` thumb), `transition-[box-shadow]`
×2 (`slider.tsx:50`, `Composer.tsx:561`). None is large-amplitude; low priority.

Also: `LauncherPanel.tsx:24-26` sets an inline `animationDelay` on the three `.launcher-rise`
elements (0 / 50 / 100 ms). Under reduced motion `animation: none` wins and the delay is inert —
correct behaviour, no flash of invisible content.

### ARIA and semantics — what is present

| Attribute | Count (non-test `.tsx`) | Notes |
| --- | ---: | --- |
| `aria-label` | 30 | Good coverage on icon-only buttons via `IconButton` (see below) |
| `aria-hidden` | 25 | Correctly applied to decorative icons and dots |
| `title` | 63 | The sidebar and every `IconButton` rely on it |
| `role=` | 10 | `tablist` ×2, `tab` ×2, `combobox`, `listbox`, `option`, `group` ×3 |
| `alt=` | 2 | `AttachmentChip.tsx:12` "Вложение", `AnswerPanel.tsx:299` — the only two `<img>` in the app, both covered |
| `htmlFor` | 3 | All three in `fields.tsx` (`:36,41,47`) — the prop exists and **is never passed** |
| `<label>` | 0 | Only the Radix `Label` wrapper (`ui/label.tsx`) |
| `sr-only` | 1 | `ui/dialog.tsx:65`, and the text is **"Close"** — English in an all-Russian UI (`ui/dialog.tsx:100` has the same problem on a visible button) |
| `aria-live` | **1** | `ThinkingIndicator.tsx:36` only |
| `role="status"` / `role="alert"` / `role="log"` / `aria-atomic` / `aria-busy` / `aria-describedby` / `aria-labelledby` | **0** | none anywhere |

**The `title` convention the sidebar relies on.** `Sidebar.tsx:40` sets
`title={itemTitle(label, notice)}` — e.g. "Доступы — Нет доступа к записи системного звука"
(`:16-18`). CLAUDE.md is explicit that this is the *only* place the dot's meaning is stated. It is
**not sufficient**, for three reasons:
1. `title` is not read by VoiceOver or NVDA when an accessible name already exists — and here it
   *is* the accessible name, so the state suffix ("— Нет доступа…") becomes part of the button's
   name and is read on every focus, which is verbose but at least present. Where there is no
   notice, the name is just the label. So AT is mostly served.
2. `title` renders as a native OS tooltip only on **mouse hover**. A keyboard user who tabs to the
   sidebar item never sees it. There is no Radix `Tooltip` on the sidebar (`ui/tooltip.tsx` exists
   but the sidebar does not use it), and Radix tooltips *do* open on focus.
3. `title` has no `aria-describedby` companion, so the dot's colour (the only visual carrier of
   blocker-vs-info) is unavailable to anyone who cannot resolve #A51C34 from #E23532 at 6px — which,
   at 1.71:1, is everyone on a monochrome display.

`SettingsTabsRail.tsx:27` and `IconButton` have the same shape. `IconButton.tsx:14` does the right
thing — `aria-label={props["aria-label"] ?? title}` — so all 21 `IconButton` sites have a real
accessible name, not just a tooltip.

### What is missing on interactive controls

| path:line | Control | Missing |
| --- | --- | --- |
| `components/AccessCodeForm.tsx:35-48` | Access-code `Input` | No `aria-label`; the accessible name is the placeholder `"XXXXX-XXXXX-XXXXX-XXXXX"` |
| `components/AccessCodeForm.tsx:53` | Redemption error `<span>` | No `aria-live` / `role="alert"` — an invalid code fails silently for AT |
| `features/launcher/ContextLibraryPanel.tsx:333`, `:360`, `:273` | Doc name `Input`, doc text `Textarea`, folder rename `Input` | No `aria-label`; only placeholders (and `:273` has none at all) |
| `features/launcher/ContextLibraryPanel.tsx:347` | Folder `SelectTrigger` | No `aria-label` |
| `features/launcher/AudioCheckCard.tsx:86-96` | Two "Проверить" buttons | Identical accessible names, and unlike `StartScreen.tsx:54` / `PermissionsScreen.tsx:41` there is **no `role="group" aria-label`** wrapper, so "Системный звук" vs "Микрофон" is not conveyed |
| `features/launcher/AudioCheckCard.tsx:82` | The check result ("Расслышала: «…»", "Тишина…") | Rendered as a `SettingRow` `hint` `<p>` (`fields.tsx:50`) with no `aria-live` — the whole point of the feature is a result that appears 5 s later, unannounced |
| `features/launcher/LauncherPanel.tsx:159-164` | Save-error banner | No `aria-live` / `role="alert"` |
| `features/launcher/HotkeysSection.tsx:53-59` | `StolenNote` ("⌘R снят у действия «…»") | No `aria-live` — a *destructive side effect* of the user's action, announced to nobody |
| `components/StatusBar.tsx:92-97` | HUD error line | No `aria-live` / `role="alert"`; the full text is in `title` on a non-focusable span |
| `components/StatusBar.tsx:90` + `EqBars.tsx:13` | Recording / transcribing / auto-listening indicator | `aria-hidden` on the whole equaliser. **There is no other signal**: no text, no `aria-live`, no `aria-pressed` anywhere for recorder state |
| `components/AnswerPanel.tsx:221-229`, `:382` | The streaming answer | No live region; the answer arriving is never announced |
| `features/launcher/screens/UpdatesScreen.tsx:40-58` | Download progress | No `role="progressbar"`, no `aria-valuenow`; the percent is a plain `<span>` |
| `components/Teleprompter.tsx:120`, `components/ConnectivityOverlay.tsx:8` | Full-screen overlays | No `role="dialog"`, no `aria-modal`, no focus trap, no `aria-live` on the offline message |
| `components/UpdateDialog.tsx:72` | Update dialog | No `DialogDescription` — Radix requires one or `aria-describedby={undefined}` |
| `features/launcher/Sidebar.tsx:74`, `SettingsTabsRail.tsx:53` | Both tab rails | No `aria-controls`, no matching `role="tabpanel"`, no roving `tabIndex`, no arrow keys |
| whole app | Landmarks | No `<nav>`, no `<main>`, no `aria-label` on any region. `<header>` ×3 and `<section>`/`<aside>` exist but unlabelled |

### Are the three state changes the brief asks about announced?

| State change | Announced? | Where it would have to go |
| --- | --- | --- |
| **Recording started / stopped** | **No.** The only carrier is `EqBars`, which is `aria-hidden` (`EqBars.tsx:13`). `useRecorder`'s `RecorderState` never reaches the accessibility tree. | `StatusBar.tsx:90` |
| **An answer streaming** | **Partly.** `ThinkingIndicator.tsx:36` has `aria-live="polite"` on the static string "Думает…", so mounting it announces once that thinking started (the elapsed counter next to it is `aria-hidden`, `:39`). The answer text itself (`AnswerPanel.tsx:382`) and the completion (`llm-done`) are silent. | `AnswerPanel.tsx:221` |
| **An error appearing** | **No**, in every location: HUD `StatusBar.tsx:96`, launcher `LauncherPanel.tsx:162`, access code `AccessCodeForm.tsx:53`, audio check `AudioCheckCard.tsx:55`, updater `UpdatesScreen.tsx:107`, context import `ContextLibraryPanel.tsx:492`. Six error surfaces, zero live regions. | all six |

---

## Performance

### Source size by area (measured, non-test files only)

| Area | Files | Lines | `du -sh` |
| --- | ---: | ---: | ---: |
| `src/features/launcher` | 34 | 3 962 | 248K |
| `src/components` | 32 | 3 058 | 208K |
| `src/hooks` | 22 | 1 666 | 220K |
| `src/lib` | 27 | 1 698 | 244K |
| `src/ipc` | 5 | 588 | 44K |
| `src/App.tsx` | 1 | 902 | 32K |
| `src/index.css` | 1 | 374 | 12K |

Largest single files: `ContextLibraryPanel.tsx` 605, `search.ts` 320, `LauncherPanel.tsx` 220,
`StartScreen.tsx` 210, `PresetsSection.tsx` 179.

### Prebuilt bundle — `apps/desktop/dist` exists (built 24 Aug 00:21, not rebuilt for this audit)

| asset | raw | gzip | brotli | loaded by |
| --- | ---: | ---: | ---: | --- |
| `launcher-CQaYxfvX.js` | 88 922 | 26 011 | 22 550 | launcher only |
| `main-qfUZhQru.js` | 264 198 | 80 562 | 65 752 | HUD only |
| `render-root-CxDMB2kp.js` | **705 070** | **203 811** | 170 965 | **both** |
| `render-root-D3xAE4mx.css` | 70 950 | 12 356 | 10 486 | **both** |

Confirmed from `dist/launcher.html` and `dist/index.html`: each HTML entry loads its own entry
chunk plus a `modulepreload` of the shared `render-root` chunk plus the single shared stylesheet.

| Entry | Raw total | Gzip total |
| --- | ---: | ---: |
| **launcher** | **864 942 B (845 KB)** | **242 178 B (237 KB)** |
| **main (HUD)** | **1 040 218 B (1016 KB)** | **296 729 B (290 KB)** |

The launcher — a settings window — parses and executes **794 KB of JavaScript** before it can paint.
82 % of that is the shared chunk it did not ask for.

### Where the weight is

- **`react-markdown` + `remark-gfm` + the micromark/hast pipeline is in the shared chunk**, because
  `features/launcher/screens/UpdatesScreen.tsx:1-2` imports them to render release notes. Markers
  confirm it: `micromark` ×3, `hast-util` ×3, `react-markdown` ×1 in `render-root-CxDMB2kp.js`; zero
  in `launcher-CQaYxfvX.js`. The launcher therefore pays the full markdown parser to display a
  release-notes blob that is shown only on one screen, only when an update exists.
- **`rehype-highlight` bundles all 37 `lowlight` `common` grammars, and they are HUD-only.** Good
  news first: `hljs` ×4, `highlightAuto` ×3, `keyword` ×253 and 29 `aliases:[` all appear in
  `main-qfUZhQru.js` and **not** in the shared chunk, so the launcher does not pay for them.
  But `AnswerPanel.tsx:68-73` passes `{ detect: true, plainText, subset }` and **no `languages`
  option**, so `rehype-highlight/lib/index.js:48` falls back to `const languages = settings.languages
  || common` — the full `common` set. `subset` only narrows *autodetection*; it does not narrow what
  is registered or bundled. Raw ESM source of those 37 grammars on disk: **309 507 B (302 KB)**,
  which after minification is the bulk of the 264 KB `main` chunk. Passing an explicit `languages`
  map of the ~8 languages an interview assistant actually sees would cut the HUD chunk by well over
  half.
- **`lucide-react` imports are tree-shakeable as written.** Every import is the named form
  (`import { Play } from "lucide-react"` — 25 import sites, zero deep `lucide-react/…` paths), and
  the package declares `"sideEffects": false` with an ESM `module` entry, so Rollup drops the rest of
  the 39 MB on disk. **61 distinct icons** are imported: 22 launcher-only, 31 HUD-only, 8 shared
  (the shared ones come from `components/ui/*`, which both windows use).
- **`radix-ui` is the unified package** and is imported as `import { Dialog as DialogPrimitive } from
  "radix-ui"` in nine files. This is namespace-import-through-a-barrel; it tree-shakes correctly with
  Rollup because the package is ESM with no side effects, and only 9 of ~30 primitives are touched
  (Dialog, Label, Popover, ScrollArea, Select, Slider, Slot, Switch, Tooltip). No action needed, but
  note that `Tooltip` is imported by `ui/tooltip.tsx` and **that file has no consumer in the app** —
  a candidate for `knip` if the redesign does not adopt it.
- **`@tanstack/react-query` is mounted in both windows** (`render-root.tsx` → `renderWindowRoot`)
  for exactly one query: `useOfficialPresets` (`hooks/useOfficialPresets.ts:10`). 1.7 MB on disk;
  in the shared chunk for both entries.

### Render hotspots

Documented in CLAUDE.md and verified present in the code:

| Hotspot | Where | Status |
| --- | --- | --- |
| `AnswerPanel` re-renders in full on every stream frame | `AnswerPanel.tsx:382` fed by `useClaudeStream.ts:89,96` rAF loop | present by design |
| `MessageImages` `memo` (must not be removed) | `AnswerPanel.tsx` — 2 `memo(` in the file | present |
| `AttachmentList` index key | `Composer.tsx:150` `key={i}` | present, and correct for the reasons documented |
| rAF coalescing of `WM_SIZE` | `App.tsx:259-264` | present |

Found in addition:

| # | path:line | What |
| --- | --- | --- |
| 1 | `features/launcher/search.ts:281-320` | **The whole search index is rebuilt on every keystroke.** `LauncherSearch.tsx:34` memoises on `[query, sources]`, so each character allocates a fresh `launcherIndex(sources, platform)`: ~54 base hits (6 screens + 7 tabs + 16 hotkeys + 22 settings rows + 3 permissions) each a new 6-field object, each built through `breadcrumbOf` → two linear `.find()` lookups + a `join`, then ranked with 1–2 `toLocaleLowerCase("ru")` calls each. Plus one object per preset, quick action and context doc. Cheap at today's sizes, linear in the context library, and trivially fixable by hoisting the static half of the index to module scope. |
| 2 | `LauncherPanel.tsx:105-114` | Autosave effect keyed on `[draft, launching]`. Every keystroke in any field produces a new `draft` object → the effect tears down and re-creates a 600 ms timer, and `normalizeDraft` (two `.filter()` passes over presets and quick actions) runs on every fire. Correct, but it means the whole `Settings` object is re-serialised and IPC'd 600 ms after the last keystroke of every edit. |
| 3 | `useHotkeyEditor.ts:20-43` | Called independently by three sections (`HotkeysSection.tsx:64`, `QuickActionsSection.tsx:87`, `WindowSection.tsx:40`). Each instance keeps its **own** `stolen` state, and the returned object plus both closures are recreated on every render (no `useCallback`, no `useMemo`), so `HotkeyRow`/`StolenNote` can never be memoised. With 12 `HotkeyRow`s on the Клавиши tab that is 12 re-renders + 12 new closures per keystroke elsewhere in the draft. |
| 4 | `LauncherPanel.tsx:56-66` | `searchSources` `useMemo` runs `mergePresets(official, draft.prompt_presets)` plus three `.map()`s whenever any of four deps change — including `contextLibrary.library.docs`, which is a fresh array after every library mutation. |
| 5 | `useOfficialPresets` is called twice | `LauncherPanel.tsx:54` and `PresetsSection.tsx:97`. React Query dedupes the fetch, but there are two subscriptions and two `useEffect`s (`useOfficialPresets.ts` has 2) re-registering the `official-presets-updated` listener. |
| 6 | `useContextLibrary.ts:49-58` | Save effect keyed on `[library]`; `serializeLibrary(library)` stringifies **every doc's full text** on a 500 ms debounce after any edit — including a folder rename. |
| 7 | `ThinkingIndicator.tsx:20-22` | `setInterval` at 1 Hz driving a `setState` while the answer streams, i.e. concurrently with the rAF reveal loop. Cheap, but it is a second timer on the same busy main thread. |
| 8 | `Sidebar.tsx:87` | `notices.find(...)` inside the `.map()` over screens — O(screens × notices). Irrelevant at 6×2, listed for completeness. |
| 9 | `HotkeyCapture.tsx:34` | `window.addEventListener("keydown", …, capture)` is added and removed on every `[capturing, onChange]` change. `onChange` is an inline arrow at `HotkeysSection.tsx:28-30`, so it is a new function on every parent render — the listener is torn down and re-attached on every render while capture is active. |

Memoisation is otherwise sparse in the launcher: `LauncherPanel.tsx` has 3 `useMemo` and **0**
`useCallback`; no launcher component is wrapped in `memo`. Every callback passed down
(`onSelect`, `onNavigate`, `set`, `onChange`, `onRemove`) is an inline arrow.

### Startup path — process start to the launcher's first paint

**Rust, `src-tauri/src/lib.rs:69-93` (`setup_app`), strictly sequential before the window exists:**

| Step | Line | Blocks first frame? |
| --- | --- | --- |
| `preferences::load_dotenv_files()` | `:70` | **yes** — disk I/O |
| `preferences::load_settings_with_env_key_fallback()` | `:71` | **yes** — reads settings.json |
| `remote_presets::load_initial()` | `:72` | **yes** — disk read, `include_str!` fallback |
| `llm::fallback_models()` + `build_stt_client` + `build_llm_client` | `:73-75` | yes, but in-memory |
| `spawn_startup_warm_up_and_model_fetch` → `stt.warm_up()` + `llm.list_models()` | `:76`, `:95-102` | **no** — `tauri::async_runtime::spawn`, joined off-thread |
| `handle.manage(...)` | `:77-84` | yes, cheap |
| **`window::create_launcher_window`** | `:85` (`window.rs:47-73`) | this *is* the first frame |
| `install_default_output_device_listener`, `install_move_keys_monitor`, `disable_cursor_autohide_on_typing` | `:88-90` | after window creation |
| `update::spawn_auto_check` (`check_for_update`) | `:91` | **no** — spawned |
| `remote_presets::spawn_refresh` | `:92` | **no** — spawned |

**Frontend, after the webview loads:**

1. Parse + execute **793 992 B** of JS (`launcher` 88 922 + shared 705 070) and **70 950 B** of CSS.
2. `LauncherApp` mounts. `useSettingsStore.ts:23-24` starts at `DEFAULT_SETTINGS` with
   `loading = true`, so `LauncherApp.tsx:65-70` renders a **bare "Загрузка…" screen** — the real UI
   is gated on `get_settings` returning. This is the single blocking IPC round-trip.
3. In parallel and **not** blocking the first paint: `usePermissions.ts:35-37` → `permissions_status`
   (on macOS this preflights the Core Audio tap and `CGPreflightScreenCaptureAccess` — the slowest
   of the four); `useUpdater.ts:24-32` → `get_app_version` + three `onEvent` subscriptions;
   `useContextLibrary.ts:36-47` → `load_context_library` (reads the entire library including every
   doc's text).
4. `get_official_presets` (`useOfficialPresets`) only starts once `LauncherPanel` mounts, i.e. after
   step 2 completes — it is behind the loading gate, not parallel to it.
5. First real paint. Then `.launcher-rise` plays: 0.38 s duration staggered 0/50/100 ms
   (`LauncherPanel.tsx:21,24-26`), starting from `opacity: 0` — so the header, sidebar and screen
   are **invisible for up to 480 ms after the first paint**. Under `prefers-reduced-motion` they
   appear instantly (`index.css:149-155`), which is the better behaviour of the two.

**Summary of what blocks:** three synchronous disk reads in Rust, then ~794 KB of JS parse/execute,
then one `get_settings` round-trip, then a 380–480 ms opacity ramp. `permissions_status`,
`list_models`, `check_for_update` and `get_official_presets` do **not** block the first frame.

### What will bite a redesign

| Change | What bites |
| --- | --- |
| **Adding animation** | Ten `animate-*` sites already escape the reduced-motion block; every new keyframe must be added by hand to `index.css:149-155` (invariant 8) *and* every `tw-animate-css` utility needs its own `motion-reduce:animate-none`. Additionally invariant 4 forbids `transition-opacity` in the HUD (WKWebView layer promotion) — `.launcher-rise` is opacity-based and is the sanctioned exception *because the launcher is opaque*; do not carry that pattern into the HUD. |
| **Adding a light theme** | Every one of the four scopes currently derives structure from lightness deltas of **1.02–1.46:1** (`card`↔`background`, `border`, `input`, `surface`). Those deltas invert but do not survive a flip: `--border: oklch(1 0 0 / 8-10%)` is white-on-dark and becomes invisible on a light surface — a light theme needs a separate `--border` (black-alpha), not a re-tint. `--primary` #A51C34 at 2.14:1 on today's darkest background will get *worse* on a light one for the same reason `--destructive` gets better. `--ring` is currently oxblood in the HUD and blue in the launcher — two rings, and the HUD one already fails at every alpha; a light theme adds a third. Finally, `applyTheme` (`lib/window-controls.ts`) writes `data-theme` and the OS colour-scheme preference is consulted nowhere — a light theme needs a `prefers-color-scheme` path that does not exist today, and `create_launcher_window` hardcodes `.theme(Some(tauri::Theme::Dark))` (`window.rs:67`). |
| **Adding more components** | The launcher already ships 794 KB of JS for a settings window, 82 % of it a shared chunk it inherits. Every new component lands in the shared chunk if it is used by both windows, and there is no route-level code splitting anywhere (no `React.lazy`, no dynamic `import()` in the repo). The cheapest structural win available before any of this: `React.lazy` the `UpdatesScreen`'s markdown renderer, which alone would move the micromark/hast pipeline out of the launcher's critical path. |

---

## Problems

### P0 — blocks the target outcome

| # | Problem | Evidence |
| --- | --- | --- |
| P0-1 | **The HUD has no conformant focus indicator on any control.** `ring-ring/60` = 1.92–2.21:1; `ring-ring/40` = 1.50–1.61:1; on a primary fill 1.32:1; on a destructive fill (`ring-destructive/40`) 1.48:1 against the surround and 2.19:1 against the fill. Required: 3:1 (WCAG 2.4.11/1.4.11). | `button.tsx:7,14,16`, `input.tsx:11`, `textarea.tsx:9`, `select.tsx:33`, `slider.tsx:50`, `switch.tsx:17`; ratios in **Visible focus** |
| P0-2 | **The launcher's text fields, selects and sliders have no conformant focus indicator either** — `ring-ring/40` measures 2.21–2.30:1 in both launcher scopes. | `input.tsx:11`, `textarea.tsx:9`, `select.tsx:33`, `slider.tsx:50` |
| P0-3 | **`--primary` fails 3:1 as a graphical object in all four scopes** (1.57–2.71:1) — including the "ready" dot, the active-tab underline (`Sidebar.tsx:53`, `SettingsTabsRail.tsx:40`), the list markers (`index.css:211`), the progress fills (`UpdatesScreen.tsx:49`, `AudioCheckCard.tsx:62`) and the equaliser. | **Measured contrast**, all four tables |
| P0-4 | **The two indicator dots are 1.71:1 apart.** The stated invariant that hue *and* lightness were separated so 6px dots are distinguishable holds for hue only. Add `muted-foreground` at 1.52–1.70:1 from `destructive` and the three-state vocabulary collapses to one greyscale value. | **Measured contrast → 6px indicator dots** |
| P0-5 | **`--destructive` fails AA as text in 11 of 12 pairings** (3.12–4.44:1), and `destructive-foreground` on a `destructive` fill is 4.00:1. Errors are the one message class that must be readable. | all four tables |
| P0-6 | **No error, anywhere, is announced to assistive tech.** Six error surfaces, zero live regions. Recording start/stop is `aria-hidden`. | `StatusBar.tsx:92`, `LauncherPanel.tsx:159`, `AccessCodeForm.tsx:53`, `AudioCheckCard.tsx:82`, `UpdatesScreen.tsx:107`, `ContextLibraryPanel.tsx:492`; `EqBars.tsx:13` |

### P1

| # | Problem | Evidence |
| --- | --- | --- |
| P1-1 | **`role="tablist"`/`role="tab"` without roving `tabIndex`, arrow keys, `aria-controls` or a `role="tabpanel"`.** The ARIA contract is announced and not honoured, and it costs 6 (sidebar) + 7 (rail) tab stops. | `Sidebar.tsx:38,74`; `SettingsTabsRail.tsx:25,53`; no `tabpanel` in the repo |
| P1-2 | **Activating a screen or tab does not move focus.** After clicking "Старт" the user tabs through 5 more sidebar buttons to reach the content. | `LauncherPanel.tsx:177-180` |
| P1-3 | **`HotkeyCapture` traps the keyboard**: Tab is in `NAMED_CODES` and is captured as a hotkey rather than moving focus. Assigning Tab to a global action would break Tab-navigation in the HUD, and `conflictsWithTyping("Tab")` returns `false`, so nothing warns. | `HotkeyCapture.tsx:20-34`; `lib/hotkey-capture.ts:33,84-93` |
| P1-4 | **Two full-screen overlays with no focus trap.** Everything beneath the teleprompter and the offline overlay stays tabbable and clickable-by-keyboard while invisible. | `Teleprompter.tsx:120`, `ConnectivityOverlay.tsx:8` |
| P1-5 | **Ten `animate-*` sites escape the reduced-motion block**, including four looping animations and four `zoom-95` scale transitions. `tw-animate-css` ships no guard of its own. | table in **Reduced motion** |
| P1-6 | **The launcher parses 794 KB of JS to show a settings window**, 705 KB of it a shared chunk carrying the whole markdown pipeline for one release-notes panel. | `dist/assets/*`, `UpdatesScreen.tsx:1-2` |
| P1-7 | **`--app-opacity` has no legibility floor.** Below 0.75 secondary text fails over a light desktop; at the permitted 0.20 minimum the HUD is at 1.30:1. | `settings.rs:89`, **`.app-shell`** table |
| P1-8 | **`SettingRow`'s `htmlFor` is never passed** — every visible label in every settings row is a floating text node, and the visible text can diverge from the control's `aria-label` (WCAG 2.5.3). | `fields.tsx:36,41,47`; no caller passes it |
| P1-9 | **The `opacity` hotkey (⌘⇧ +/−) is unreachable from the launcher** and excluded from search by name. Its only home is the HUD popover. | `search.ts:56`; no `"opacity"` row in any section |
| P1-10 | **All 37 `lowlight` `common` grammars are bundled** because `AnswerPanel` never passes `languages`. 302 KB of raw grammar source in the HUD chunk. | `AnswerPanel.tsx:68-73`; `rehype-highlight/lib/index.js:48` |

### P2

| # | Problem | Evidence |
| --- | --- | --- |
| P2-1 | Six unlabelled or ambiguously labelled controls: access-code `Input`, doc name/text/rename fields, folder `Select`, and the two identical "Проверить" buttons with no group context. | `AccessCodeForm.tsx:35`; `ContextLibraryPanel.tsx:273,333,347,360`; `AudioCheckCard.tsx:86` |
| P2-2 | `slider.tsx:50` breaks the "focus is one thing: `ring-2`" invariant with `ring-4`. | `slider.tsx:50` |
| P2-3 | The chat-tab close affordance appears on hover only (`group-hover:hidden` / `hidden group-hover:block`), never on focus. | `ChatTabs.tsx:89-90` |
| P2-4 | The context-usage figure's meaning lives in `title` on a non-focusable `<div>` — mouse-only, invisible to AT. | `StatusBar.tsx:40` |
| P2-5 | Import-into-a-folder has no keyboard path (the Import button always targets root). | `ContextLibraryPanel.tsx:436,472` |
| P2-6 | `StolenNote` reports a destructive side effect (a hotkey silently removed from another action) with no live region. | `HotkeysSection.tsx:53-59` |
| P2-7 | Two English strings ("Close") in an all-Russian UI, one of them the only `sr-only` text in the app. | `ui/dialog.tsx:65,100` |
| P2-8 | `UpdateDialog` has no `DialogDescription`; Radix warns and the dialog has no accessible description. | `UpdateDialog.tsx:72-103` |
| P2-9 | Download progress has no `role="progressbar"`/`aria-valuenow`. | `UpdatesScreen.tsx:40-58` |
| P2-10 | Scrollbar thumbs are 1.39–1.56:1 (2.34–2.53:1 on hover) at 4px wide. | `index.css:358-371` |
| P2-11 | No landmarks anywhere — no `<nav>`, no `<main>`, no labelled regions; nothing for landmark navigation to find. | grep: `role=` ×10, none a landmark |

### P3

| # | Problem | Evidence |
| --- | --- | --- |
| P3-1 | The search index is rebuilt from scratch on every keystroke (~54 objects + ~100 `toLocaleLowerCase` calls). | `search.ts:281-320`, `LauncherSearch.tsx:34` |
| P3-2 | `useHotkeyEditor` returns a fresh object and two fresh closures each render, from three independent call sites each holding its own `stolen` state. | `useHotkeyEditor.ts:20-43` |
| P3-3 | `HotkeyCapture`'s window listener is re-attached on every render while capturing (`onChange` is an inline arrow). | `HotkeyCapture.tsx:34,38`; `HotkeysSection.tsx:28-30` |
| P3-4 | `serializeLibrary` stringifies every doc's full text 500 ms after any library edit, including a folder rename. | `useContextLibrary.ts:49-58` |
| P3-5 | `useOfficialPresets` is mounted twice; two subscriptions to the same event. | `LauncherPanel.tsx:54`, `PresetsSection.tsx:97` |
| P3-6 | The search listbox's `role="option"` buttons are focusable but unmount on the input's `onBlur`. | `LauncherSearch.tsx:86,127` |
| P3-7 | `ui/tooltip.tsx` has no consumer in the app — dead weight in the shared chunk, and a `knip` candidate. | grep: no `TooltipTrigger` outside `ui/tooltip.tsx` |
| P3-8 | `transition-[width]` ×3 and `transition-transform` ×1 are outside the reduced-motion block. | `UpdatesScreen.tsx:49`, `StatusBar.tsx:44`, `switch.tsx:25` |

---

## Opportunities

1. **Make the ring solid and make it one colour.** Dropping `/60` and `/40` and using `--ring` at
   full opacity fixes 4 of 6 P0/P1 focus rows for free: the launcher's blue ring already measures
   7.01–8.89:1 on flat surfaces and 3.28:1 on a primary fill. Unifying on the launcher's blue for
   both windows would put every focus ring above 3:1 except against a `destructive` fill (1.92:1) —
   which is solved by an outline-offset gap or a two-tone ring (light core + dark halo) that
   contrasts with whatever it sits on.
2. **Re-derive `--primary` for indicator duty.** At OKLCH L 0.47 it cannot reach 3:1 against a
   background at L 0.12–0.25. Either raise the indicator variant's lightness (a separate
   `--primary-indicator` token, keeping the oxblood fill for buttons where `primary-foreground`
   already passes at 6.84:1) or accept that dots must be distinguished by **shape** as well as
   colour — which also fixes P0-4 for colour-blind users in a way no palette change can.
3. **Separate the three dot states by luminance, not hue.** Target ≥3:1 between any two of
   ready/blocker/checking. A ladder of roughly L 0.45 / 0.70 / 0.90 would do it while keeping the
   hues; pairing each with a distinct glyph (✓ / ! / ·) removes the dependency entirely.
4. **Lift `--destructive` for text use.** Raising OKLCH L from 0.60 to ~0.72 at the same hue would
   clear 4.5:1 on every surface in all four scopes while leaving the fill variant alone.
5. **Add one `role="status"` region per window and route every transient message through it.**
   Six error surfaces, the audio-check result, the `StolenNote`, recorder state and stream
   completion all become announced with a single shared component.
6. **Implement the tabs pattern properly or drop the roles.** Roving `tabIndex` + Home/End/Arrows
   turns 13 tab stops into 2 and makes the announced role honest. Either way, add `aria-controls`
   and a `role="tabpanel"` on the screen container, and focus the panel on activation (P1-2).
7. **`React.lazy` the release-notes markdown.** The launcher's shared chunk drops the entire
   micromark/hast pipeline; the HUD keeps it. This is the single largest bundle win available
   without touching product code.
8. **Pass an explicit `languages` map to `rehype-highlight`.** 8 grammars instead of 37 would cut
   the HUD chunk by more than half; the `subset` option already in place documents which ones matter.
9. **Give `SettingRow` a generated id and wire `htmlFor`.** One change in `fields.tsx` fixes
   label association for every settings row in the app and restores click-the-label-to-focus.
10. **Clamp `--app-opacity` at 0.75, or paint an opaque scrim behind text.** The current 0.20 floor
    produces a 1.30:1 window. A card-backed layout (cards are already opaque) would let the slider
    keep its full range without ever putting text directly on the translucent shell.
11. **Add a skip-to-content affordance.** Even one `sr-only` skip link before the sidebar removes
    6 tab stops from every screen visit and costs nothing visually.

---

## Open questions for the human

1. **What is the accessibility target?** Nothing in the repo states one. AA at 4.5:1/3:1 is what I
   measured against; if the target is AAA (7:1) then `muted-foreground` fails in scope A on four of
   six surfaces and the palette needs a bigger rework than P0 implies.
2. **Is the oxblood `--primary` negotiable?** It cannot reach 3:1 as a graphical object at OKLCH
   L 0.47 against any surface in this palette. Either the brand colour moves, or indicators stop
   using it, or the app accepts a documented 1.4.11 failure on every dot, underline and progress
   fill. This is a brand decision, not a technical one.
3. **Should the ring be one colour across both windows?** Today it is oxblood in the HUD and blue in
   the launcher. The blue passes; the oxblood does not. Unifying is the cheap fix but changes the
   HUD's look.
4. **Is `⌘/Ctrl + digit` (quick actions) defensible if the launcher gains keyboard navigation?**
   It is the natural gesture for "jump to screen N" and it is already taken, globally, by the HUD.
5. **Does `prefers-reduced-motion` need to cover `zoom-95` on Radix surfaces?** Silencing dialog and
   popover entrance animations is correct per the spec but visibly changes the app for a setting the
   team may not have intended to honour that far.
6. **Is a light theme actually in scope?** If so, `--border`/`--input` (white-alpha) and
   `--ring`/`--primary` all need light-mode counterparts, `create_launcher_window` must stop
   hardcoding `tauri::Theme::Dark` (`window.rs:67`), and `Settings.theme` grows a third value —
   which is a Rust clamp change and a `bindings.ts` regeneration, not a CSS change.
7. **How far below 0.90 should `--app-opacity` be allowed to go?** The current 0.20 minimum
   guarantees an unreadable window on a light desktop. Is the slider's range a feature worth
   defending, or an oversight?
8. **Is the drag-to-folder gesture in the context library considered a shortcut or the primary
   interaction?** If primary, it needs a keyboard equivalent on the row itself; if a shortcut, the
   `title` should move onto a focusable element so keyboard users learn the Edit→Select path exists.
9. **Should the launcher get a hotkeys *overview* (not editor)?** `HotkeysPopover` shows all 17
   actions plus the three field bindings, and it lives only in the HUD. `HotkeysSection` shows 12.
   A user who has not launched the HUD yet cannot learn what Enter, Shift+Enter or ⌘⇧+/− do.
10. **Is `dist/` (built 24 Aug) representative?** All bundle numbers above come from that build. If
    the tree has moved since, re-run `npx nx build desktop` before acting on the size figures — I
    was scoped read-only and did not rebuild.
