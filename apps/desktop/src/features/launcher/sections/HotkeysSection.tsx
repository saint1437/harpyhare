import { Info, RotateCcw } from "lucide-react";
import { memo } from "react";
import { IconButton } from "@/components/IconButton";
import type { SectionProps } from "@/features/settings/contract";
import { SettingGroup, SettingRow } from "@/features/settings/fields";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import type { HotkeyGroupKey } from "@/i18n/hotkeys-types";
import { HOTKEY_ACTIONS } from "@/ipc/types";
import {
  defaultCombo,
  effectiveCombo,
  formatCombo,
  hotkeyAction,
  hotkeyHint,
  hotkeyLabel,
  type HotkeyAction,
} from "@/lib/hotkeys";
import { HotkeyCapture } from "../HotkeyCapture";
import { useHotkeyEditor, type HotkeyEditor } from "../useHotkeyEditor";

export const HotkeyRow = memo(function HotkeyRow({
  action,
  editor,
}: {
  action: HotkeyAction;
  editor: HotkeyEditor;
}) {
  const dict = useDict();
  const combo = effectiveCombo(editor.bindings, action.id);
  const fallback = defaultCombo(action.id);
  const isDefault = combo === fallback;
  return (
    <SettingRow
      label={hotkeyLabel(action, dict)}
      hint={combo.trim() === "" ? dict.hotkeys.unassigned : hotkeyHint(action, dict)}
    >
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
          title={format(dict.launcher.hotkeys.reset, { combo: formatCombo(fallback) })}
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
});

/**
 * The note is rendered where the user ACTED, not where the victim lived — hence
 * the filter by the group of the action that TOOK the combination. The group is
 * matched by key, never by the printed title: two locales give it two titles.
 */
export function StolenNote({ editor, group }: { editor: HotkeyEditor; group?: HotkeyGroupKey }) {
  const dict = useDict();
  if (editor.stolen === null) return null;
  if (group !== undefined && hotkeyAction(editor.stolen.to).groupKey !== group) return null;
  const victim = hotkeyAction(editor.stolen.from);
  return (
    <div className="flex items-center gap-2 bg-surface px-3 py-2">
      <Info className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <p className="text-caption text-fg">
        {format(dict.launcher.hotkeys.stolen, {
          combo: formatCombo(editor.stolen.combo),
          action: hotkeyLabel(victim, dict),
        })}
      </p>
    </div>
  );
}

export function HotkeysSection({ draft, set }: SectionProps) {
  const dict = useDict();
  const editor = useHotkeyEditor(draft, set);
  const comboActions = HOTKEY_ACTIONS.filter((a) => a.kind === "combo");
  const groups = comboActions
    .map((a) => a.groupKey)
    .filter((group, index, all) => all.indexOf(group) === index);

  return (
    <>
      {groups.map((group) => (
        <SettingGroup key={group} title={dict.hotkeys.groups[group]}>
          {comboActions
            .filter((a) => a.groupKey === group)
            .map((action) => (
              <HotkeyRow key={action.id} action={action} editor={editor} />
            ))}
          <StolenNote editor={editor} group={group} />
        </SettingGroup>
      ))}
    </>
  );
}
