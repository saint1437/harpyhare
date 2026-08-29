import {
  AppWindow,
  KeyRound,
  Keyboard,
  Mic,
  Palette,
  Plus,
  Trash2,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { SettingRowCopy, SettingsTabId } from "@/i18n/demo-types";
import { cn } from "@/lib/cn";
import { format } from "@/lib/format";
import { useCopy } from "./copy";
import {
  AppButton,
  AppSelect,
  AppSlider,
  AppSwitch,
  SettingBlock,
  SettingGroup,
  SettingRow,
} from "./ui";
import type { SettingValue } from "./useDemoRun";

/**
 * Seven tabs, in the app's order — which is by task frequency, not alphabet.
 * The demo used to be one flat scroll of six groups, so the two things a new
 * user actually has to do (put a key in, pick a recording key) sat below four
 * screens of things they never touch.
 */
const TAB_ICONS: Record<SettingsTabId, LucideIcon> = {
  access: KeyRound,
  speech: Mic,
  hotkeys: Keyboard,
  "quick-actions": Zap,
  window: AppWindow,
  behavior: Workflow,
  appearance: Palette,
};

const TAB_ORDER: SettingsTabId[] = [
  "access",
  "speech",
  "hotkeys",
  "quick-actions",
  "window",
  "behavior",
  "appearance",
];

function Row({
  row,
  settings,
  onSetting,
}: {
  row: SettingRowCopy;
  settings: Record<string, SettingValue>;
  onSetting: (id: string, value: SettingValue) => void;
}) {
  const copy = useCopy().launcher.settings;
  const { control } = row;
  const disabled =
    row.disabledBy !== undefined && settings[row.disabledBy.row] === row.disabledBy.when;

  if (control.kind === "secret") {
    return (
      <SettingBlock label={row.label} hint={row.hint}>
        <div className="flex items-center gap-2">
          <input
            type="password"
            autoComplete="off"
            placeholder={control.stored ?? control.placeholder}
            aria-label={row.label}
            className="h-8 w-full min-w-0 rounded-md border border-app-border-strong bg-app-code px-2.5 py-1 text-app-body text-app-fg transition-colors outline-none placeholder:text-app-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid"
          />
          <AppButton size="sm" aria-label={`${copy.saveKey} — ${row.label}`}>
            {copy.saveKey}
          </AppButton>
          {control.stored !== null && (
            <AppButton variant="ghost" size="sm" aria-label={`${copy.deleteKey} — ${row.label}`}>
              {copy.deleteKey}
            </AppButton>
          )}
        </div>
      </SettingBlock>
    );
  }

  if (control.kind === "switch") {
    return (
      <SettingRow label={row.label} hint={row.hint} disabled={disabled}>
        <AppSwitch
          checked={settings[row.id] === true}
          ariaLabel={row.label}
          disabled={disabled}
          onChange={(value) => {
            onSetting(row.id, value);
          }}
        />
      </SettingRow>
    );
  }

  if (control.kind === "select") {
    const value = typeof settings[row.id] === "string" ? String(settings[row.id]) : control.value;
    return (
      <SettingRow label={row.label} hint={row.hint} disabled={disabled}>
        <AppSelect
          value={value}
          options={control.options}
          ariaLabel={row.label}
          disabled={disabled}
          onChange={(next) => {
            onSetting(row.id, next);
          }}
        />
      </SettingRow>
    );
  }

  if (control.kind === "slider") {
    const value = typeof settings[row.id] === "number" ? Number(settings[row.id]) : control.value;
    return (
      <SettingRow label={row.label} hint={row.hint} disabled={disabled}>
        <AppSlider
          value={value}
          min={control.min}
          max={control.max}
          step={control.step}
          ariaLabel={row.label}
          disabled={disabled}
          readout={format(control.unit, { value })}
          onChange={(next) => {
            onSetting(row.id, next);
          }}
        />
      </SettingRow>
    );
  }

  return null;
}

/**
 * The shortcuts tab is not registry-driven in the app either: it reads the
 * hotkey registry and renders one row per action that has a combo. Here the
 * capture control is a static chip rather than a live capture — the demo has no
 * business swallowing the visitor's keystrokes inside a page.
 */
function HotkeysTab() {
  const dict = useCopy();
  return (
    <>
      {dict.hotkeyGroups.map((group) => (
        <SettingGroup key={group.title} title={group.title}>
          {group.ids.map((id) => {
            const hotkey = dict.hotkeys.find((item) => item.id === id);
            if (hotkey === undefined) return null;
            return (
              <SettingRow key={id} label={hotkey.label} hint={hotkey.hint}>
                <span className="w-full truncate rounded-md border border-app-border-strong bg-app-code px-2.5 py-1 text-left font-mono text-app-caption text-app-fg">
                  {hotkey.combo}
                </span>
              </SettingRow>
            );
          })}
        </SettingGroup>
      ))}
    </>
  );
}

function QuickActionsTab({
  settings,
  onSetting,
}: {
  settings: Record<string, SettingValue>;
  onSetting: (id: string, value: SettingValue) => void;
}) {
  const dict = useCopy();
  const copy = dict.launcher.settings.quickActions;
  const modifier = (dict.hotkeys.find((item) => item.id === "quick_action")?.combo ?? "").split(
    " ",
  )[0];

  return (
    <SettingGroup title={copy.title} description={copy.description}>
      <SettingRow label={copy.modifierLabel} hint={copy.modifierHint}>
        <AppSelect
          value={format(copy.modifierOption, { combo: modifier ?? "" })}
          options={[format(copy.modifierOption, { combo: modifier ?? "" })]}
          ariaLabel={copy.modifierLabel}
          onChange={() => undefined}
        />
      </SettingRow>
      <SettingRow label={copy.attachLabel} hint={copy.attachHint}>
        <AppSwitch
          checked={settings["quick_action_attachments"] === true}
          ariaLabel={copy.attachLabel}
          onChange={(value) => {
            onSetting("quick_action_attachments", value);
          }}
        />
      </SettingRow>
      {copy.items.map((action, index) => (
        <div key={action.id} className="flex flex-col gap-1.5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              defaultValue={action.title}
              aria-label={copy.namePlaceholder}
              placeholder={copy.namePlaceholder}
              className="h-8 w-full min-w-0 rounded-md border border-app-border-strong bg-app-code px-2.5 py-1 text-app-body text-app-fg outline-none placeholder:text-app-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid"
            />
            <span className="min-w-10 shrink-0 text-right font-mono text-app-caption text-app-subtle tabular-nums">
              {modifier}
              {index + 1}
            </span>
            <AppButton
              variant="ghost"
              size="icon-xs"
              title={copy.remove}
              aria-label={copy.remove}
              className="hover:text-app-destructive"
            >
              <Trash2 />
            </AppButton>
          </div>
          <textarea
            rows={2}
            defaultValue={action.prompt}
            aria-label={copy.promptPlaceholder}
            placeholder={copy.promptPlaceholder}
            className="max-h-64 w-full resize-none overflow-y-auto rounded-md border border-app-border-strong bg-app-code px-2.5 py-1.5 text-app-body text-app-fg outline-none placeholder:text-app-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid"
          />
        </div>
      ))}
      <div className="flex items-center gap-3 px-3 py-2">
        <AppButton variant="ghost" size="sm">
          <Plus />
          {copy.add}
        </AppButton>
      </div>
    </SettingGroup>
  );
}

export function SettingsScreen({
  settings,
  onSetting,
}: {
  settings: Record<string, SettingValue>;
  onSetting: (id: string, value: SettingValue) => void;
}) {
  const copy = useCopy().launcher.settings;
  const [tab, setTab] = useState<SettingsTabId>("access");
  const current = copy.tabs[tab];

  return (
    <div className="flex min-w-0 gap-3 min-[900px]:gap-4">
      <div
        role="tablist"
        aria-orientation="vertical"
        className="sticky top-0 flex w-9 shrink-0 flex-col gap-0.5 self-start min-[900px]:w-30"
      >
        {TAB_ORDER.map((id) => {
          const Icon = TAB_ICONS[id];
          const isActive = id === tab;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={copy.tabs[id].label}
              onClick={() => {
                setTab(id);
              }}
              className={cn(
                "relative flex items-center justify-center gap-2 rounded-md px-0 py-1.5 text-left text-app-body whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid min-[900px]:justify-start min-[900px]:px-2",
                isActive
                  ? "bg-app-surface-active text-app-fg"
                  : "text-app-subtle hover:bg-app-card hover:text-app-fg active:bg-app-surface-active",
              )}
            >
              {isActive && (
                <span
                  className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-app-primary-mark"
                  aria-hidden
                />
              )}
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="hidden truncate min-[900px]:inline">{copy.tabs[id].label}</span>
            </button>
          );
        })}
      </div>

      <div key={tab} className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-app-caption text-app-subtle">{current.description}</p>
        {tab === "hotkeys" ? (
          <HotkeysTab />
        ) : tab === "quick-actions" ? (
          <QuickActionsTab settings={settings} onSetting={onSetting} />
        ) : (
          current.groups.map((group) => (
            <SettingGroup key={group.title} title={group.title} description={group.description}>
              {group.rows.map((row) => (
                <Row key={row.id} row={row} settings={settings} onSetting={onSetting} />
              ))}
            </SettingGroup>
          ))
        )}
        {tab === "access" && (
          <SettingGroup title={copy.accessCode.label} description={copy.accessCode.hint}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <input
                autoComplete="off"
                placeholder={copy.accessCode.placeholder}
                aria-label={copy.accessCode.label}
                className="h-8 w-full min-w-0 rounded-md border border-app-border-strong bg-app-code px-2.5 py-1 font-mono text-app-body text-app-fg outline-none placeholder:text-app-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid"
              />
              <AppButton size="sm">{copy.accessCode.submit}</AppButton>
            </div>
          </SettingGroup>
        )}
      </div>
    </div>
  );
}
