import { permissionRowCopy, PERMISSION_ROWS } from "@/features/settings/permission-rows";
import { SETTINGS_ENTRIES } from "@/features/settings/settings-registry";
import { SETTINGS_TABS, type SettingsTabId } from "@/features/settings/settings-tabs";
import { format } from "@/i18n";
import type { Dictionary, Locale } from "@/i18n/types";
import { HOTKEY_ACTIONS } from "@/ipc/types";
import type { HotkeyKind } from "@/ipc/types";
import { API_KEY_IDS, apiKeyInfo } from "@/lib/api-keys";
import { hotkeyAction, hotkeyHint, hotkeyLabel, type HotkeyActionId } from "@/lib/hotkeys";
import { PLATFORM, type Platform } from "@/lib/platform";
import { screenCopy, SCREEN_GROUPS, screenGroup, screenVisible, type ScreenId } from "./screens";
import { WINDOW_PAIRS } from "./window-pairs";

export interface SearchHit {
  id: string;
  title: string;
  hint: string;
  screen: ScreenId;
  tab: SettingsTabId | null;
  breadcrumb: string;
}

export interface SearchSources {
  presets: { id: string; name: string }[];
  quickActions: { id: string; title: string }[];
  contextDocs: { id: string; name: string }[];
}

interface SettingsRow {
  title: string;
  hint: string;
  tab: SettingsTabId;
}

const HIT_ID_SEPARATOR = ":";

const SCREEN_HIT = "screen";
const TAB_HIT = "tab";
const HOTKEY_HIT = "hotkey";
const SETTING_HIT = "setting";
const PERMISSION_HIT = "permission";
const PRESET_HIT = "preset";
const QUICK_ACTION_HIT = "quickAction";
const CONTEXT_DOC_HIT = "contextDoc";

const SETTINGS_SCREEN: ScreenId = "settings";
const PRESETS_SCREEN: ScreenId = "presets";
const PERMISSIONS_SCREEN: ScreenId = "permissions";
const CONTEXTS_SCREEN: ScreenId = "contexts";
const QUICK_ACTIONS_TAB: SettingsTabId = "quick-actions";
const QUICK_ACTION: HotkeyActionId = "quick_action";
const ACCESS_TAB: SettingsTabId = "access";
const WINDOW_TAB: SettingsTabId = "window";

const TAB_BY_HOTKEY_KIND: Record<HotkeyKind, SettingsTabId> = {
  combo: "hotkeys",
  modifier_arrows: "window",
  modifier_plus_minus: "window",
  modifier_digits: "quick-actions",
};

const HOTKEYS_WITHOUT_SETTINGS_ROW: ReadonlySet<HotkeyActionId> = new Set(["opacity"]);

const RANK_TITLE_PREFIX = 0;
const RANK_TITLE_INSIDE = 1;
const RANK_HINT = 2;

function hitId(kind: string, key: string): string {
  return [kind, key].join(HIT_ID_SEPARATOR);
}

function breadcrumbOf(screen: ScreenId, tab: SettingsTabId | null, dict: Dictionary): string {
  const label = screenCopy(screen, dict).label;
  if (tab === null) return label;
  return [label, dict.settings.tabs[tab].label].join(dict.launcher.search.breadcrumbSeparator);
}

function screenHits(dict: Dictionary, platform: Platform): SearchHit[] {
  return SCREEN_GROUPS.flatMap((group) =>
    screenGroup(group, platform).map((screen) => {
      const copy = screenCopy(screen.id, dict);
      return {
        id: hitId(SCREEN_HIT, screen.id),
        title: copy.label,
        hint: copy.description,
        screen: screen.id,
        tab: null,
        breadcrumb: breadcrumbOf(screen.id, null, dict),
      };
    }),
  );
}

function hotkeyHits(dict: Dictionary): SearchHit[] {
  return HOTKEY_ACTIONS.filter((action) => !HOTKEYS_WITHOUT_SETTINGS_ROW.has(action.id)).map(
    (action) => {
      const tab = TAB_BY_HOTKEY_KIND[action.kind];
      return {
        id: hitId(HOTKEY_HIT, action.id),
        title: hotkeyLabel(action, dict),
        hint: hotkeyHint(action, dict),
        screen: SETTINGS_SCREEN,
        tab,
        breadcrumb: breadcrumbOf(SETTINGS_SCREEN, tab, dict),
      };
    },
  );
}

function tabHits(dict: Dictionary): SearchHit[] {
  return SETTINGS_TABS.map((tab) => {
    const copy = dict.settings.tabs[tab.id];
    return {
      id: hitId(TAB_HIT, tab.id),
      title: copy.label,
      hint: copy.description,
      screen: SETTINGS_SCREEN,
      tab: tab.id,
      breadcrumb: breadcrumbOf(SETTINGS_SCREEN, tab.id, dict),
    };
  });
}

function permissionHits(dict: Dictionary, platform: Platform): SearchHit[] {
  if (!screenVisible(PERMISSIONS_SCREEN, platform)) return [];
  return PERMISSION_ROWS.map((row) => {
    const copy = permissionRowCopy(row.kind, dict);
    return {
      id: hitId(PERMISSION_HIT, row.kind),
      title: copy.title,
      hint: copy.purpose,
      screen: PERMISSIONS_SCREEN,
      tab: null,
      breadcrumb: breadcrumbOf(PERMISSIONS_SCREEN, null, dict),
    };
  });
}

function contextDocHits(contextDocs: SearchSources["contextDocs"], dict: Dictionary): SearchHit[] {
  const hint = screenCopy(CONTEXTS_SCREEN, dict).description;
  return contextDocs
    .filter((doc) => doc.name.trim() !== "")
    .map((doc) => ({
      id: hitId(CONTEXT_DOC_HIT, doc.id),
      title: doc.name,
      hint,
      screen: CONTEXTS_SCREEN,
      tab: null,
      breadcrumb: breadcrumbOf(CONTEXTS_SCREEN, null, dict),
    }));
}

/**
 * The rows the registry does NOT cover — the access tab's own controls, whose
 * "field" is a form rather than a value. Everything else comes from
 * `SETTINGS_ENTRIES`, which is what the sections render.
 */
function accessRows(dict: Dictionary): SettingsRow[] {
  const copy = dict.settings.apiKeys;
  return [
    { title: copy.accessCodeLabel, hint: copy.accessCodeHint, tab: ACCESS_TAB },
    { title: copy.accessCodeActiveLabel, hint: copy.accessCodeActiveHint, tab: ACCESS_TAB },
    { title: copy.replayLabel, hint: copy.replayHint, tab: ACCESS_TAB },
  ];
}

function apiKeyRows(dict: Dictionary): SettingsRow[] {
  const copy = dict.settings.apiKeys;
  return API_KEY_IDS.map((id): SettingsRow => {
    const purpose = dict.common.apiKeys.purpose[id];
    return {
      title: format(copy.keyLabel, { name: apiKeyInfo(id).name }),
      hint: format(copy.keyPurpose, { purpose }),
      tab: ACCESS_TAB,
    };
  });
}

function windowStepRows(dict: Dictionary): SettingsRow[] {
  return WINDOW_PAIRS.map(({ action }): SettingsRow => {
    const label = hotkeyLabel(hotkeyAction(action), dict);
    return {
      title: format(dict.launcher.search.windowStepTitle, { action: label }),
      hint: dict.launcher.window.pairs[action],
      tab: WINDOW_TAB,
    };
  });
}

function quickActionComboRow(dict: Dictionary): SettingsRow {
  return {
    title: dict.launcher.quickActions.comboLabel,
    hint: hotkeyHint(hotkeyAction(QUICK_ACTION), dict),
    tab: QUICK_ACTIONS_TAB,
  };
}

function registryRows(dict: Dictionary): SettingsRow[] {
  return SETTINGS_ENTRIES.map((entry) => ({
    title: dict.settings.entries[entry.id].label,
    hint: dict.settings.entries[entry.id].hint,
    tab: entry.tab,
  }));
}

function settingsRowHits(dict: Dictionary): SearchHit[] {
  return [
    ...registryRows(dict),
    ...accessRows(dict),
    quickActionComboRow(dict),
    ...apiKeyRows(dict),
    ...windowStepRows(dict),
  ].map((row) => ({
    id: hitId(SETTING_HIT, [row.tab, row.title].join(HIT_ID_SEPARATOR)),
    title: row.title,
    hint: row.hint,
    screen: SETTINGS_SCREEN,
    tab: row.tab,
    breadcrumb: breadcrumbOf(SETTINGS_SCREEN, row.tab, dict),
  }));
}

function presetHits(presets: SearchSources["presets"], dict: Dictionary): SearchHit[] {
  const hint = screenCopy(PRESETS_SCREEN, dict).description;
  return presets
    .filter((preset) => preset.name.trim() !== "")
    .map((preset) => ({
      id: hitId(PRESET_HIT, preset.id),
      title: preset.name,
      hint,
      screen: PRESETS_SCREEN,
      tab: null,
      breadcrumb: breadcrumbOf(PRESETS_SCREEN, null, dict),
    }));
}

function quickActionHits(
  quickActions: SearchSources["quickActions"],
  dict: Dictionary,
): SearchHit[] {
  const hint = dict.launcher.quickActions.description;
  return quickActions
    .filter((action) => action.title.trim() !== "")
    .map((action) => ({
      id: hitId(QUICK_ACTION_HIT, action.id),
      title: action.title,
      hint,
      screen: SETTINGS_SCREEN,
      tab: QUICK_ACTIONS_TAB,
      breadcrumb: breadcrumbOf(SETTINGS_SCREEN, QUICK_ACTIONS_TAB, dict),
    }));
}

/** A hit plus the two case-folded strings a query is actually matched against. */
interface IndexedHit {
  hit: SearchHit;
  foldedTitle: string;
  foldedHint: string;
}

export interface LauncherIndex {
  locale: Locale;
  entries: IndexedHit[];
}

function folded(text: string, locale: Locale): string {
  return text.toLocaleLowerCase(locale);
}

/**
 * The whole index, and a pure function of its arguments: the dictionary arrives
 * as a parameter rather than through `getDict()` so the tests can walk both
 * locales — an untranslated hit is caught by running the same case twice.
 *
 * Nothing in here depends on the query, and none of it is cheap: every hit costs
 * a breadcrumb (dictionary lookups plus a join) and two passes through
 * `toLocaleLowerCase`, the ICU path. It is therefore built ONCE per
 * `(sources, dict, platform)` and handed to `searchIndex` on every keystroke.
 */
export function launcherIndex(
  sources: SearchSources,
  dict: Dictionary,
  platform: Platform = PLATFORM,
): LauncherIndex {
  const hits = [
    ...screenHits(dict, platform),
    ...tabHits(dict),
    ...hotkeyHits(dict),
    ...settingsRowHits(dict),
    ...permissionHits(dict, platform),
    ...presetHits(sources.presets, dict),
    ...quickActionHits(sources.quickActions, dict),
    ...contextDocHits(sources.contextDocs, dict),
  ];
  return {
    locale: dict.locale,
    entries: hits.map((hit) => ({
      hit,
      foldedTitle: folded(hit.title, dict.locale),
      foldedHint: folded(hit.hint, dict.locale),
    })),
  };
}

function rankOf(entry: IndexedHit, needle: string): number | null {
  if (entry.foldedTitle.startsWith(needle)) return RANK_TITLE_PREFIX;
  if (entry.foldedTitle.includes(needle)) return RANK_TITLE_INSIDE;
  if (entry.foldedHint.includes(needle)) return RANK_HINT;
  return null;
}

/** The per-keystroke half: it walks a prebuilt index and never rebuilds one. */
export function searchIndex(query: string, index: LauncherIndex): SearchHit[] {
  const needle = folded(query.trim(), index.locale);
  if (needle === "") return [];
  const ranked: { hit: SearchHit; rank: number }[] = [];
  for (const entry of index.entries) {
    const rank = rankOf(entry, needle);
    if (rank !== null) ranked.push({ hit: entry.hit, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((entry) => entry.hit);
}

/** Index and search in one call — a pure function of its arguments, as before. */
export function searchLauncher(
  query: string,
  sources: SearchSources,
  dict: Dictionary,
  platform: Platform = PLATFORM,
): SearchHit[] {
  return searchIndex(query, launcherIndex(sources, dict, platform));
}
