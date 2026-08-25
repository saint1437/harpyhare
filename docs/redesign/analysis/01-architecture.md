# 01 — Frontend architecture & state (analyst A)

## Summary

The launcher is 34 source files / 3 962 lines under `apps/desktop/src/features/launcher/`, mounted by a
3-line entry (`src/launcher.tsx:1`) through a shared bootstrap (`src/render-root.tsx:8`). Its whole state
is seven hook instances plus one local `draft: Settings` in `LauncherPanel.tsx:49`; there is no store
library, no router and no context. Navigation is two `useState`s (`LauncherPanel.tsx:51-52`) driven by one
primitive, `goTo({screen, tab})` (`LauncherPanel.tsx:88`), fed by three registries (`screens.ts:27`,
`settings-tabs.ts:19`, `permission-rows.ts:28`) plus the Rust-generated `HOTKEY_ACTIONS`/`SETTINGS_LIMITS`
(`src/ipc/bindings.ts:55,63`). The launcher touches 12 of the 41 Tauri commands and listens to 4 of the 21
events; `close_app` is in `collect_commands!` (`src-tauri/src/bindings.rs:46`) and is never called from TS.
Theming is one file (`src/index.css`, 374 lines) with a 13-line launcher ramp at `index.css:112-132`; not a
single launcher component reads a CSS variable directly. The hard structural fact for a redesign: the
launcher window is **destroyed** on launch (`src-tauri/src/window.rs:197-198`), so every readiness,
permission and audio-health answer it can give disappears the moment the product starts working — and the
HUD has no replacement surface. Nine test files bind to launcher markup; two of them are pure logic.

---

## Findings

### 1. Component tree from each entry point

#### 1.1 Shared bootstrap (both windows)

| Step | Path:line | Note |
| --- | --- | --- |
| HTML entry (launcher) | `apps/desktop/launcher.html:8` | `<body class="launcher">` — the only thing that switches the launcher palette ramp |
| HTML entry (HUD) | `apps/desktop/index.html:8` | bare `<body>` |
| TS entry (launcher) | `apps/desktop/src/launcher.tsx:1-5` | imports `LauncherApp` from `./features/launcher` (`index.ts:1`), `./index.css`, calls `renderWindowRoot` |
| TS entry (HUD) | `apps/desktop/src/main.tsx:1-5` | same shape, `App` |
| Root | `apps/desktop/src/render-root.tsx:8-16` | `#root` → `StrictMode` → `QueryClientProvider client={createQueryClient()}` (`src/lib/query-client.ts:7`) |
| Vite inputs | `apps/desktop/vite.config.ts:17-22` | `main: index.html`, `launcher: launcher.html` |

Both roots are independent React trees with independent query clients (a **new** `QueryClient` per
`renderWindowRoot` call, `render-root.tsx:13`). They never share state; the only shared runtime is the Rust
process.

#### 1.2 Launcher tree (window label `launcher`)

Depth is counted from the React root (`render-root.tsx:11` = depth 0).

```
0  createRoot(#root)                                   render-root.tsx:11
1  └ StrictMode > QueryClientProvider                  render-root.tsx:12-13
2    └ LauncherApp                                     LauncherApp.tsx:15
3      ├ "Загрузка…" div            (while loading)    LauncherApp.tsx:65-70
3      └ LauncherPanel                                 LauncherPanel.tsx:36   (11 props)
4        ├ div.launcher-rise.relative.z-30             LauncherPanel.tsx:137
5        │ └ LaunchBar                                 LaunchBar.tsx:77       (6 props)
6        │   ├ EqBars {animated, barClass}             LaunchBar.tsx:99  → components/EqBars.tsx:11
6        │   ├ h1 BRAND_NAME                           LaunchBar.tsx:100 → lib/brand.ts:1
6        │   ├ {search} slot                           LaunchBar.tsx:105
7        │   │ └ LauncherSearch                        (element built at LauncherPanel.tsx:143)
8        │   │   ├ Input (combobox)                    LauncherSearch.tsx:64  → ui/input
8        │   │   └ div[role=listbox] > button[role=option]×≤8  LauncherSearch.tsx:112-151
6        │   ├ StatusLine                              LaunchBar.tsx:109 (local, LaunchBar.tsx:23)
7        │   │ └ Button ghost/compact | span           LaunchBar.tsx:50 / 67
6        │   └ LaunchButton                            LaunchBar.tsx:116 → LaunchButton.tsx:10
7        │     └ Button (ui/button)                    LaunchButton.tsx:22
4        ├ save-error banner (conditional)             LauncherPanel.tsx:159-164
4        └ div.flex (body row)                         LauncherPanel.tsx:166
5          ├ div.launcher-rise                         LauncherPanel.tsx:167
6          │ └ Sidebar {active,notices,onSelect}       Sidebar.tsx:71
7          │   └ SidebarItem ×6 (5 on Windows)         Sidebar.tsx:20
5          └ div.launcher-rise > div key={screen}      LauncherPanel.tsx:176-180
6            ├ StartScreen                             LauncherPanel.tsx:182  (5 props)
7            │ └ ScreenShell screen="start"            StartScreen.tsx:173
8            │   ├ SettingGroup "Что нужно для запуска" StartScreen.tsx:174 → fields.tsx:9
9            │   │ └ StepView ×(1..2 or 3)             StartScreen.tsx:49
10           │   │   ├ AccessControl (step.id==="access") StartScreen.tsx:74
11           │   │   │ ├ AccessCodeForm                components/AccessCodeForm.tsx:11
11           │   │   │ └ Button "Ввести свои ключи"    StartScreen.tsx:84-95
10           │   │   └ PermissionControl               StartScreen.tsx:107
11           │   │     └ Button ×2-3 (Выдать/Настройки/Все доступы)
8            │   ├ AudioCheckCard {autoModeEnabled}    StartScreen.tsx:191 → AudioCheckCard.tsx:69
9            │   │ ├ SettingGroup + SettingRow ×1-2    AudioCheckCard.tsx:74-99
10           │   │ └ LevelMeter (inline style width)   AudioCheckCard.tsx:58
8            │   └ footer card + Button + LaunchButton StartScreen.tsx:193-207
6            ├ SettingsScreen                          LauncherPanel.tsx:193  (5 props)
7            │ └ ScreenShell screen="settings"         SettingsScreen.tsx:38
8            │   ├ SettingsTabsRail                    SettingsScreen.tsx:40 → SettingsTabsRail.tsx:50
9            │   │ └ SettingsTabButton ×7              SettingsTabsRail.tsx:9
8            │   └ div key={tab}                       SettingsScreen.tsx:41-47
9            │     ├ p (tab description)               SettingsScreen.tsx:45
9            │     └ sections[tab] — one of:           SettingsScreen.tsx:22-35
10           │       ├ ApiKeysSection {draft,set,onRedeem}      sections/ApiKeysSection.tsx:18
10           │       ├ SttSection + AutoModeSection {draft,set} sections/SttSection.tsx:66, AutoModeSection.tsx:54
10           │       ├ HotkeysSection {draft,set}               sections/HotkeysSection.tsx:63
10           │       ├ WindowSection {draft,set}                sections/WindowSection.tsx:39
10           │       ├ QuickActionsSection {draft,set}          sections/QuickActionsSection.tsx:86
10           │       ├ BehaviorSection {draft,set}              sections/BehaviorSection.tsx:22
10           │       └ AppearanceSection {draft,set}            sections/AppearanceSection.tsx:15
6            ├ PermissionsScreen {permissions}         LauncherPanel.tsx:201 → PermissionsScreen.tsx:88
7            │ └ ScreenShell + SettingGroup + PermissionRowView ×3  PermissionsScreen.tsx:90-105
6            ├ UpdatesScreen {updater,checkState,onCheck} LauncherPanel.tsx:203 → UpdatesScreen.tsx:61
7            │ └ ScreenShell + SettingGroup ×1-2 + Markdown + DownloadProgress  UpdatesScreen.tsx:74-125
6            ├ ScreenShell screen="contexts"           LauncherPanel.tsx:206
7            │ └ ContextLibraryPanel {api}             ContextLibraryPanel.tsx:412
8            │   ├ DocEditor (conditional)             ContextLibraryPanel.tsx:316
8            │   ├ EmptyDropZone (conditional)         ContextLibraryPanel.tsx:384
8            │   ├ DocRow ×N (root)                    ContextLibraryPanel.tsx:208
8            │   └ folder blocks: FolderHeader + DocRow ×M  ContextLibraryPanel.tsx:254, :577
6            └ ScreenShell screen="presets"            LauncherPanel.tsx:211
7              └ PresetsSection {presets,onChange}     sections/PresetsSection.tsx:90
8                ├ PresetRow ×N / PresetEditor         PresetsSection.tsx:20 / :50
8                └ SettingGroup "Встроенные" (read-only) PresetsSection.tsx:166
```

Props flowing into each launcher component:

| Component | Props | Source |
| --- | --- | --- |
| `LauncherApp` | none | `launcher.tsx:5` |
| `LauncherPanel` | `settings, contextLibrary, readiness, updater, launching, saving, error, onRedeem, onCheckUpdates, onSave, onLaunch` (11) | `contract.ts:20-32`; passed at `LauncherApp.tsx:72-85` |
| `LaunchBar` | `readiness, launching, saving, search: ReactNode, onGoToBlocker, onLaunch` | `LaunchBar.tsx:84-91` |
| `LaunchButton` | `readiness, launching, size?, onLaunch` | `LaunchButton.tsx:15-19` |
| `LauncherSearch` | `sources: SearchSources, onNavigate` | `LauncherSearch.tsx:20-23` |
| `Sidebar` | `active: ScreenId, notices: SidebarNotice[], onSelect` | `Sidebar.tsx:10-14` |
| `ScreenShell` | `screen: ScreenId, actions?: ReactNode, children` | `ScreenShell.tsx:5-11` |
| `StartScreen` | `readiness, launching, onRedeem, onNavigate, onLaunch` | `StartScreen.tsx:163-169` |
| `SettingsScreen` | `draft, set, tab, onRedeem, onTabChange` | `SettingsScreen.tsx:15-19` |
| `PermissionsScreen` | `permissions: PermissionsApi` | `PermissionsScreen.tsx:88` |
| `UpdatesScreen` | `updater: UpdaterApi, checkState, onCheck` | `UpdatesScreen.tsx:61-69` |
| `SettingsTabsRail` | `active: SettingsTabId, onSelect` | `SettingsTabsRail.tsx:4-7` |
| every `*Section` except two | `{draft, set}` = `SectionProps` | `contract.ts:15-18` |
| `ApiKeysSection` | `SectionProps & {onRedeem}` | `ApiKeysSection.tsx:9-11` |
| `PresetsSection` | `{presets, onChange: (u: PresetsUpdate)=>void}` — **not** `SectionProps` | `PresetsSection.tsx:90-96` |
| `AudioCheckCard` | `{autoModeEnabled: boolean}` | `AudioCheckCard.tsx:69` |
| `ContextLibraryPanel` | `{api: ContextLibraryApi}` | `ContextLibraryPanel.tsx:412` |
| `HotkeyCapture` | `{value, onChange}` | `HotkeyCapture.tsx:7-10` |
| `SettingGroup/Row/Block/Select/Switch/Slider` | see `fields.tsx:9,33,57,77,100,112` | — |

Note the ownership/rendering split: `LauncherSearch` is **created** in `LauncherPanel.tsx:143` and
**rendered** inside `LaunchBar.tsx:105` as an opaque `ReactNode` slot. Same pattern for
`ScreenShell actions` (`PermissionsScreen.tsx:92`).

#### 1.3 HUD tree (window label `main`)

```
0  createRoot(#root) > StrictMode > QueryClientProvider   render-root.tsx:11-13
1  └ App                                                  App.tsx:548
2    ├ div.app-shell (rounded-[var(--window-radius)])      App.tsx:776-779
3    │ ├ AppHeader (local wrapper)                         App.tsx:783 → App.tsx:414
4    │ │ └ StatusBar                                       components/StatusBar.tsx:66
5    │ │   ├ IconButton (Minus → hide_main_window)         StatusBar.tsx:83
5    │ │   ├ EqBars                                        StatusBar.tsx:90
5    │ │   ├ {tabs} → ChatTabs                             App.tsx:424 → ChatTabs.tsx:18
5    │ │   ├ ContextUsageGauge                             StatusBar.tsx:33
5    │ │   ├ {actions} → AutoModeIndicator, ScreenShareIndicator, IconButton×2, HotkeysPopover  App.tsx:440-458
5    │ │   ├ UpdateBadge                                   StatusBar.tsx:110
5    │ │   └ IconButton (Square → stop_main_window)        StatusBar.tsx:102
3    │ ├ AnswerPanel                                       App.tsx:808 → AnswerPanel.tsx:391
4    │ │ └ ChatMessages > MessageShell > UserBubble/Assistant/StreamingAssistant/MessageActions/HtmlBlockChip/ThinkingIndicator/JumpToBottomButton/EmptyState  AnswerPanel.tsx:331,183,307,213,221,148,96,278,316
3    │ ├ AutoTranscript (conditional)                      App.tsx:824 → AutoTranscript.tsx:29
3    │ └ AppComposer (local wrapper)                       App.tsx:835 → App.tsx:501
4    │   └ Composer                                        Composer.tsx:531
5    │     ├ QuickActionsBar                               QuickActionsBar.tsx:45
5    │     ├ AttachmentList > AttachmentChip                Composer.tsx:147, AttachmentChip.tsx
5    │     ├ PromptTextarea                                Composer.tsx:114
5    │     └ ComposerToolbar > RequestParamsPopover > ModelSelect/PresetSelect/ParamRow/ParamToggle, LibraryPicker > LibraryDocToggle, ChatContextDialog   Composer.tsx:324,251,189,212,237,171,442,416,484
2    ├ PreviewPanel (conditional)                          App.tsx:855 → PreviewPanel.tsx:76
2    ├ Teleprompter (conditional)                          App.tsx:857 → Teleprompter.tsx:28
2    ├ ConnectivityOverlay (conditional)                   App.tsx:883
2    └ UpdateDialog (conditional)                          App.tsx:885 → UpdateDialog.tsx:52
```

#### 1.4 Who renders where

| Bucket | Files | Evidence |
| --- | --- | --- |
| **Launcher only** | all 34 non-test files under `src/features/launcher/**` | only importer is `src/launcher.tsx:1` |
| **HUD only** | `App.tsx`, `AnswerPanel`, `Composer`, `AttachmentChip`, `HtmlBlockChip`, `ChatTabs`, `QuickActionsBar`, `StatusBar`, `Teleprompter`, `PreviewPanel`, `AutoTranscript`, `AutoModeIndicator`, `ScreenShareIndicator`, `ThinkingIndicator`, `HotkeysPopover`, `UpdateDialog`, `ConnectivityOverlay` | no importer in `features/launcher` |
| **Shared components** | `AccessCodeForm` (`StartScreen.tsx:101`, `ApiKeysSection.tsx:46`), `EqBars` (`LaunchBar.tsx:99`, `StatusBar.tsx:90`), `IconButton` (`HotkeysSection.tsx:33`, `QuickActionsSection.tsx:68`, `PresetsSection.tsx:39`, `ContextLibraryPanel.tsx:197`, and 6 HUD files), `SectionLabel` (`fields.tsx:21`, `ContextLibraryPanel.tsx:331`, `Composer`, `HotkeysPopover`, `PreviewPanel`, `AutoTranscript`) | grep of `@/components` imports |
| **Shared shadcn primitives actually used** | `button` (20 files), `input` (6), `select` (8), `textarea` (4), `switch` (2), `label` (2), `dialog` (2, HUD only), `popover` (2, HUD only) | — |
| **shadcn primitives with zero importers** | `badge.tsx`, `scroll-area.tsx`, `tooltip.tsx` | shielded from knip by `knip.json:12` |
| **Shared hooks** | `useSettingsStore` (`LauncherApp.tsx:16`, `useSettings.ts:117`), `useContextLibrary` (`LauncherApp.tsx:18`, `App.tsx:594`), `useUpdater` (`LauncherApp.tsx:17`, `App.tsx:560`), `useOfficialPresets` (`LauncherPanel.tsx:54`, `PresetsSection.tsx:97`, `App.tsx:588`), `useWindowDrag` (`LaunchBar.tsx:92`, `StatusBar.tsx:79`) | — |
| **Launcher-only hooks** | `usePermissions` (only consumer `useLauncherReadiness.ts:44`), `useAudioCheck` (only `AudioCheckCard.tsx:70`), `useLauncherReadiness`, `useHotkeyEditor` | — |
| **HUD-only hooks** | `useSettings`, `useChats`, `useClaudeStream`, `useModels`, `useRecorder`, `useTranscription`, `useAutoMode`, `useConnectivity`, `useRegionScreenshot`, `useWindowControls`, `usePttSuspend`, `usePromptFocus`, `useQuickActionKeys`, `useDuplicateChatKey`, `useLatestRef` | — |
| **Shared lib** | all of `src/lib/**` is framework-free and importable by both; launcher-touched: `api-keys`, `brand`, `platform`, `presets`, `quick-actions`, `hotkeys`, `hotkey-capture`, `hotkey-conflicts`, `context-library`, `window-controls`, `base64`, `access-code`, `utils`, `query-client` | — |
| **Shared IPC** | `src/ipc/{bindings,commands,events,types}.ts` | `CLAUDE.md:145` — the only place importing `@tauri-apps/api` |
| **Shared CSS** | `src/index.css` — one stylesheet, launcher deltas scoped to `body.launcher` (`index.css:112`) | — |

---

### 2. Routing / screen model

There is no router. The launcher's "route" is two pieces of component state:

```ts
const [screen, setScreen]           = useState<ScreenId>(DEFAULT_SCREEN);      // LauncherPanel.tsx:51
const [settingsTab, setSettingsTab] = useState<SettingsTabId>(DEFAULT_SETTINGS_TAB); // :52
```

`DEFAULT_SCREEN = "start"` (`screens.ts:75`), `DEFAULT_SETTINGS_TAB = "access"` (`settings-tabs.ts:67`).
Both live in `LauncherPanel`, i.e. **inside** the component that also owns `draft` — a full remount of
`LauncherPanel` resets navigation *and* the unsaved draft together.

**The screen registry** (`screens.ts:27-71`), 6 entries, each `{id,label,description,icon,group,platforms?}`:

| id | label | group | platforms | icon |
| --- | --- | --- | --- | --- |
| `start` | Старт | `start` | all | `Rocket` |
| `contexts` | Контексты | `content` | all | `Library` |
| `presets` | Пресеты | `content` | all | `MessageSquareText` |
| `settings` | Настройки | `system` | all | `SlidersHorizontal` |
| `permissions` | Доступы | `system` | **`["macos"]`** (`screens.ts:62`) | `ShieldCheck` |
| `updates` | Обновления | `system` | all | `Download` |

`SCREEN_GROUPS = ["start","content","system"]` (`screens.ts:12`); the sidebar renders one flex column per
group and pins `system` with `mt-auto` (`Sidebar.tsx:79`).

**The platform filter** is three functions on the same predicate:

- `availableOn(screen, platform)` → `screen.platforms?.includes(platform) ?? true` (`screens.ts:77-79`)
- `screenGroup(group, platform = PLATFORM)` (`screens.ts:81-83`) — used by `Sidebar.tsx:80` and
  `search.ts:154`
- `screenVisible(id, platform = PLATFORM)` (`screens.ts:89-91`) — used by `start-steps.ts:50` (suppresses
  permission steps on Windows) and `search.ts:193` (suppresses permission hits on Windows)

`PLATFORM` is derived once from the user agent (`src/lib/platform.ts:12`), never from Rust.

**The settings-tab registry** (`settings-tabs.ts:19-63`), 7 entries `{id,label,description,icon}`:
`access` (Ключи) · `speech` (Речь) · `hotkeys` (Клавиши) · `quick-actions` (Действия) · `window` (Окно) ·
`behavior` (Поведение) · `appearance` (Вид). Order is by task frequency, not alphabet (`CLAUDE.md:404`).
`SettingsScreen` maps them through `Record<SettingsTabId, ReactNode>` (`SettingsScreen.tsx:22`) so the
compiler forces a section per tab.

**The single navigation primitive:**

```ts
const goTo = ({ screen: target, tab }: LauncherDestination) => {  // LauncherPanel.tsx:88-91
  setScreen(target);
  if (tab !== undefined) setSettingsTab(tab);
};
```

`LauncherDestination = {screen: ScreenId; tab?: SettingsTabId}` (`contract.ts:10-13`).

Four things trigger navigation, all funnelling into `goTo`:

| Trigger | Call site | Destination source |
| --- | --- | --- |
| Sidebar item click | `LauncherPanel.tsx:171-173` ← `Sidebar.tsx:41-43` | `screen.id`, no tab |
| Search result click / Enter | `LauncherPanel.tsx:145-147` ← `LauncherSearch.tsx:45-48,108,143` | `hit.screen`, `hit.tab ?? undefined` (`search.ts:9-16`) |
| Header status click (blocker) | `LauncherPanel.tsx:150-152` ← `LaunchBar.tsx:54-56` | `blocker.screen`, `blocker.tab` |
| In-screen links on "Старт" | `LauncherPanel.tsx:186` (`onNavigate={goTo}`) ← `StartScreen.tsx:89,147,200` | step's `screen`/`tab`, or `{screen:"settings"}` |

There is deliberately **no keyboard shortcut** for the search field (`CLAUDE.md:410` — hardcoded combos are
forbidden and the launcher registers no hotkeys). The launcher window has zero global shortcuts
(`CLAUDE.md:11`; `src-tauri/src/window.rs` registers them only in `swap_to_main_window`).

**Blocker routes** come from `useLauncherReadiness` (`useLauncherReadiness.ts:49-58`):
`{label: missingKeysNotice(...), screen:"settings", tab:"access"}`, `AUDIO_BLOCKER` (`:16-19`, screen
`permissions`, no tab) and `MICROPHONE_BLOCKER` (`:24-27`). The same array feeds the sidebar dots
(`LauncherPanel.tsx:70-74`) and the header status (`LaunchBar.tsx:18,34`).

**What remounts on navigation:**

- `<div key={screen}>` at `LauncherPanel.tsx:178` — the whole screen subtree is destroyed and rebuilt so
  the `animate-in fade-in-0 slide-in-from-bottom-1 duration-150 motion-reduce:animate-none` entry runs
  (`LauncherPanel.tsx:179`). Consequence: **all local state inside a screen dies on every screen switch** —
  `PresetsSection.editingId` (`PresetsSection.tsx:98`), `ContextLibraryPanel.docDraft/importError`
  (`:414-416`), `LauncherSearch` is outside this wrapper and survives.
- `<div key={tab}>` at `SettingsScreen.tsx:42` — same for tabs. Consequence: `useHotkeyEditor.stolen`
  (`useHotkeyEditor.ts:24`) is destroyed on every tab switch, so a cross-tab theft note is shown once and
  can never be re-read.
- `LauncherPanel` itself never remounts; `draft`, `screen`, `settingsTab`, `checkState` persist for the
  life of the window.

**The launcher always lands on "Старт"** — the old `landed` ref that jumped to the first blocker was
removed (`CLAUDE.md:414`; the code has no such ref, `LauncherPanel.tsx:51`). `CLAUDE.md:386` still describes
the removed behaviour and is stale.

**ScreenShell asymmetry.** `contexts` and `presets` receive their shell from the panel
(`LauncherPanel.tsx:206,211`), the other four render their own (`StartScreen.tsx:173`,
`SettingsScreen.tsx:38`, `PermissionsScreen.tsx:90`, `UpdatesScreen.tsx:74`). `ScreenShell` is the only
place allowed to print a screen heading/description (`ScreenShell.tsx:17-25`, `CLAUDE.md:412`), and its
description is single-line `truncate` + `title` — a long `description` in `screens.ts` is cut, never wrapped.

---

### 3. State stores

#### 3.1 Inventory

| Store / hook | Holds | Owner / where instantiated | Readers | Persistence | Path on disk |
| --- | --- | --- | --- | --- | --- |
| `useSettingsStore(applyVisuals)` | `settings: Settings`, `loading`, `save`, `reload`, raw `setSettings` | `useSettingsStore.ts:22`; launcher at `LauncherApp.tsx:16`, HUD via `useSettings.ts:117` | `LauncherApp` (readiness + `access_token` merge); the HUD layer | `save()` → `set_settings` and **adopts the clamped return** (`:58`); `getSettings` on mount (`:43`) | `settings.json` in `app_data_dir` (`src-tauri/src/app_state.rs:12,48`) |
| `useSettings()` (HUD-only layer) | nothing of its own; adds `bumpOpacity`, `bumpWindowSize`, `applyNativeWindowSize` | `useSettings.ts:116`; `App.tsx:549-556` | `App.tsx` | three independent 400 ms debounces calling `ipcSet` directly (`useSettings.ts:43-45, 74-77, 105-108`), bypassing `save`/`adopt` | same file |
| `LauncherPanel.draft: Settings` | the **entire** editable settings object being edited | `LauncherPanel.tsx:49` | every settings section via `SectionProps` (`contract.ts:15`), `PresetsSection` via `draft.prompt_presets` (`LauncherPanel.tsx:212`), search sources (`:58-62`) | 600 ms debounce → `normalizeDraft` → `onSave` → `useSettingsStore.save` (`LauncherPanel.tsx:104-114`) | same file |
| `useChats()` | `Chat[]` + `activeId` + per-chat draft/attachments/messages | `useChats.ts:240`; `App.tsx:558` | HUD only | 500 ms debounce → `save_chats(serializeChats)` (`useChats.ts:105-117`); images via `save_chat_image`/`load_chat_images`/`prune_chat_images` (`:97,160,167`); active id in `localStorage["active-chat-id"]` (`:137,148`) | `chats.json` + `images/` (`app_state.rs:13,60`) |
| `useContextLibrary()` | `{folders, docs}` (`lib/context-library.ts:13-16`) | `useContextLibrary.ts:31`; **both** windows (`LauncherApp.tsx:18`, `App.tsx:594`) | launcher: `ContextLibraryPanel`, search sources; HUD: system-prompt assembly | 500 ms debounce → `save_context_library(serializeLibrary)` (`:49-58`), load on mount (`:36-47`) | `context-library.json` (`app_state.rs:14,56`) |
| `useLauncherReadiness(settings)` | derived: `missingKeys`, `permissions`, `autoModeEnabled`, `blockers`, `checking`, `ready` | `useLauncherReadiness.ts:42`; `LauncherApp.tsx:19` | `LaunchBar`, `LaunchButton`, `StartScreen`, `PermissionsScreen`, sidebar notices | none — pure derivation over the **persisted** `settings`, not the draft | — |
| `usePermissions()` | `PermissionsStatus`, `loaded`, `pending`, derived `audioOk/screenOk/microphoneOk/allOk/needsAttention` | `usePermissions.ts:25`; only inside `useLauncherReadiness.ts:44` | `PermissionsScreen`, `StartScreen`, readiness | none (OS is the store); `permissions_status` on mount (`:35-37`) | — |
| `useUpdater()` | `status`, `info`, `progress`, `error`, `currentVersion` | `useUpdater.ts:36`; **both** windows | launcher `UpdatesScreen` + sidebar dot; HUD `StatusBar` badge + `UpdateDialog` | none locally; `skipped_version` is written **only from the HUD** (`App.tsx:765-770`) | `settings.json` |
| `useAudioCheck()` | `running`, `level`, `source`, `result`, `error` | `useAudioCheck.ts:32`; only `AudioCheckCard.tsx:70` | `AudioCheckCard` | none — ephemeral | — |
| `useHotkeyEditor(draft, set)` | `stolen: {combo, from, to} \| null` | `useHotkeyEditor.ts:20`; **three separate instances**: `HotkeysSection.tsx:64`, `QuickActionsSection.tsx:87`, `WindowSection.tsx:40` | the section it lives in | writes through `set("hotkeys", …)` into `draft` | via draft |
| `useOfficialPresets()` | react-query cache `["official-presets"]` | `useOfficialPresets.ts:8`; three call sites | `LauncherPanel` search sources, `PresetsSection`, `App` | react-query cache only; `official-presets-updated` event patches it (`:16-22`) | Rust cache `presets.cache.json` (`src-tauri/src/remote_presets.rs:11`) |
| `LauncherPanel.checkState` | `"idle" \| "checking" \| "latest" \| {failure}` | `LauncherPanel.tsx:50` | only `UpdatesScreen` | none | — |
| react-query client | `models`, `official-presets`, `audio-devices`, `audio-input-devices`, `count-tokens` | `render-root.tsx:13`, keys at `query-client.ts:21-28` | launcher uses `audio-devices` (`SttSection.tsx:31`), `audio-input-devices` (`AutoModeSection.tsx:21`), `official-presets` | in-memory, `staleTime` 5 min default (`query-client.ts:4`) | — |
| `localStorage` | `active-chat-id` (`useChats.ts:137`), `redeem-idem:<sha256[0:16]>` (`ipc/commands.ts:7,86,92`) | — | HUD / redeem flow | browser storage | — |

`useSettingsStore` vs `useSettings` — **why two layers**: `useSettingsStore` owns load/save/adopt plus a
`applyVisuals` callback, and exposes `reload` (`useSettingsStore.ts:68-70`) which only the launcher needs
(after a code redeem, `LauncherApp.tsx:27`). `useSettings` wraps it for the HUD and adds three
debounced, *self-persisting* mutators for values the HUD changes by hotkey or by mouse-resize
(`useSettings.ts:27-114`); it deliberately does **not** re-expose `reload` (`CLAUDE.md:147`). The launcher
uses the store directly.

Visual application differs per window and is the *only* behavioural difference between the two callbacks:

```ts
// launcher — theme only
function applyLauncherTheme(s: Settings) { applyTheme(document.documentElement, s.theme); }  // LauncherApp.tsx:11-13
// HUD — theme + opacity + chat font
function applyVisualSettings(s: Settings) {                                                  // useSettings.ts:21-25
  applyOpacity(...); applyChatFontSize(...); applyTheme(...);
}
```

#### 3.2 The autosave-the-draft model (no Save button)

The mechanism, exactly as implemented (`LauncherPanel.tsx:99-114`):

```ts
const onSaveRef = useRef(onSave);
useEffect(() => { onSaveRef.current = onSave; }, [onSave]);      // :99-102

const lastQueuedDraft = useRef(draft);
useEffect(() => {
  if (launching || draft === lastQueuedDraft.current) return;    // identity compare, not deep
  lastQueuedDraft.current = draft;
  const timer = setTimeout(() => { onSaveRef.current(normalizeDraft(draft)); }, 600);
  return () => { clearTimeout(timer); };
}, [draft, launching]);                                          // :104-114
```

- `AUTOSAVE_DEBOUNCE_MS = 600` (`LauncherPanel.tsx:22`). The debounce is functional, not cosmetic: each
  save rebuilds the Anthropic/Groq clients in Rust (`CLAUDE.md:322`).
- `onSave` is reached **through a ref**, never through the dependency array — otherwise `save → adopt →
  parent re-render → new callback identity → effect restart → save` loops (`CLAUDE.md:324`).
- The effect compares `draft` **by identity** against `lastQueuedDraft`, which is how the first render and
  the StrictMode double-mount are skipped.
- `normalizeDraft` (`LauncherPanel.tsx:28-34`) only filters: `prompt_presets.filter(isPresetFilled)`
  (`lib/presets.ts:11`) and `quick_actions.filter(isQuickActionFilled)` (`lib/quick-actions.ts:8`). It does
  **not** substitute hotkey defaults — an empty combo means "unassigned" and must stay empty
  (`CLAUDE.md:435`). `CLAUDE.md:327` still claims the opposite and is stale.
- The normalised copy is what is saved; the on-screen `draft` is untouched, so a half-typed preset or quick
  action does not vanish under the cursor.
- While `launching` the effect early-returns and the cleanup cancels the pending timer; `handleLaunch`
  persists `normalizeDraft(draft)` itself before `launchMainWindow` (`LauncherPanel.tsx:154`,
  `LauncherApp.tsx:49-63`).
- The **only** field synced back from the persisted `settings` into `draft` is `access_token`, and only
  when it actually changed (`LauncherPanel.tsx:93-97`) so an idle merge cannot create a new draft identity
  and a redundant autosave.
- Saving is made visible by a `saving` flag around `persist` (`LauncherApp.tsx:33-43`) which the header
  prints as "Сохраняю…" **instead of** the blocker (`LaunchBar.tsx:17`). A save failure becomes a banner
  under the header (`LauncherPanel.tsx:159-164`), never a line in the header — there it shared a row with
  the status and was truncated (`CLAUDE.md:322`).
- On save failure `useSettingsStore.save` re-applies the last adopted visuals (`useSettingsStore.ts:61`)
  and returns the error string; the draft is **not** rolled back and no retry is scheduled.
- Rust invariant the model leans on: `reregister_changed_hotkeys` bails out while there is no main window,
  so autosaving hotkeys from the launcher never touches global registration (`CLAUDE.md:331`).

**Gap:** `save` adopts the clamped `Settings` returned by `set_settings` into the *store*
(`useSettingsStore.ts:58`), but nothing feeds it back into `draft`. `Settings::clamp` in Rust normalises
hotkeys (conflict theft) and trims `quick_actions` past `QUICK_ACTION_LIMIT`; the launcher UI keeps showing
the pre-clamp values until the window is recreated.

---

### 4. The complete IPC surface the UI uses

#### (a) Commands invoked from the frontend

`src/ipc/commands.ts:9-44` re-exports 34 generated commands verbatim; five get hand-written wrappers
(`:50,60,69,73,77,89`) and `startWindowDrag` (`:46`) is not a command at all but a Tauri window JS API.
Argument/return shapes are from `src/ipc/bindings.ts` (generated; lines cited).

| # | Rust command | TS name | Call site(s) | Args | Returns | Used by |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `send_to_claude` | `sendToClaude` | `hooks/useClaudeStream.ts:185` (wrapper `ipc/commands.ts:50`) | `(messages: ChatMessageDto[], chatId, system, model, options: RequestOptions)` | `void` | HUD |
| 2 | `cancel_stream` | `cancelStream` | `hooks/useClaudeStream.ts:52` | `(chatId: string)` | `void` | HUD |
| 3 | `count_chat_tokens` | `countChatTokens` | `App.tsx:294` (wrapper `commands.ts:60`) | `(messages, system, model, options)` | `number` | HUD |
| 4 | `probe_connectivity` | `probeConnectivity` | `hooks/useConnectivity.ts:16` | `()` | `boolean` | HUD |
| 5 | `list_models` | `listModels` | `hooks/useModels.ts:9` | `()` | `ModelInfo[]` (`bindings.ts:156`) | HUD |
| 6 | `load_chats` | `loadChats` | `hooks/useChats.ts:158` | `()` | `string` (JSON) | HUD |
| 7 | `save_chats` | `saveChats` | `hooks/useChats.ts:190` | `(json: string)` | `null` | HUD |
| 8 | `load_context_library` | `loadContextLibrary` | `hooks/useContextLibrary.ts:38` | `()` | `string` (JSON) | **both** |
| 9 | `save_context_library` | `saveContextLibrary` | `hooks/useContextLibrary.ts:53` | `(json: string)` | `null` | **both** |
| 10 | `save_chat_image` | `saveChatImage` | `hooks/useChats.ts:97` | `(mediaType, dataBase64)` | `string` (id) | HUD |
| 11 | `load_chat_images` | `loadChatImages` | `hooks/useChats.ts:160` | `(ids: string[])` | `StoredImage[]` (`bindings.ts:252`) | HUD |
| 12 | `prune_chat_images` | `pruneChatImages` | `hooks/useChats.ts:167` | `(keep: string[])` | `void` | HUD |
| 13 | `read_context_import_file` | `readContextImportFile` | `features/launcher/ContextLibraryPanel.tsx:97` | `(path: string)` | `string` | **launcher** |
| 14 | `read_context_pdf_bytes` | `readContextPdfBytes` | `features/launcher/ContextLibraryPanel.tsx:155` | `(dataBase64: string)` | `string` | **launcher** |
| 15 | `retry_transcription` | `retryTranscription` | `App.tsx:186` | `()` | `void` | HUD |
| 16 | `start_auto_mode` | `startAutoMode` | `hooks/useAutoMode.ts:129` | `()` | `null` | HUD |
| 17 | `stop_auto_mode` | `stopAutoMode` | `hooks/useAutoMode.ts:125` | `()` | `void` | HUD |
| 18 | `auto_mode_active` | `autoModeActive` | `hooks/useAutoMode.ts:104` | `()` | `boolean` | HUD |
| 19 | `list_audio_input_devices` | `listAudioInputDevices` | `features/launcher/sections/AutoModeSection.tsx:21` | `()` | `AudioDeviceInfo[]` (`bindings.ts:82`) | **launcher** |
| 20 | `check_audio_source` | `checkAudioSource` | `hooks/useAudioCheck.ts:56` | `(source: "system" \| "microphone")` | `AudioCheck {heard, peak, text}` (`bindings.ts:76`) | **launcher** |
| 21 | `list_audio_output_devices` | `listAudioOutputDevices` | `features/launcher/sections/SttSection.tsx:31` | `()` | `AudioDeviceInfo[]` | **launcher** |
| 22 | `get_settings` | `getSettings` | `hooks/useSettingsStore.ts:43` (mount), `:69` (`reload`) | `()` | `Settings` (cast, `commands.ts:69`) | **both** |
| 23 | `set_settings` | `setSettings` | `hooks/useSettingsStore.ts:58`; `hooks/useSettings.ts:44, 76, 107` | `(newSettings: Settings)` | `Settings` (clamped) | **both** |
| 24 | `get_official_presets` | `getOfficialPresets` | `hooks/useOfficialPresets.ts:12` | `()` | `PromptPreset[]` | **both** |
| 25 | `set_ptt_suspended` | `setPttSuspended` | `hooks/usePttSuspend.ts:20, 23, 25, 31` | `(suspended: boolean)` | `void` | HUD |
| 26 | `redeem_access_code` | `redeemAccessCode` | `features/launcher/LauncherApp.tsx:26` (wrapper `commands.ts:89`) | `(code, idempotencyKey)` | `null`; wrapper returns `string \| null` failure | **launcher** |
| 27 | `set_window_size` | `setWindowSize` | `App.tsx:243` | `(width: number\|null, height: number\|null)` | `void` | HUD |
| 28 | `close_app` | `closeApp` | **NONE** — not even re-exported (`commands.ts:9-44`) | `()` | `void` | **nobody** |
| 29 | `hide_main_window` | `hideMainWindow` | `App.tsx:441` | `()` | `void` | HUD |
| 30 | `launch_main_window` | `launchMainWindow` | `features/launcher/LauncherApp.tsx:55` | `()` | `null` | **launcher** |
| 31 | `stop_main_window` | `stopMainWindow` | `App.tsx:802` | `()` | `null` | HUD |
| 32 | `capture_region_screenshot` | `captureRegionScreenshot` | `hooks/useRegionScreenshot.ts:38` | `()` | `void` | HUD |
| 33 | `permissions_status` | `permissionsStatus` | `hooks/usePermissions.ts:31` | `()` | `PermissionsStatus` (`bindings.ts:169`) | **launcher** |
| 34 | `request_permission` | `requestPermission` | `hooks/usePermissions.ts:42` | `(kind: "audio"\|"screen"\|"microphone")` | `PermissionState` | **launcher** |
| 35 | `open_permission_settings` | `openPermissionSettings` | `hooks/usePermissions.ts:50` | `(kind)` | `void` | **launcher** |
| 36 | `copy_image_to_clipboard` | `copyImageToClipboard` | `App.tsx:751` | `(dataBase64: string)` | `null` | HUD |
| 37 | `open_external` | `openExternal` | `features/launcher/sections/ApiKeysSection.tsx:67`; `components/AnswerPanel.tsx:81` | `(url: string)` | `void` | **both** |
| 38 | `set_preview_html` | `setPreviewHtml` | `components/PreviewPanel.tsx:31` | `(html: string)` | `void` | HUD |
| 39 | `check_for_update` | `checkForUpdate` | `hooks/useUpdater.ts:72` (wrapper `commands.ts:77`) | `()` | `UpdateInfo \| null` | **both** |
| 40 | `install_update` | `installUpdate` | `hooks/useUpdater.ts:65` | `()` | `null` | **both** |
| 41 | `get_app_version` | `getAppVersion` | `hooks/useUpdater.ts:26` | `()` | `string` | **both** |
| — | *(not a command)* `getCurrentWindow().startDragging()` | `startWindowDrag` (`commands.ts:46`) | `hooks/useWindowDrag.ts:11` (→ `LaunchBar.tsx:92`, `StatusBar.tsx:79`), `App.tsx:773` | `()` | `void` | **both** |

**Unused command in `collect_commands!`:** `window::close_app` (`src-tauri/src/bindings.rs:46`,
`bindings.ts:34`) — no TS call site anywhere; `CLAUDE.md:363` records this as deliberate ("the `close_app`
command remains in the contract, but the frontend never calls it"). Every other one of the 41 is called.

Launcher-exclusive commands (12): 13, 14, 19, 20, 21, 26, 30, 33, 34, 35, plus its share of 8/9 and 22–24,
39–41. HUD-exclusive (22). Shared (7).

#### (b) Events listened to

Payload types are the hand-written `EventMap` (`src/ipc/types.ts:98-120`); the generated mirrors live in
`bindings.ts:87-209`. All subscriptions go through `onEvent` (`src/ipc/events.ts:72`), which uses a `live`
flag so StrictMode's double-mount cannot leak a listener (`events.ts:76-87`).

| Event | Payload | Type line | Listener | Window |
| --- | --- | --- | --- | --- |
| `state-changed` | `RecorderState` | `types.ts:99` | `hooks/useRecorder.ts:7` | HUD |
| `transcript-ready` | `string` | `types.ts:100` | `hooks/useTranscription.ts:5` | HUD |
| `stt-error` | `AppError` | `types.ts:101` | `App.tsx:161` | HUD |
| `llm-delta` | `{chatId, delta}` | `types.ts:102` | `hooks/useClaudeStream.ts:120` | HUD |
| `llm-done` | `{chatId}` | `types.ts:103` | `hooks/useClaudeStream.ts:125` | HUD |
| `llm-error` | `AppError & {chatId}` | `types.ts:104` | `hooks/useClaudeStream.ts:130` | HUD |
| `llm-usage` | `{chatId, inputTokens}` | `types.ts:105` | `App.tsx:700` | HUD |
| `update-available` | `UpdateInfo` | `types.ts:106` | `hooks/useUpdater.ts:45` | **both** |
| `update-progress` | `UpdateProgress` | `types.ts:107` | `hooks/useUpdater.ts:49` | **both** |
| `update-done` | `{version}` | `types.ts:108` | `hooks/useUpdater.ts:50` | **both** |
| `toggle-teleprompter` | `null` | `types.ts:109` | `App.tsx:692` | HUD |
| `resize-key` | `{dim:"width"\|"height", dir:1\|-1}` | `types.ts:110` | `hooks/useWindowControls.ts:33` | HUD |
| `official-presets-updated` | `PromptPreset[]` | `types.ts:111` | `hooks/useOfficialPresets.ts:18` | **both** |
| `screenshot-ready` | `{mediaType, dataBase64}` | `types.ts:112` | `hooks/useRegionScreenshot.ts:24` | HUD |
| `screenshot-error` | `AppError` | `types.ts:113` | `hooks/useRegionScreenshot.ts:31` | HUD |
| `focus-prompt` | `null` | `types.ts:114` | `hooks/usePromptFocus.ts:22` | HUD |
| `auto-turn` | `AutoTurn` | `types.ts:115` | `hooks/useAutoMode.ts:75` | HUD |
| `auto-mode-changed` | `{active}` | `types.ts:116` | `hooks/useAutoMode.ts:89` | HUD |
| `auto-mode-error` | `AppError` | `types.ts:117` | `hooks/useAutoMode.ts:100` | HUD |
| `auto-answer` | `null` | `types.ts:118` | `hooks/useAutoMode.ts:85` | HUD |
| `audio-level` | `{level: number}` | `types.ts:119` | `hooks/useAudioCheck.ts:38` | **launcher** |

Two non-`onEvent` subscriptions:

| Subscription | Helper | Listener | Window |
| --- | --- | --- | --- |
| webview drag & drop (`over`/`drop`/`leave`, coords divided by `devicePixelRatio`) | `onFileDrop` (`ipc/events.ts:20-49`) | `features/launcher/ContextLibraryPanel.tsx:83` | **launcher** |
| native window resize (logical size via `scaleFactor()`) | `onWindowResized` (`ipc/events.ts:51-70`) | `App.tsx:259` | HUD |

**The launcher listens to exactly four events**: `audio-level`, `update-available`, `update-progress`,
`update-done` (+ `official-presets-updated`), and one webview drag-drop stream. Everything else it knows
comes from command round-trips.

---

### 5. Theming consumption

#### 5.1 The token pipeline

One file: `src/index.css` (374 lines). There is no `tailwind.config.*`.

1. `@custom-variant dark (&)` (`index.css:4`) makes shadcn's stock `dark:` **unconditional**. The theme is
   dark-only and not a single `dark:` remains in markup; a `dark:` dragged in from a shadcn snippet
   silently overrides the class next to it (`CLAUDE.md:174`).
2. `:root` (`index.css:6-38`) defines 24 raw values: `--app-opacity`, `--chat-font-size`, `--radius`,
   `--background/-foreground`, `--card(-foreground)`, `--popover(-foreground)`, `--muted(-foreground)`,
   `--primary(-foreground)`, `--secondary(-foreground)`, `--accent(-foreground)`,
   `--destructive(-foreground)`, `--border`, `--input`, `--ring`, `--surface`, `--surface-active`,
   `--code-surface`, `--recording`.
3. `:root[data-theme="black"]` (`index.css:40-50`) overrides 9 of them.
4. `@theme inline` (`index.css:52-98`) maps each raw var to a Tailwind namespace. Because it is `inline`,
   the utility compiles to `var(--background)` at the use site — which is what makes the `body.launcher`
   override work at all.

| Utility family | CSS variable | `index.css` line |
| --- | --- | --- |
| `bg-background`, `text-background`… | `--background` | 53 |
| `text-foreground`, `bg-foreground` | `--foreground` | 54 |
| `bg-card`, `text-card-foreground` | `--card`, `--card-foreground` | 55-56 |
| `bg-popover`, `text-popover-foreground` | `--popover`, `--popover-foreground` | 57-58 |
| `bg-muted`, `text-muted-foreground` | `--muted`, `--muted-foreground` | 59-60 |
| `bg-primary`, `text-primary`, `ring-primary` | `--primary` | 61 |
| `text-primary-foreground` | `--primary-foreground` | 62 |
| `bg-secondary`, `text-secondary-foreground` | `--secondary`, `--secondary-foreground` | 63-64 |
| `bg-accent`, `text-accent-foreground` | `--accent`, `--accent-foreground` | 65-66 |
| `bg-destructive`, `text-destructive`, `ring-destructive` | `--destructive` | 67 |
| `text-destructive-foreground` | `--destructive-foreground` | 68 |
| `border-border`, `divide-border`, `ring-border` | `--border` | 69 |
| `border-input`, `bg-input/20` | `--input` | 70 |
| `ring-ring`, `border-ring`, `bg-ring` | `--ring` | 71 |
| `bg-surface`, `hover:bg-surface` | `--surface` | 72 |
| `bg-surface-active` | `--surface-active` | 73 |
| `bg-code-surface` | `--code-surface` | 74 |
| `bg-recording` | `--recording` | 75 |
| `rounded-sm/md/lg/xl` | `--radius` ± 4/2/0/+4 | 76-79 |
| `font-sans` / `font-mono` | `--font-sans` / `--font-mono` | 80-83 |
| `text-hint/caption/body/title/chat` | 10.5 / 11.5 / 12.5 / 15 / `var(--chat-font-size)` | 84-88 |
| `rounded-[var(--window-radius)]` | `--window-radius` (22px; **0px in the launcher**) | 89, 115 |
| `shadow-btn/raise/pop/modal` | four composite shadows | 90-97 |

`cn` is a `tailwind-merge` extended with a custom `font-size` group so the five steps merge correctly
(`src/lib/utils.ts:4-10`).

#### 5.2 Where the theme is applied from

| Function | Effect | Called from | Window |
| --- | --- | --- | --- |
| `applyTheme(root, theme)` (`lib/window-controls.ts:42-44`) | sets `data-theme="gray"\|"black"` on `documentElement`; unknown → gray | `LauncherApp.tsx:12` (via `useSettingsStore`'s `adopt`, `useSettingsStore.ts:36-39`); `AppearanceSection.tsx:24` (immediate, on select change); `useSettings.ts:24` | both |
| `applyOpacity(root, v)` (`window-controls.ts:22-26`) | sets `--app-opacity`, clamped 0.2–1 | **only** `useSettings.ts:22` and `:40` | **HUD only** |
| `applyChatFontSize(root, px)` (`window-controls.ts:32-36`) | sets `--chat-font-size`, clamped 10–20 | **only** `useSettings.ts:23` | **HUD only** |

Consequence: the launcher's "Прозрачность окна" and "Размер шрифта чата" sliders
(`AppearanceSection.tsx:31-56`) change nothing in the launcher window. Only "Тема" previews live.

Before `get_settings` returns, no `data-theme` attribute exists, so the launcher paints the default gray
ramp and may flip to black after the first round trip (`useSettingsStore.ts:41-53`).

#### 5.3 How `body.launcher` works

`launcher.html:8` puts `class="launcher"` on `<body>`; `index.css:112-124` re-bases **eight** variables on
`body` (a lower cascade level than `:root`, so it wins for descendants):

```
--window-radius: 0px       (vs 22px)
--background:    0.17      (vs 0.25)
--card:          0.21      (vs 0.29)
--popover:       0.245     (vs 0.30)   ← deliberately LIGHTER than --card (elevation)
--surface:       0.25 opaque (vs oklch(1 0 0 / 6%))
--surface-active:0.30 opaque (vs oklch(1 0 0 / 11%))
--border:        1 0 0 / 8%  (vs 10%)
--input:         1 0 0 / 10% (vs 12%)
--ring:          0.74 0.1 245  ← detached from --primary; a burgundy ring was invisible here
```

plus `background: var(--background) !important` and `overflow: hidden` (`index.css:113-114`), because
`html, body` are forced `background: transparent !important` for the HUD (`index.css:104`).

`:root[data-theme="black"] body.launcher` (`index.css:126-132`) repeats five of them — the extra selector
is required because `body.launcher` and `:root[data-theme="black"]` have equal specificity
(`CLAUDE.md:424`).

**Not re-based in `body.launcher`**: `--foreground`, `--muted`, `--muted-foreground`, `--primary`,
`--secondary`, `--accent`, `--destructive`, `--code-surface`, `--recording`, `--app-opacity`,
`--chat-font-size`. Any launcher use of `bg-muted` therefore sits on the HUD's ramp — the one live case is
the level-meter track in `AudioCheckCard.tsx:60`.

Launcher-only CSS beyond the ramp: `@keyframes launcher-rise` + `.launcher-rise` (`index.css:134-147`),
staggered by inline `animationDelay` from `riseDelay(order)` (`LauncherPanel.tsx:24-26`,
`RISE_STEP_MS = 50`, applied at `:137, :167, :176`). `prefers-reduced-motion` silences `.launcher-rise`,
`.eq-bar`, `.thinking-shimmer` (`index.css:149-155`) — any new `@keyframes` must join that selector.

#### 5.4 Components reading a CSS variable directly (not through a utility)

Complete list for the whole app:

| File:line | What | Window |
| --- | --- | --- |
| `src/App.tsx:778` | `className="app-shell … rounded-[var(--window-radius)]"` | HUD |
| `src/components/ConnectivityOverlay.tsx:8` | `rounded-[var(--window-radius)]` | HUD |
| `src/components/ui/dialog.tsx:31` | `rounded-[var(--window-radius)]` on the overlay | shared (HUD-only in practice) |
| `src/components/ui/select.tsx:72` | `h-[var(--radix-select-trigger-height)] w-[var(--radix-select-trigger-width)]` — Radix's own vars, not theme tokens | shared (launcher uses it) |
| `src/index.css:162-166` | `.app-shell { background-color: color-mix(in oklch, var(--background) calc(var(--app-opacity) * 100%), transparent) }` | HUD |

**No component under `src/features/launcher/**` reads a CSS variable directly.** Its inline `style`
attributes are geometry/timing only: `animationDelay` (`LauncherPanel.tsx:137,167,176`), `width: N%`
(`AudioCheckCard.tsx:63`, `UpdatesScreen.tsx:51`). The HUD adds `EqBars.tsx:18-21` (height +
animationDelay), `StatusBar.tsx:47`, `UpdateDialog.tsx:133`, `PreviewPanel.tsx:80`, `Teleprompter.tsx:126,130`,
`App.tsx:779,782`.

Surviving raw Tailwind palette colours (no token): `PreviewPanel.tsx:17` `bg-white`,
`AttachmentChip.tsx:17` `bg-black/75 text-white`, `Teleprompter.tsx:120` `bg-black/85`,
`ui/dialog.tsx:31` `bg-black/55` — all HUD-side; **zero in the launcher**.

---

### 6. Tech debt that will get in the way of a UI rewrite

Ranked by how much it will slow a launcher rewrite.

**6.1 One god object drilled through every settings control.** `SectionProps = {draft: Settings; set: SetSetting}`
(`contract.ts:15-18`) hands all 36 settings fields to all 8 sections. `set` rebuilds the whole draft
(`LauncherPanel.tsx:127-129`), so any keystroke in any field changes `draft`'s identity and re-renders the
active section, `LaunchBar`'s `searchSources` memo (`LauncherPanel.tsx:56-66` depends on
`draft.prompt_presets` and `draft.quick_actions`) and everything below. No section can be tested or moved
without a full `Settings` object (see `QuickActionsSection.test.tsx:23`).

**6.2 `readiness` is a 6-field object drilled 4 levels, carrying a whole API inside it.**
`LauncherApp.tsx:19` → `LauncherPanel` → `LaunchBar` → `StatusLine` (`LaunchBar.tsx:109`) and `LaunchButton`
(`:116`); and `LauncherPanel` → `StartScreen` (`:183`) → `PermissionControl`. `readiness.permissions` is the
entire `PermissionsApi` (11 members, `usePermissions.ts:11-23`) so `StartScreen` and `PermissionsScreen`
both call `request`/`openSettings` through a prop chain rather than a hook.

**6.3 `App.tsx` is 902 lines and is a god component.** What it actually contains:

| Region | Lines | Kind |
| --- | --- | --- |
| imports (18 components, 19 hooks, 7 commands, 12 lib modules) | 1-80 | — |
| pure helpers: `historyWithNewUserMessage`, `draftImages`, `requestImages`, `chatSystemPrompt`, `lastHtmlBlock`, `copyLastAssistantMessage`, `lastAssistantText`, `updateBadge` | 93-144 | should be `lib/` |
| `useSttFeedback` | 146-190 | inline hook |
| `usePreviewPanel` | 192-225 | inline hook |
| `useWindowFrameSync` | 227-245 | inline hook |
| `useNativeResizeSync` | 247-276 | inline hook |
| `useProjectedContextTokens` | 278-301 | inline hook |
| `useSendPipeline` (`streamChat`, `dispatchSend`, `dispatchQuickAction`, `dispatchAutoTurn`, `doSend`, `resendFromMessage`) | 303-393 | inline hook, the app's core |
| `AppHeader` | 395-482 | inline component |
| `AppComposer` | 484-529 | inline component |
| `App` itself: 19 hook calls, 4 `useLatestRef` mirrors, 3 `onEvent` subscriptions, 6 derived values, 4 imperative handlers, the render | 548-901 | — |

Five of the inline hooks and both inline components are only used once, but they are physically inside the
file a redesign would have to open. `App.tsx` also owns three settings writes that bypass the launcher
entirely (`toggleScreenShareVisible:757`, `skipUpdate:765`, teleprompter `onPersist:850`).

**6.4 Duplicated logic between the two windows.**

| Concern | Launcher | HUD | Note |
| --- | --- | --- | --- |
| Settings persistence | `useSettingsStore.save` + 600 ms debounce (`LauncherPanel.tsx:108`) | three independent 400 ms debounces calling `ipcSet` directly (`useSettings.ts:43,75,106`) | two different debounce regimes, two different error handlings (the HUD's silently discards failures) |
| `screen_share_visible` | `BehaviorSection.tsx:29-35` | `ScreenShareIndicator` → `App.tsx:757-763` | the only setting with two edit points (`CLAUDE.md:130`) |
| Update UI | `UpdatesScreen.tsx:61-126` (full screen) | `UpdateDialog.tsx:52-166` (modal) | two renderers over the same `UpdaterApi`; near-identical `downloadPercent`/`formatMib`/`progressCaption` in `UpdatesScreen.tsx:16-38` and `UpdateDialog.tsx:31-51` |
| Quick-action numbering | `comboByActionId` (`QuickActionsSection.tsx:34-41`) | `QuickActionsBar.tsx:58` | both go through `quickActionHint` — correctly shared |
| Access-code entry | `StartScreen.tsx:101` and `ApiKeysSection.tsx:46` | — | same component twice on two launcher screens |
| Context library | `ContextLibraryPanel` (editor) | `LibraryPicker` in `Composer.tsx:442` (selector) | same store, two UIs |

**6.5 Components that mix layout with IPC.** By design (`CLAUDE.md:331`: "the sections import commands
from `@/ipc/commands` directly" — the `LauncherPort` DI layer was removed on purpose), but it is still a
rewrite cost:

| Component | Direct backend touch |
| --- | --- |
| `sections/SttSection.tsx:31` | `useQuery(listAudioOutputDevices)` inside the section |
| `sections/AutoModeSection.tsx:21` | `useQuery(listAudioInputDevices)` |
| `sections/ApiKeysSection.tsx:67` | `openExternal(info.consoleUrl)` |
| `sections/AppearanceSection.tsx:24` | `applyTheme(document.documentElement, v)` — direct DOM write |
| `ContextLibraryPanel.tsx:97,155` | `readContextImportFile`, `readContextPdfBytes` |
| `ContextLibraryPanel.tsx:83` | `onFileDrop` webview subscription + `document.elementFromPoint` hit-testing (`:70-74`) and hand-rolled mouse drag (`:112-147`) |
| `components/PreviewPanel.tsx:31` | `setPreviewHtml` |
| `components/AnswerPanel.tsx:81` | `openExternal` |

`ContextLibraryPanel` is the worst offender: 605 lines mixing two custom drag implementations, DOM
hit-testing via a `data-drop-folder` attribute (`:48,70-74`), file reading, base64 conversion and the whole
tree UI.

**6.6 Test files that break on markup changes.** Launcher-facing (9 files under `features/launcher`, of
which 7 render DOM):

| File | Count | Asserts (verbatim strings / DOM shape it depends on) |
| --- | --- | --- |
| `LaunchBar.test.tsx` | 4 | texts "Проверяю доступы…", "Всё готово к запуску", "Сохраняю…", the blocker label; `getByText("Запустить").closest("button").disabled`; that the blocker text is a **clickable** node; that "Сохраняю…" *replaces* the blocker |
| `screens/StartScreen.test.tsx` | 11 | `role="group"` with `aria-label` = step title ("Доступ к API", "Запись системного звука", "Микрофон"); chips "готово"/"нужно сделать"/"проверяю…"; placeholder `XXXXX-XXXXX-XXXXX-XXXXX`; buttons "Активировать", "Ввести свои ключи", "Выдать", "Настройки", "Все доступы", "Все настройки", "Запустить"/"Запускаю…"; texts "Всё готово — можно запускать.", "Проверяю доступы…", "Проверка звука", "Системный звук"; exact `onNavigate` payloads `{screen:"settings",tab:"access"}`, `{screen:"permissions",tab:undefined}`, `{screen:"settings"}`; mocks `@/ipc/events` and `@/ipc/commands` |
| `screens/PermissionsScreen.test.tsx` | 7 | `role="group"` per row; state words "выдан"/"нет доступа"/"не выдан"; need words "обязателен"/"нужен автослушанию"/"необязателен"; buttons "Выдать"/"Запрашиваю…"/"Настройки"/"Проверить заново"; that a granted row has **no** buttons; that all request buttons disable while one is pending |
| `LauncherSearch.test.tsx` | 6 | placeholder "Поиск по настройкам"; `role="listbox"`/`role="option"`; that an option's text contains both the title and the breadcrumb "Настройки → Вид"; ArrowDown/ArrowUp/Enter/Escape/blur semantics; "Ничего не найдено" |
| `SettingsTabsRail.test.tsx` | 3 | `getAllByRole("tab").length === SETTINGS_TABS.length`; accessible name = `tab.label`; `aria-selected` |
| `sections/QuickActionsSection.test.tsx` | 7 | button "Добавить" + its disabled state at `QUICK_ACTION_LIMIT`; `title="Удалить быстрое действие"`; `aria-label="Название"` / `"Промпт"` / `"Прикреплять вложения"`; rendered combo text "⌘1"/"⌘2" and that an empty action gets none |
| `AudioCheckCard.test.tsx` | 6 | **selects by class**: `screen.getByText(label).closest("div[class*='grid']")` (`:27`) — breaks if `SettingRow` stops being a grid; texts "Проверить"/"Слушаю…", "Расслышала: «…»", "Тишина — звук не дошёл", "Звук идёт, но речи в нём не разобрать."; `document.querySelector("span[style*='width: 50%']")` (`:101`) — breaks if the level meter stops using an inline width |
| `search.test.ts` | 13 | pure logic — survives any markup change; asserts routing (`hotkey → tab`, digits → `quick-actions`, arrows → `window`), the Windows platform filter, rank ordering, id uniqueness, and that `opacity` is not indexed |
| `start-steps.test.ts` | 10 | pure logic — step composition, Windows single-step case, the three states, microphone conditionality |

Adjacent tests a launcher rewrite will also hit: `components/AccessCodeForm.test.tsx` (4 — placeholder,
"Активировать"/"Активация…", error retention), `hooks/usePermissions.test.ts` (3),
`hooks/useUpdater.test.ts` (5), `hooks/useContextLibrary.test.ts` (3), `hooks/useSettings.test.ts` (8),
`lib/api-keys.test.ts` (9 — including that every key has an `https` console URL), `ipc/contract.test.ts`
(type-level `SameShape` assertions that must not be deleted, `CLAUDE.md:89`).

**6.7 Invariants a naive redesign would silently violate.**

| Invariant | Where stated | How it breaks silently |
| --- | --- | --- |
| Indicator-dot vocabulary: `destructive` = must act, `primary` = fine/info, `muted-foreground` = checking | `CLAUDE.md:174`; live at `LaunchBar.tsx:41-42`, `Sidebar.tsx:62`, `StartScreen.tsx:40`, `PermissionsScreen.tsx:22` | recolouring a blocker dot to primary makes "ready" and "blocked" look identical at 6 px |
| `--primary` is never a text colour | `CLAUDE.md:174` | only one `text-primary` exists in the launcher (`StartScreen.tsx:59`, the *done* check icon — an indicator, legal) |
| `--destructive` is separated from `--primary` in hue **and** lightness | `CLAUDE.md:174`; `index.css:21,27` | merging them back makes `size-1.5` dots indistinguishable |
| `SectionLabel` is the only uppercase step (plus the LaunchBar brand) | `CLAUDE.md:417`; `SectionLabel.tsx:8`, `LaunchBar.tsx:100` | a second uppercase level destroys the one hierarchy signal |
| Exactly five font steps | `CLAUDE.md:419`; `index.css:84-88`, `lib/utils.ts:7` | a `text-sm` slipped into a shared `ui/*` primitive changes the HUD too |
| Focus is only `focus-visible:ring-2` | `CLAUDE.md:170`; `ui/button.tsx:7`, `Sidebar.tsx:45`, `SettingsTabsRail.tsx:32` | — |
| Radius comes from `--radius` / `--window-radius`, never a literal | `CLAUDE.md:170` | a `rounded-[12px]` decouples from the ladder |
| Fixed-width action column so a permission row's geometry never depends on its state | `CLAUDE.md:396`; `PermissionsScreen.tsx:43` (`grid-cols-[1.25rem_minmax(0,1fr)_14rem]`), `min-w-18` at `:75`, `min-h-9` at `:58` — the same `14rem` as `SettingRow` (`fields.tsx:45`) | the TCC prompt is async, so the status flips under the cursor; a state-dependent width yanks "Выдать" away from the finger |
| Permissions are granted from exactly one place; no modals | `CLAUDE.md:384-386` | the "Старт" card duplicates the *control*, never the *state* (`CLAUDE.md:419`) |
| The readiness gate derives from `permissions_status`, **not** from the screen's visibility | `CLAUDE.md:384`; `useLauncherReadiness.ts:55` | moving permissions into "Настройки" would silently drop the audio requirement |
| The launcher always lands on `DEFAULT_SCREEN` | `CLAUDE.md:414`; `LauncherPanel.tsx:51` | reintroducing "land on the blocker" makes the first screen change under the user on every cold start |
| The header wrapper must be `relative z-30` | `CLAUDE.md:410`; `LauncherPanel.tsx:137` | `.launcher-rise` creates a stacking context, so the `z-20` results list (`LauncherSearch.tsx:118`) gets painted over by the screen block |
| Search results must carry `data-no-drag` | `CLAUDE.md:410`; `LauncherSearch.tsx:117`, matched by `NON_DRAGGABLE_SELECTOR` (`window-controls.ts:1`) | a click on a gap between rows drags the window instead of selecting |
| The rail breakpoint is `min-[900px]`, calculated not guessed | `CLAUDE.md:402`; `SettingsTabsRail.tsx:32,45,55`, `SettingsScreen.tsx:39` | at `lg` a default 1000 px window shows icons only |
| The `system` sidebar group stays pinned with `mt-auto` (owner-confirmed) | `CLAUDE.md:400`; `Sidebar.tsx:79` | — |
| The sidebar is icons-only at every width, and `notice.label` must reach `title` | `CLAUDE.md:400`; `Sidebar.tsx:16-18,40` | a dot with no hoverable explanation |
| Bounded numbers are sliders only, reading `SETTINGS_LIMITS` directly | `CLAUDE.md:91,421`; `bindings.ts:63` used at `SttSection.tsx:121`, `AutoModeSection.tsx:89`, `WindowSection.tsx:15`, `AppearanceSection.tsx:35` | a `type=number` re-creates the "typed value survives the Rust clamp" desync |
| A dependent row is greyed, never hidden | `CLAUDE.md:421`; `SttSection.tsx:125` | hiding jolts the card height and leaves a dead search route |
| No `transition-opacity` anywhere; hover-reveal is instant with `pointer-events-none` | `CLAUDE.md:161`; `PresetsSection.tsx:38`, `ContextLibraryPanel.tsx:195` | in the HUD it strands unflushed compositing pixels; the launcher follows the same rule for consistency |
| Every new `@keyframes` joins the `prefers-reduced-motion` block | `CLAUDE.md:426`; `index.css:149-155` | one twitching element remains with motion disabled |
| Registries are the single source of truth | `CLAUDE.md` invariant 12 | adding a screen in markup skips the sidebar, search, breadcrumbs and start steps |
| No hardcoded hotkey combinations, including no ⌘K for search | `CLAUDE.md:410,430` | — |
| `bindings.ts` is generated; `contract.test.ts` assertions must not be deleted | `CLAUDE.md:87-89` | hand-written types drift back |

---

## Feature inventory

Everything reachable from the launcher today, control by control. This is the no-feature-loss checklist.

### A. Header (`LaunchBar.tsx`) — always visible

1. **Brand mark** — 5-bar equaliser, animated only while `launching`, `bg-primary` (`LaunchBar.tsx:99`) +
   `harpyhare.ai` in mono uppercase (`:100-102`, `lib/brand.ts:1`).
2. **macOS traffic-light inset** — `pl-16` when `PLATFORM === "macos"` (`LaunchBar.tsx:12`).
3. **Window drag by the header** (`LaunchBar.tsx:92-95` → `useWindowDrag` → `startWindowDrag`).
4. **Search field** — placeholder/aria "Поиск по настройкам" (`LauncherSearch.tsx:12,66-67`),
   `role="combobox"`, `aria-activedescendant`; opens on focus, closes on blur/Escape.
   - Results: max 8 (`:7`), each a single line "title … breadcrumb" (`:146-149`).
   - Keyboard: ArrowDown/ArrowUp wrap-around, Enter opens, Escape clears (`:89-109`).
   - Mouse: hover sets the active row (`:139-141`), click navigates and clears (`:45-48`).
   - Empty state "Ничего не найдено" (`:13,124`).
   - Overflow row "Показаны первые N из M — уточните запрос" (`:25-27,152-156`).
   - Index contents (`search.ts:281-292`): screens (platform-filtered), settings tabs (label+description),
     hotkey actions (minus `opacity`), the hand-written `SETTINGS_ROWS`, API-key rows, window-step rows,
     the quick-action combo row, permission rows (macOS only), the user's presets, the user's quick
     actions, the user's context docs.
5. **Readiness status line** (`LaunchBar.tsx:14-21`), five mutually exclusive texts, in priority order:
   "Запускаю основное окно…" → "Проверяю доступы…" → "Сохраняю…" → first blocker label → "Всё готово к
   запуску". With a blocker and not busy it becomes a ghost button with a chevron that routes to
   `blocker.screen`/`blocker.tab` (`:48-64`).
6. **Status dot** — `bg-muted-foreground/40` while busy, `bg-destructive` with a blocker, `bg-primary`
   otherwise (`LaunchBar.tsx:39-43`).
7. **"Запустить" / "Запускаю…" button** — disabled unless `ready && !checking && !launching`
   (`LaunchButton.tsx:25`, `useLauncherReadiness.ts:38-40`).
8. **Save-error banner** under the header — destructive dot + full error text, no retry
   (`LauncherPanel.tsx:159-164`).

### B. Sidebar (`Sidebar.tsx`) — always visible

9. Six icon buttons, `role="tab"`, in three groups; `system` pinned to the bottom (`:79`): **Старт ·
   Контексты · Пресеты** ⟂ **Настройки · Доступы (macOS only) · Обновления**.
10. Active marker: 2 px `bg-primary` bar on the left edge + `bg-surface-active` (`Sidebar.tsx:51-56,47`).
11. Notice dot per item: `bg-destructive` for a readiness blocker, `bg-primary` for an available update
    (`Sidebar.tsx:58-66`, fed by `LauncherPanel.tsx:68-86`).
12. `title` = `"<label> — <notice label>"` (`Sidebar.tsx:16-18`) — the only affordance explaining a dot.

### C. Screen "Старт" (`screens/StartScreen.tsx`)

13. Screen heading + description from the registry (`ScreenShell.tsx:17-25`, `screens.ts:31`).
14. Card **"Что нужно для запуска"** with a summary line: "Проверяю доступы…" / "Осталось шагов: N." /
    "Всё готово — можно запускать." (`StartScreen.tsx:28-32`).
15. Step **"Доступ к API"** (`start-steps.ts:31-42`): icon (`Check` when done), title from
    `API_ACCESS_TITLE`, state chip **готово / нужно сделать / проверяю…**, hint = `missingKeysNotice(...)`
    or "Запросы уходят от вашего имени — ключи или код уже приняты."
    - when not done: **access-code field** with `autoFocus` + button "Активировать"/"Активация…" + inline
      error, Enter submits (`AccessCodeForm.tsx:35-53`);
    - link **"Ввести свои ключи"** → `settings/access`; when done it reads **"Изменить доступ"**
      (`StartScreen.tsx:83-95`).
16. Step **"Запись системного звука"** (macOS; `permission-rows.ts:29-35`): purpose text, state chip, and
    when todo — **"Выдать"/"Запрашиваю…"** + **"Настройки"** (opens the OS privacy pane); always a
    **"Все доступы →"** link (`StartScreen.tsx:118-153`).
17. Step **"Микрофон"** — appears only when `auto_mode_enabled` (`permission-rows.ts:53-57`), same three
    controls.
18. Card **"Проверка звука"** (`AudioCheckCard.tsx:69-102`): description; row **"Системный звук"** with
    **"Проверить"/"Слушаю…"** and a live level meter fed by the `audio-level` event; row **"Микрофон"**
    only when auto mode is on. Three outcome texts: `Расслышала: «…»` / `Звук идёт, но речи в нём не
    разобрать.` / `Тишина — звук не дошёл…`; backend errors print their own message (`:47-56`). Second
    run is blocked while one is running (`:90`).
19. Footer card: the defaults note (`StartScreen.tsx:25-26`), **"Все настройки"** → `settings`, and a
    **second "Запустить"** button (`:196-205`).

### D. Screen "Контексты" (`ContextLibraryPanel.tsx`)

20. Summary: "Библиотека пуста" or "матер.: N · папок: M" (`:406-410`).
21. **"+ Материал"** → inline editor: name input, folder select ("Без папки" + folders), textarea
    (8 rows, `max-h-56`), live char counter, **Отмена** / **Сохранить** (`:454-462, :316-382`).
22. **"+ Папка"** → creates `Папка N` (`:463-471`).
23. **"Импорт"** → hidden multi-file input, `accept=".md,.markdown,.txt,.pdf"` (`:49, :472-489`); PDFs go
    through `read_context_pdf_bytes` (`:153-156`).
24. **Native file drop** onto the root zone or onto a folder, with a `bg-primary/5 ring-primary/40` drop
    highlight (`:76-108, :514-519, :556-559`).
25. **Empty drop zone** with platform-specific copy — "из Finder" / "из проводника" (`:52-55, :384-404`).
26. **Doc row**: grip handle, file badge, name, char count ("N симв." / "N,N тыс. симв.", `:64-68`),
    hover-revealed **Редактировать** / **Удалить материал** (`:208-252`).
27. **Drag a doc between folders** — 5 px threshold, `elementFromPoint` hit-testing, drop highlight,
    40 % opacity while dragging (`:110-147, :231-234`).
28. **Folder header**: badge, name, doc-count pill, inline rename (Enter commits, Escape cancels, blur
    commits), hover **Переименовать папку** / **Удалить папку (материалы переедут в корень)** (`:254-314`).
29. Empty-folder hint "Пусто — перетащи файлы сюда" and empty-root hint "Перетащи файлы сюда, чтобы
    добавить без папки" (`:524-528, :572-576`).
30. Import error line in `text-destructive` (`:492`).

### E. Screen "Пресеты" (`sections/PresetsSection.tsx`)

31. Group **"Свои пресеты"**: empty state with an explainer + **"Создать пресет"** (`:118-130`).
32. Preset row: name (or "Без имени") + "N симв. · <preview>" / "пусто"; hover **Изменить пресет** /
    **Удалить пресет** (`:20-48`).
33. Preset editor: name input (autofocus) + **Готово**, 6-row textarea with placeholders (`:50-88`).
34. **"Добавить пресет"** (`:156-163`).
35. Group **"Встроенные"**: read-only list of official presets (name + one-line text) (`:166-176`).

### F. Screen "Настройки" (`screens/SettingsScreen.tsx`) — 7 tabs

36. Vertical tab rail: icons only below 900 px, icon + label at/above (`SettingsTabsRail.tsx:32,45,55`);
    active tab gets the 2 px primary bar (`:38-43`).
37. A description line above every tab's content (`SettingsScreen.tsx:45`, text from `settings-tabs.ts`).

**Tab «Ключи»** (`sections/ApiKeysSection.tsx`)
38. When `access_token` is set: card "Доступ к API" + row **"Код доступа активен"** with **"Отвязать"**
    (clears the token) (`:19-38`).
39. Otherwise: block **"Код доступа"** with the `AccessCodeForm` (`:45-47`).
40. Block **"Ключ Anthropic"** — password input, placeholder `sk-ant-…`, + **"Где взять"** →
    `https://console.anthropic.com/settings/keys` (`:48-75`, `lib/api-keys.ts:17`).
41. Block **"Ключ Groq"** — password input, placeholder `gsk_…`, + **"Где взять"** →
    `https://console.groq.com/keys` (`lib/api-keys.ts:23`).

**Tab «Речь»** = `SttSection` + `AutoModeSection`
42. Group «Распознавание речи» — **Устройство захвата**: select of "Системный вывод" + live output devices;
    an unavailable saved UID is shown as "Недоступное устройство" (`SttSection.tsx:37-40,42-64`).
43. **Язык распознавания**: Русский / English / Українська / Deutsch / Español / Français /
    Автоопределение; disabled while translation is on, with a different hint (`SttSection.tsx:73-95`).
44. **Перевод на английский**: switch (`:96-107`).
45. **Фоновый буфер**: switch (`:108-116`).
46. **Глубина буфера**: slider 4–10 s, step 1, readout "N с", disabled when the buffer is off
    (`:117-130`, bounds from `SETTINGS_LIMITS.bufferSeconds`).
47. Group «Автослушание» — **Включать при запуске**: switch (`AutoModeSection.tsx:60-71`).
48. **Отвечать без нажатия**: switch (`:72-83`).
49. **Микрофон**: select of "Системный микрофон" + input devices (`:32-52`).
50. **Пауза до конца реплики**: slider 300–2000 ms, step 50 (`:85-97`).
51. **Минимальная реплика**: slider 200–3000 ms, step 50 (`:98-110`).
52. **Максимальная реплика**: slider 5–120 s, step 5 (`:111-123`).

**Tab «Клавиши»** (`sections/HotkeysSection.tsx`) — one card per registry group, only `kind: "combo"`
actions (`:65-68`), i.e. 12 rows in 5 groups (`bindings.ts:55`):
53. **Запись**: Записать системный звук (⌘R) · Автослушание (⌘⇧L) · Отменить запись (Esc).
54. **Отправка**: Отправить (⌘⏎) · Ответить на услышанное (⌘⇧⏎) · Снимок области экрана (⌘⇧A) ·
    Сфокусировать поле ввода (⌘⇧D).
55. **Окно**: Скрыть или показать (⌘⇧H).
56. **Чат**: Дубликат чата (⌘⇧N) · Суфлёр (⌘⇧T).
57. **Суфлёр**: Закрыть суфлёр (Esc) · Пауза суфлёра (Space).
58. Each row: a capture button showing the formatted combo / "Не назначен" / "Жду сочетание · Esc отменит"
    with a ring while capturing (`HotkeyCapture.tsx:40-57`); Escape cancels capture; Meta on Windows is
    refused (`lib/hotkey-capture.ts`).
59. Each row: a reset icon-button "Вернуть ⟨default⟩", invisible when already at the default
    (`HotkeysSection.tsx:33-42`).
60. Unassigned rows swap their hint for "Не назначен — действие сейчас недоступно." (`:16,23`).
61. **Theft note** per group: "⟨combo⟩ снят у действия «⟨name⟩» — оно осталось без хоткея."
    (`HotkeysSection.tsx:48-61`).

**Tab «Действия»** (`sections/QuickActionsSection.tsx`)
62. Row **"Сочетание"**: select of the platform's modifier combos rendered as "⌘ + цифра"
    (`:115-129`, `MODIFIER_COMBOS[PLATFORM]` from `bindings.ts:57`), plus the theft note (`:130`).
63. Row **"Прикреплять вложения"**: switch (`:132-140`).
64. Empty note "Пока ни одного действия — кнопок над полем ввода не будет." (`:31,142-144`).
65. Per action: **Название** input, the computed combo readout (⌘1…⌘9, only for filled actions), a
    **Удалить быстрое действие** icon-button, and a 2-row **Промпт** textarea (`:43-84`).
66. **"Добавить"** button, disabled at `QUICK_ACTION_LIMIT` (9) with the note "Больше не поместится: цифр
    всего 9." (`:158-168`).

**Tab «Окно»** (`sections/WindowSection.tsx`) — three modifier+step pairs (`:10-34`):
67. **Передвинуть**: modifier select ("⌘ + стрелки"; combos already taken by the other two are filtered
    out, `:63`) + step slider 1–200 px, step 5.
68. **Изменить размер**: same shape.
69. **Скролл переписки**: same shape.
70. Theft note for the whole card (`:84`).

**Tab «Поведение»** (`sections/BehaviorSection.tsx`) — four switches:
71. **Показывать окно при демонстрации экрана** (`:25-36`).
72. **Отправлять сразу после распознавания** (`:6-9`).
73. **Открывать превью HTML** (`:10-14`).
74. **Суфлёр продолжает с места остановки** (`:15-19`).

**Tab «Вид»** (`sections/AppearanceSection.tsx`)
75. **Тема**: Серая / Чёрная — applies immediately to the launcher's own document (`:18-30`).
76. **Размер шрифта чата**: slider 10–20 px, step 0.5, readout "Npx" — **no preview in the launcher**
    (`:31-43`).
77. **Прозрачность окна**: slider 20–100 %, step 5 %, readout "N%" — **no preview in the launcher**
    (`:44-56`).

### G. Screen "Доступы" (macOS only, `screens/PermissionsScreen.tsx`)

78. Header action **"Проверить заново"** → `permissions.refresh()` (`:93-95`).
79. Card "Разрешения macOS" with the explanation of how TCC behaves (`:98-101`).
80. Row **Запись системного звука** — need "обязателен", purpose text (`permission-rows.ts:29-35`).
81. Row **Микрофон** — need "нужен автослушанию" (`:37-42`).
82. Row **Запись экрана** — need "необязателен" (`:44-49`).
83. Each row: icon, title, status chip **выдан / нет доступа / не выдан** (`:9-13`), and when not granted
    **"Настройки"** + **"Выдать"/"Запрашиваю…"**; all request buttons disable while any request is pending
    (`:61-83`).

### H. Screen "Обновления" (`screens/UpdatesScreen.tsx`)

84. Card **«Версия»** with row "harpyhare.ai X.Y.Z" (`:76-79`, version from `get_app_version`).
85. Caption under it: "Проверка идёт автоматически при запуске и раз в шесть часов." / "Проверяю…" /
    "Установлена последняя версия" / "Не удалось проверить обновления: ⟨error⟩" (`:33-38`).
86. **"Проверить"** button, disabled while checking (`:80-82`).
87. When an update exists: card **"Доступна версия X"** + "Приложение скачает её, проверит подпись и
    перезапустится." (`:87-90`).
88. Block **"Что нового"** — release notes rendered as GFM markdown, `max-h-56` scroll (`:91-97`).
89. Block **"Установка"** — progress bar (indeterminate pulse when the total is unknown) + caption
    "Загрузка N%" / "Загрузка N.N МиБ" / "Установлено. Перезапуск…" (`:40-59, :99-103`).
90. Block **"Ошибка установки"** with the error text (`:105-111`).
91. Actions **"Позже"** (dismiss) and **"Обновить и перезапустить"** / **"Повторить"** after an error
    (`:113-122`).

### I. Cross-cutting

92. Entry animation cascade: three `.launcher-rise` wrappers staggered 0/50/100 ms
    (`LauncherPanel.tsx:137,167,176`).
93. Screen and tab crossfade (`animate-in fade-in-0 slide-in-from-bottom-1 duration-150`,
    `LauncherPanel.tsx:179`, `SettingsScreen.tsx:43`), silenced by `motion-reduce`.
94. Autosave with no Save button, 600 ms debounce, "Сохраняю…" in the header (§3.2).
95. Full-window loading state "Загрузка…" until `get_settings` returns (`LauncherApp.tsx:65-70`).

### J. Settings coverage

28 of the 36 `Settings` fields (`ipc/types.ts:19-56`) are editable from the launcher. **Not** reachable:
`window_width`, `window_height` (HUD resize only), `teleprompter_speed`, `teleprompter_font_size` (persisted
by the HUD teleprompter, `App.tsx:850`), `skipped_version` (HUD "Пропустить", `App.tsx:765`), and the three
Rust-internal flags `audio_permission_requested`, `screen_permission_requested`, `mic_permission_requested`.
(`CLAUDE.md:109` says "37 fields"; the actual count in both `settings.rs` and `types.ts` is 36.)

**No launcher control exists for**: quitting the app, opening the app-data folder, viewing logs, resetting
settings to defaults, exporting/importing settings, or reaching the HUD's hotkey cheat-sheet
(`HotkeysPopover` is HUD-only).

---

## Problems

### P0 — blocks a new user reaching daily use

- **P0-1. The launcher is destroyed on launch, and nothing replaces it.** `swap_to_main_window` calls
  `launcher_window(app).destroy()` (`src-tauri/src/window.rs:197-198`); `usePermissions` and `useAudioCheck`
  have no HUD consumer (only `useLauncherReadiness.ts:44` and `AudioCheckCard.tsx:70`). Consequence: once
  the product is running there is **no surface at all** that answers "is it listening / is audio healthy /
  is the permission still granted", and the only route back is "Стоп" (`App.tsx:802`), which tears down the
  HUD, unregisters every global hotkey and stops auto mode (`window.rs:213-220`).
- **P0-2. Two Appearance controls do nothing visible where they are edited.** `LauncherApp.tsx:11-13`
  applies only `applyTheme`; `applyOpacity`/`applyChatFontSize` live exclusively in the HUD layer
  (`useSettings.ts:22-23`). Consequence: a user dragging "Прозрачность окна" to 20 % or the chat font to
  20 px sees zero feedback and cannot tell whether the setting took.
- **P0-3. The draft never adopts what Rust actually saved.** `set_settings` returns the clamped `Settings`
  and the store adopts it (`useSettingsStore.ts:58`), but `LauncherPanel` syncs only `access_token` back
  into `draft` (`LauncherPanel.tsx:93-97`). Consequence: after `Settings::clamp` steals a conflicting
  hotkey or trims quick actions past the limit, the launcher keeps displaying a binding that no longer
  exists on disk until the window is recreated.
- **P0-4. Autosave has one shared status slot and no recovery.** "Сохраняю…" occupies the same line as the
  blocker text and outranks it (`LaunchBar.tsx:15-20`), so the acknowledgement is a ~600 ms flash that also
  hides the thing the user was told to fix; a failed save produces a banner with no retry
  (`LauncherPanel.tsx:159-164`) while `lastQueuedDraft` has already advanced (`:107`), so the change is
  never re-attempted.

### P1

- **P1-1. Five auto-mode settings cannot be found by search.** `SETTINGS_ROWS` (`search.ts:69-134`) is
  hand-maintained and omits "Включать при запуске", "Микрофон", "Пауза до конца реплики", "Минимальная
  реплика", "Максимальная реплика" (`AutoModeSection.tsx:61,35,85,98,111`), plus the whole "Проверка звука"
  card. Consequence: the launcher's own answer to "hunting settings" has holes exactly where the newest
  feature lives.
- **P1-2. Icon-only navigation with no shortcut.** 6 sidebar icons with no labels at any width
  (`Sidebar.tsx:76`) and 7 tab icons below 900 px (`SettingsTabsRail.tsx:45`) = 13 unlabelled targets;
  search has no keyboard shortcut by policy (`CLAUDE.md:410`). Consequence: a first-run user must hover
  each icon to build a mental model.
- **P1-3. `readiness` (with a whole API object inside) is drilled four levels.**
  `LauncherApp.tsx:19` → `LauncherPanel.tsx:139/183` → `LaunchBar.tsx:109/116` → `StartScreen.tsx:183` →
  `PermissionControl`. Consequence: any re-layout of the header or of "Старт" moves the prop chain too.
- **P1-4. Every settings control takes the entire `Settings` object.** `contract.ts:15-18` +
  `LauncherPanel.tsx:127-129`. Consequence: sections cannot be extracted, reordered into a different IA, or
  unit-tested without a full settings fixture (`QuickActionsSection.test.tsx:23`).
- **P1-5. Seven test files assert launcher markup verbatim.** See §6.6. `AudioCheckCard.test.tsx:27`
  selects `div[class*='grid']` and `:101` selects `span[style*='width: 50%']`. Consequence: a layout-only
  redesign turns those red for reasons unrelated to behaviour.
- **P1-6. `ScreenShell` is applied at two different levels.** `LauncherPanel.tsx:206,211` vs
  `StartScreen.tsx:173`, `SettingsScreen.tsx:38`, `PermissionsScreen.tsx:90`, `UpdatesScreen.tsx:74`.
  Consequence: changing the screen chrome means editing six places and remembering which two are inverted.
- **P1-7. `ContextLibraryPanel` is 605 lines of layout + two drag systems + file IO.**
  `ContextLibraryPanel.tsx:70-74` (DOM hit-testing), `:76-108` (native drop), `:112-147` (mouse drag),
  `:153-173` (file reading). Consequence: the "Контексты" screen cannot be restyled without touching
  behaviour.

### P2

- **P2-1. `useHotkeyEditor` is instantiated three times** (`HotkeysSection.tsx:64`,
  `QuickActionsSection.tsx:87`, `WindowSection.tsx:40`) and its `stolen` state dies on the `key={tab}`
  remount (`SettingsScreen.tsx:42`). A cross-tab theft note can never be re-read after switching away.
- **P2-2. `StolenNote` is imported from one section by two others** (`QuickActionsSection.tsx:15`,
  `WindowSection.tsx:8`) — a section-to-section dependency that blocks moving either file.
- **P2-3. `checkState` lives in `LauncherPanel.tsx:50` but is used only by `UpdatesScreen`** — screen state
  hoisted two levels too high, and `checkUpdates` (`:116-125`) with it.
- **P2-4. `PresetsSection` sits in `sections/` but is not a settings-tab section** — it is the whole
  "Пресеты" screen (`LauncherPanel.tsx:212`) and takes a different props shape (`PresetsSection.tsx:90`).
- **P2-5. `useOfficialPresets` is mounted three times** (`LauncherPanel.tsx:54`, `PresetsSection.tsx:97`,
  `App.tsx:588`); react-query dedupes, but the duplication hides where the data belongs.
- **P2-6. `--muted` and `--foreground` are not re-based for the launcher** (`index.css:112-124`), so
  `bg-muted` in `AudioCheckCard.tsx:60` renders against the HUD's lightness ramp.
- **P2-7. Three shadcn primitives have zero importers** — `badge.tsx`, `scroll-area.tsx`, `tooltip.tsx`;
  they are invisible to knip because of `knip.json:12`, so they will not be flagged when they rot.
- **P2-8. Two near-identical updater renderers** — `UpdatesScreen.tsx:16-59` and `UpdateDialog.tsx:31-141`
  duplicate `downloadPercent`, `formatMib` and `progressCaption`.
- **P2-9. `closeApp` is dead contract surface** (`bindings.ts:34`, `bindings.rs:46`) — the app can only be
  quit through the OS window control.

### P3

- **P3-1. Search result clicks depend on `onMouseDown` `preventDefault`** (`LauncherSearch.tsx:119-121`)
  because `onBlur` closes the list (`:86-88`) — a fragile pairing to re-implement blindly.
- **P3-2. Rise-delay ordering is hardcoded 0/1/2** in three call sites (`LauncherPanel.tsx:137,167,176`).
- **P3-3. `Sidebar` does a linear `notices.find` per item** (`Sidebar.tsx:87`).
- **P3-4. Doc drift in `apps/desktop/CLAUDE.md`**: `:327` says `normalizeDraft` substitutes hotkey defaults
  (it does not — `LauncherPanel.tsx:28-34`, contradicted by `CLAUDE.md:435`); `:386` describes the removed
  `landed` ref (contradicted by `:414` and `LauncherPanel.tsx:51`); `:109` says 37 settings fields (there
  are 36).
- **P3-5. `AppearanceSection.tsx:24` writes to `document.documentElement` from inside a section render
  handler** — the only direct DOM mutation in the launcher tree.

---

## Opportunities

- **The IA is data, not markup.** Renaming, reordering, merging or splitting screens/tabs is an edit to
  `screens.ts:27-71` and `settings-tabs.ts:19-63`; the sidebar (`Sidebar.tsx:78-91`), the search index
  (`search.ts:152-190`), breadcrumbs (`search.ts:147-150`), the screen chrome (`ScreenShell.tsx:13`) and the
  start steps (`start-steps.ts:49-63`) all follow automatically. Adding a screen for a platform is one
  optional `platforms` field.
- **One form vocabulary, 156 lines.** Restyling all ~30 setting rows means rewriting `fields.tsx` only
  (`SettingGroup/Row/Block/Select/Switch/Slider`, `fields.tsx:9,33,57,77,100,112`); every section already
  speaks it and none of them carries layout of its own beyond a grid or two.
- **One navigation primitive.** `goTo({screen, tab})` (`LauncherPanel.tsx:88`) is the single funnel for
  sidebar, search, blockers and in-screen links — a router, a command palette or a wizard can be dropped in
  behind it without touching any caller.
- **One typed façade.** `LauncherPanelProps` (`contract.ts:20-32`) is 11 props; `LauncherPanel` can be
  replaced wholesale with `LauncherApp` untouched, which keeps the readiness/redeem/launch wiring intact.
- **Bounds and hotkey metadata cannot drift.** Every numeric control already reads `SETTINGS_LIMITS`
  (`bindings.ts:63`) and every hotkey row reads `HOTKEY_ACTIONS` (`bindings.ts:55`), so new controls inherit
  correctness for free.
- **Theming is a token edit, not a component sweep.** The launcher palette is 13 lines
  (`index.css:112-132`), and **no launcher component reads a variable directly** (§5.4) — the utility layer
  is the only coupling. Zero hex/rgb/hsl/oklch literals exist in any `.tsx`.
- **Window-agnostic state hooks.** `usePermissions`, `useAudioCheck`, `useUpdater`, `useContextLibrary`,
  `useSettingsStore` have no launcher imports and already run under a `QueryClientProvider` in both windows
  — a HUD-side "is it listening" surface (P0-1) can reuse them verbatim.
- **The launch condition is already centralised.** `canLaunch` (`useLauncherReadiness.ts:38`) + a single
  `LaunchButton` (`LaunchButton.tsx:10`) means any number of launch entry points stays consistent for free.
- **Two launcher test files are pure logic** — `search.test.ts` (13 cases) and `start-steps.test.ts`
  (10 cases) plus the hook suites survive any markup rewrite, so the routing/step semantics stay pinned
  while the DOM changes.
- **A second window is cheap.** Adding a third entry point is one `rollupOptions.input` line
  (`vite.config.ts:17-22`), one `knip.json:10` entry and one `renderWindowRoot` call — a dedicated
  "running" panel is not architecturally blocked.

---

## Open questions for the human

1. **After launch, who answers "is it listening?"** The launcher window is destroyed
   (`window.rs:197-198`) and the HUD has no permission or audio-health surface. Should the redesign add one
   to the HUD, keep the launcher alive alongside it, or make "Стоп" cheap enough to be the answer?
2. **Is "Стоп" meant to be a full teardown?** Today it stops auto mode, unregisters every global hotkey and
   destroys the HUD (`window.rs:213-220`). Is that the intended semantics of the button, or is it meant to
   read as "back to settings"?
3. **Should the app be quit-able from the UI?** `close_app` exists in the contract (`bindings.rs:46`) and is
   unreachable; today the only quit is the OS window control.
4. **Should Appearance preview in the launcher?** Opacity and chat font size are HUD-only today
   (`useSettings.ts:22-23`). Preview them in the launcher, move them to the HUD, or label them as
   HUD-only?
5. **When Rust clamps or steals, should the user see it?** `Settings::clamp` normalises hotkeys and trims
   quick actions, and the launcher never re-reads the result (`LauncherPanel.tsx:93-97`). Silent, or
   surfaced?
6. **Are auto-mode settings deliberately unsearchable?** Five rows are missing from `SETTINGS_ROWS`
   (`search.ts:69-134`) — oversight, or a decision that auto mode is "advanced"?
7. **Is Russian-only copy a constraint for this redesign?** There is no i18n layer and ~533 Russian
   literals live inline in `.tsx` (`CLAUDE.md`/repo map §4); new copy currently must be written the same
   way.
8. **Should the launcher and HUD ever coexist?** They are mutually exclusive windows today
   (`window.rs:193-199, 213-220`); a redesign that wants settings-while-running needs that decision first.
9. **Is the icon-only sidebar still the right call at the new IA's size?** It was chosen because two text
   rails ate a third of the window (`CLAUDE.md:400`) — a different IA may remove that constraint.
