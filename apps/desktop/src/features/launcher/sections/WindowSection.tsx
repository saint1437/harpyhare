import { SelectItem } from "@/components/ui/select";
import { MODIFIER_COMBOS, SETTINGS_LIMITS } from "@/ipc/bindings";
import { effectiveCombo, formatCombo, hotkeyAction, type HotkeyActionId } from "@/lib/hotkeys";
import { PLATFORM } from "@/lib/platform";
import type { SectionProps } from "../contract";
import { SettingBlock, SettingGroup, SettingSelect, SettingSlider } from "../fields";
import { useHotkeyEditor } from "../useHotkeyEditor";
import { StolenNote } from "./HotkeysSection";

const PAIRS = [
  {
    action: "move_window",
    hint: "Модификатор со стрелками двигает окно, шаг — на сколько пикселей за нажатие.",
    stepKey: "move_step",
    limits: SETTINGS_LIMITS.moveStep,
  },
  {
    action: "resize_window",
    hint: "То же самое, но меняет ширину и высоту.",
    stepKey: "resize_step",
    limits: SETTINGS_LIMITS.resizeStep,
  },
  {
    action: "scroll_chat",
    hint: "Прокрутка переписки стрелками вверх и вниз.",
    stepKey: "scroll_step",
    limits: SETTINGS_LIMITS.scrollStep,
  },
] as const satisfies readonly {
  action: HotkeyActionId;
  hint: string;
  stepKey: keyof SectionProps["draft"];
  limits: { min: number; max: number };
}[];

const STEP_GRANULARITY = 5;
const PLATFORM_MODIFIERS: readonly string[] = MODIFIER_COMBOS[PLATFORM];

export function WindowSection({ draft, set }: SectionProps) {
  const editor = useHotkeyEditor(draft, set);

  return (
    <SettingGroup
      title="Модификаторы со стрелками"
      description="Модификатор и его шаг настраиваются вместе — они работают только в паре."
    >
      {PAIRS.map((pair) => {
        const action = hotkeyAction(pair.action);
        const combo = effectiveCombo(draft.hotkeys, pair.action);
        const taken = PAIRS.filter((p) => p.action !== pair.action).map((p) =>
          effectiveCombo(draft.hotkeys, p.action),
        );
        return (
          <SettingBlock key={pair.action} label={action.label} hint={pair.hint}>
            <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-4">
              <SettingSelect
                ariaLabel={`${action.label}: модификатор`}
                value={combo}
                onValueChange={(v) => {
                  editor.onAssign(pair.action, v);
                }}
              >
                {PLATFORM_MODIFIERS.filter((m) => m === combo || !taken.includes(m)).map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatCombo(m)} + стрелки
                  </SelectItem>
                ))}
              </SettingSelect>
              <SettingSlider
                ariaLabel={`${action.label}: шаг`}
                value={draft[pair.stepKey]}
                min={pair.limits.min}
                max={pair.limits.max}
                step={STEP_GRANULARITY}
                readout={`${String(draft[pair.stepKey])} px`}
                onChange={(v) => {
                  set(pair.stepKey, v);
                }}
              />
            </div>
          </SettingBlock>
        );
      })}
      <StolenNote editor={editor} group="Окно" />
      <StolenNote editor={editor} group="Чат" />
    </SettingGroup>
  );
}
