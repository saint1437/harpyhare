import { SelectItem } from "@/components/ui/select";
import type { SectionProps } from "@/features/settings/contract";
import {
  SettingBlock,
  SettingGroup,
  SettingSelect,
  SettingSlider,
} from "@/features/settings/fields";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import { MODIFIER_COMBOS } from "@/ipc/types";
import { effectiveCombo, formatCombo, hotkeyAction, hotkeyLabel } from "@/lib/hotkeys";
import { PLATFORM } from "@/lib/platform";
import { useHotkeyEditor } from "../useHotkeyEditor";
import { WINDOW_PAIRS } from "../window-pairs";
import { StolenNote } from "./HotkeysSection";

const STEP_GRANULARITY = 5;
const PLATFORM_MODIFIERS: readonly string[] = MODIFIER_COMBOS[PLATFORM];

export function WindowSection({ draft, set }: SectionProps) {
  const dict = useDict();
  const copy = dict.launcher.window;
  const editor = useHotkeyEditor(draft, set);

  return (
    <SettingGroup title={copy.title} description={copy.description}>
      {WINDOW_PAIRS.map((pair) => {
        const label = hotkeyLabel(hotkeyAction(pair.action), dict);
        const combo = effectiveCombo(draft.hotkeys, pair.action);
        const taken = WINDOW_PAIRS.filter((p) => p.action !== pair.action).map((p) =>
          effectiveCombo(draft.hotkeys, p.action),
        );
        return (
          <SettingBlock key={pair.action} label={label} hint={copy.pairs[pair.action]}>
            <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-4">
              <SettingSelect
                ariaLabel={format(copy.modifierAriaLabel, { action: label })}
                value={combo}
                onValueChange={(v) => {
                  editor.onAssign(pair.action, v);
                }}
              >
                {PLATFORM_MODIFIERS.filter((m) => m === combo || !taken.includes(m)).map((m) => (
                  <SelectItem key={m} value={m}>
                    {format(copy.modifierOption, { combo: formatCombo(m) })}
                  </SelectItem>
                ))}
              </SettingSelect>
              <SettingSlider
                ariaLabel={format(copy.stepAriaLabel, { action: label })}
                value={draft[pair.stepKey]}
                min={pair.limits.min}
                max={pair.limits.max}
                step={STEP_GRANULARITY}
                readout={format(dict.settings.readouts.pixels, {
                  value: String(draft[pair.stepKey]),
                })}
                onChange={(v) => {
                  set(pair.stepKey, v);
                }}
              />
            </div>
          </SettingBlock>
        );
      })}
      <StolenNote editor={editor} />
    </SettingGroup>
  );
}
