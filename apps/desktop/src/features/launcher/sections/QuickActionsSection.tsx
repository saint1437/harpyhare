import { Plus, Trash2 } from "lucide-react";
import { memo, useCallback } from "react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SectionProps } from "@/features/settings/contract";
import { SettingGroup, SettingRow, SettingSelect } from "@/features/settings/fields";
import { settingsEntry } from "@/features/settings/settings-registry";
import { SettingEntryRow } from "@/features/settings/SettingsRows";
import { useDict } from "@/hooks/useDict";
import { useLatestRef } from "@/hooks/useLatestRef";
import { format } from "@/i18n";
import { MODIFIER_COMBOS, QUICK_ACTION_LIMIT } from "@/ipc/types";
import type { QuickAction } from "@/ipc/types";
import {
  effectiveCombo,
  formatCombo,
  hotkeyAction,
  hotkeyHint,
  hotkeyLabel,
  type HotkeyActionId,
} from "@/lib/hotkeys";
import { PLATFORM } from "@/lib/platform";
import { filledQuickActions, newQuickAction, quickActionHint } from "@/lib/quick-actions";
import { useHotkeyEditor } from "../useHotkeyEditor";
import { StolenNote } from "./HotkeysSection";

const QUICK_ACTION: HotkeyActionId = "quick_action";
const PLATFORM_MODIFIERS: readonly string[] = MODIFIER_COMBOS[PLATFORM];
const PROMPT_ROWS = 2;

const ATTACHMENTS_ENTRY = settingsEntry("quick_action_attachments");

function comboByActionId(actions: QuickAction[], modifier: string): Map<string, string> {
  const combos = new Map<string, string>();
  filledQuickActions(actions).forEach((action, index) => {
    const hint = quickActionHint(modifier, index);
    if (hint !== null) combos.set(action.id, hint);
  });
  return combos;
}

/**
 * The row takes its index and two callbacks shared by the whole list rather than
 * a closure of its own: a keystroke here rebuilds `quick_actions` and with it the
 * launcher's whole draft, and per-row closures would re-render every other row's
 * input and textarea at typing speed.
 */
const QuickActionRow = memo(function QuickActionRow({
  action,
  combo,
  index,
  onChange,
  onRemove,
}: {
  action: QuickAction;
  combo: string;
  index: number;
  onChange: (index: number, patch: Partial<QuickAction>) => void;
  onRemove: (index: number) => void;
}) {
  const copy = useDict().launcher.quickActions;
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Input
          aria-label={copy.titleLabel}
          placeholder={copy.titlePlaceholder}
          value={action.title}
          onChange={(e) => {
            onChange(index, { title: e.target.value });
          }}
        />
        <span className="min-w-10 shrink-0 text-right font-mono text-caption text-fg-subtle tabular-nums">
          {combo}
        </span>
        <IconButton
          title={copy.remove}
          className="hover:text-danger"
          onClick={() => {
            onRemove(index);
          }}
        >
          <Trash2 />
        </IconButton>
      </div>
      <Textarea
        rows={PROMPT_ROWS}
        aria-label={copy.promptLabel}
        placeholder={copy.promptPlaceholder}
        value={action.prompt}
        onChange={(e) => {
          onChange(index, { prompt: e.target.value });
        }}
        className="max-h-64 overflow-y-auto"
      />
    </div>
  );
});

export function QuickActionsSection({ draft, set }: SectionProps) {
  const dict = useDict();
  const copy = dict.launcher.quickActions;
  const editor = useHotkeyEditor(draft, set);
  const action = hotkeyAction(QUICK_ACTION);
  const modifier = effectiveCombo(draft.hotkeys, QUICK_ACTION);
  const actions = draft.quick_actions;
  const combos = comboByActionId(actions, modifier);
  const atLimit = actions.length >= QUICK_ACTION_LIMIT;

  // Stable across a keystroke: the list is read through a ref so the callbacks do
  // not have to be rebuilt every time one of its titles changes.
  const actionsRef = useLatestRef(actions);
  const updateAt = useCallback(
    (index: number, patch: Partial<QuickAction>) => {
      set(
        "quick_actions",
        actionsRef.current.map((a, i) => (i === index ? { ...a, ...patch } : a)),
      );
    },
    [set, actionsRef],
  );
  const removeAt = useCallback(
    (index: number) => {
      set(
        "quick_actions",
        actionsRef.current.filter((_, i) => i !== index),
      );
    },
    [set, actionsRef],
  );
  const add = useCallback(() => {
    set("quick_actions", [...actionsRef.current, newQuickAction()]);
  }, [set, actionsRef]);

  return (
    <SettingGroup title={copy.title} description={copy.description}>
      <SettingRow label={copy.comboLabel} hint={hotkeyHint(action, dict)}>
        <SettingSelect
          ariaLabel={format(copy.comboAriaLabel, {
            action: hotkeyLabel(action, dict),
            field: copy.comboLabel.toLocaleLowerCase(dict.locale),
          })}
          value={modifier}
          onValueChange={(v) => {
            editor.onAssign(QUICK_ACTION, v);
          }}
        >
          {PLATFORM_MODIFIERS.map((m) => (
            <SelectItem key={m} value={m}>
              {format(copy.comboOption, { combo: formatCombo(m) })}
            </SelectItem>
          ))}
        </SettingSelect>
      </SettingRow>
      <StolenNote editor={editor} />

      <SettingEntryRow entry={ATTACHMENTS_ENTRY} draft={draft} set={set} />

      {actions.length === 0 && (
        <p className="px-3 py-2.5 text-caption text-fg-subtle">{copy.empty}</p>
      )}
      {actions.map((quickAction, index) => (
        <QuickActionRow
          key={quickAction.id}
          action={quickAction}
          combo={combos.get(quickAction.id) ?? ""}
          index={index}
          onChange={updateAt}
          onRemove={removeAt}
        />
      ))}
      <div className="flex items-center gap-3 px-3 py-2">
        <Button variant="ghost" size="sm" disabled={atLimit} onClick={add}>
          <Plus />
          {dict.common.actions.add}
        </Button>
        {atLimit && (
          <span className="text-caption text-fg-subtle">
            {format(copy.atLimit, { limit: String(QUICK_ACTION_LIMIT) })}
          </span>
        )}
      </div>
    </SettingGroup>
  );
}
