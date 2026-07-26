import { RotateCcw } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { HOTKEY_ACTIONS } from "@/ipc/bindings";
import { effectiveCombo, formatCombo, hotkeyAction, type HotkeyAction } from "@/lib/hotkeys";
import type { SectionProps } from "../contract";
import { SettingGroup, SettingRow } from "../fields";
import { HotkeyCapture } from "../HotkeyCapture";
import { useHotkeyEditor, type HotkeyEditor } from "../useHotkeyEditor";

const UNASSIGNED_HINT = "Не назначен — действие сейчас недоступно.";
const GLOBAL_GROUP_HINT = "Глобальные сочетания — работают, пока запущено основное окно.";

export function HotkeyRow({ action, editor }: { action: HotkeyAction; editor: HotkeyEditor }) {
  const combo = effectiveCombo(editor.bindings, action.id);
  const isDefault = combo === action.defaultCombo;
  return (
    <SettingRow label={action.label} hint={combo.trim() === "" ? UNASSIGNED_HINT : action.hint}>
      <div className="flex w-full items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <HotkeyCapture
            value={combo}
            onChange={(next) => {
              editor.onAssign(action.id, next);
            }}
          />
        </div>
        <IconButton
          title={`Вернуть ${formatCombo(action.defaultCombo)}`}
          disabled={isDefault}
          className={isDefault ? "invisible" : undefined}
          onClick={() => {
            editor.onReset(action.id);
          }}
        >
          <RotateCcw />
        </IconButton>
      </div>
    </SettingRow>
  );
}

export function StolenNote({ editor, group }: { editor: HotkeyEditor; group: string }) {
  if (editor.stolen === null) return null;
  const victim = hotkeyAction(editor.stolen.from);
  if (victim.group !== group) return null;
  return (
    <p className="px-4 pb-3 text-caption text-muted-foreground">
      {formatCombo(editor.stolen.combo)} снят у действия «{victim.label}» — оно осталось без хоткея.
    </p>
  );
}

export function HotkeysSection({ draft, set }: SectionProps) {
  const editor = useHotkeyEditor(draft, set);
  const comboActions = HOTKEY_ACTIONS.filter((a) => a.kind === "combo");
  const groups = comboActions
    .map((a) => a.group)
    .filter((group, index, all) => all.indexOf(group) === index);

  return (
    <>
      {groups.map((group) => (
        <SettingGroup
          key={group}
          title={group}
          description={group === "Запись" ? GLOBAL_GROUP_HINT : undefined}
        >
          {comboActions
            .filter((a) => a.group === group)
            .map((action) => (
              <HotkeyRow key={action.id} action={action} editor={editor} />
            ))}
          <StolenNote editor={editor} group={group} />
        </SettingGroup>
      ))}
    </>
  );
}
