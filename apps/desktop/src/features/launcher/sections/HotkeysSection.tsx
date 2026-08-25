import { Info, RotateCcw } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { HOTKEY_ACTIONS } from "@/ipc/bindings";
import {
  defaultCombo,
  effectiveCombo,
  formatCombo,
  hotkeyAction,
  type HotkeyAction,
} from "@/lib/hotkeys";
import type { SectionProps } from "../contract";
import { SettingGroup, SettingRow } from "../fields";
import { HotkeyCapture } from "../HotkeyCapture";
import { useHotkeyEditor, type HotkeyEditor } from "../useHotkeyEditor";

const UNASSIGNED_HINT = "Не назначен — действие сейчас недоступно.";

export function HotkeyRow({ action, editor }: { action: HotkeyAction; editor: HotkeyEditor }) {
  const combo = effectiveCombo(editor.bindings, action.id);
  const fallback = defaultCombo(action.id);
  const isDefault = combo === fallback;
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
          title={`Вернуть ${formatCombo(fallback)}`}
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

export function StolenNote({ editor, group }: { editor: HotkeyEditor; group?: string }) {
  if (editor.stolen === null) return null;
  if (group !== undefined && hotkeyAction(editor.stolen.to).group !== group) return null;
  const victim = hotkeyAction(editor.stolen.from);
  return (
    <div className="flex items-center gap-2 bg-surface px-3 py-2">
      <Info className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <p className="text-caption text-fg">
        {formatCombo(editor.stolen.combo)} снят у действия «{victim.label}» — оно осталось без
        хоткея.
      </p>
    </div>
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
        <SettingGroup key={group} title={group}>
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
