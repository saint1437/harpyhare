import { Plus, Trash2 } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MODIFIER_COMBOS, QUICK_ACTION_LIMIT } from "@/ipc/bindings";
import type { QuickAction } from "@/ipc/types";
import { effectiveCombo, formatCombo, hotkeyAction, type HotkeyActionId } from "@/lib/hotkeys";
import { PLATFORM } from "@/lib/platform";
import { filledQuickActions, newQuickAction, quickActionHint } from "@/lib/quick-actions";
import type { SectionProps } from "../contract";
import { SettingGroup, SettingRow, SettingSelect, SettingSwitch } from "../fields";
import { useHotkeyEditor } from "../useHotkeyEditor";
import { StolenNote } from "./HotkeysSection";

const QUICK_ACTION: HotkeyActionId = "quick_action";
const PLATFORM_MODIFIERS: readonly string[] = MODIFIER_COMBOS[PLATFORM];
const PROMPT_ROWS = 3;

const COMBO_LABEL = "Сочетание";
const ATTACHMENTS_LABEL = "Прикреплять вложения";
const ATTACHMENTS_HINT =
  "Быстрое действие отправит картинки из поля ввода вместе с заготовленным промптом.";
const TITLE_LABEL = "Название";
const TITLE_PLACEHOLDER = "Название — его видно на кнопке, в чат оно не уходит";
const PROMPT_LABEL = "Промпт";
const PROMPT_PLACEHOLDER = "Промпт — именно он уходит в чат вместо названия";
const REMOVE_TITLE = "Удалить быстрое действие";
const ADD_LABEL = "Добавить";
const EMPTY_NOTE = "Пока ни одного действия — кнопок над полем ввода не будет.";
const GROUP_TITLE = "Быстрые действия";

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
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label={TITLE_LABEL}
          placeholder={TITLE_PLACEHOLDER}
          value={action.title}
          onChange={(e) => {
            onChange({ title: e.target.value });
          }}
        />
        <span className="min-w-10 shrink-0 text-right font-mono text-caption text-muted-foreground tabular-nums">
          {combo}
        </span>
        <IconButton title={REMOVE_TITLE} className="hover:text-destructive" onClick={onRemove}>
          <Trash2 />
        </IconButton>
      </div>
      <Textarea
        rows={PROMPT_ROWS}
        aria-label={PROMPT_LABEL}
        placeholder={PROMPT_PLACEHOLDER}
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
    <SettingGroup
      title={GROUP_TITLE}
      description="Кнопки над полем ввода: каждая отправляет в чат свой заготовленный промпт."
    >
      <SettingRow label={COMBO_LABEL} hint={action.hint}>
        <SettingSelect
          ariaLabel={`${action.label}: ${COMBO_LABEL.toLowerCase()}`}
          value={modifier}
          onValueChange={(v) => {
            editor.onAssign(QUICK_ACTION, v);
          }}
        >
          {PLATFORM_MODIFIERS.map((m) => (
            <SelectItem key={m} value={m}>
              {formatCombo(m)} + цифра
            </SelectItem>
          ))}
        </SettingSelect>
      </SettingRow>
      <StolenNote editor={editor} />

      <SettingRow label={ATTACHMENTS_LABEL} hint={ATTACHMENTS_HINT}>
        <SettingSwitch
          ariaLabel={ATTACHMENTS_LABEL}
          checked={draft.quick_action_attachments}
          onCheckedChange={(v) => {
            set("quick_action_attachments", v);
          }}
        />
      </SettingRow>

      {actions.length === 0 && (
        <p className="px-4 py-3 text-caption text-muted-foreground">{EMPTY_NOTE}</p>
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
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Button variant="ghost" size="sm" disabled={atLimit} onClick={add}>
          <Plus />
          {ADD_LABEL}
        </Button>
        {atLimit && (
          <span className="text-caption text-muted-foreground">
            Больше не поместится: цифр всего {QUICK_ACTION_LIMIT}.
          </span>
        )}
      </div>
    </SettingGroup>
  );
}
