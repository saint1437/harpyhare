import { Plus, Trash2 } from "lucide-react";
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

function QuickActionRow({
  action,
  combo,
  onChange,
  onRemove,
}: {
  action: QuickAction;
  combo: string;
  onChange: (patch: Partial<QuickAction>) => void;
  onRemove: () => void;
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
            onChange({ title: e.target.value });
          }}
        />
        <span className="min-w-10 shrink-0 text-right font-mono text-caption text-fg-subtle tabular-nums">
          {combo}
        </span>
        <IconButton title={copy.remove} className="hover:text-danger" onClick={onRemove}>
          <Trash2 />
        </IconButton>
      </div>
      <Textarea
        rows={PROMPT_ROWS}
        aria-label={copy.promptLabel}
        placeholder={copy.promptPlaceholder}
        value={action.prompt}
        onChange={(e) => {
          onChange({ prompt: e.target.value });
        }}
        className="max-h-64 overflow-y-auto"
      />
    </div>
  );
}

export function QuickActionsSection({ draft, set }: SectionProps) {
  const dict = useDict();
  const copy = dict.launcher.quickActions;
  const editor = useHotkeyEditor(draft, set);
  const action = hotkeyAction(QUICK_ACTION);
  const modifier = effectiveCombo(draft.hotkeys, QUICK_ACTION);
  const actions = draft.quick_actions;
  const combos = comboByActionId(actions, modifier);
  const atLimit = actions.length >= QUICK_ACTION_LIMIT;

  const updateAt = (index: number, patch: Partial<QuickAction>) => {
    set(
      "quick_actions",
      actions.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  };
  const removeAt = (index: number) => {
    set(
      "quick_actions",
      actions.filter((_, i) => i !== index),
    );
  };
  const add = () => {
    set("quick_actions", [...actions, newQuickAction()]);
  };

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
          onChange={(patch) => {
            updateAt(index, patch);
          }}
          onRemove={() => {
            removeAt(index);
          }}
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
