import { SelectItem } from "@/components/ui/select";
import { MODIFIER_COMBOS, SETTINGS_LIMITS } from "@/ipc/bindings";
import { formatCombo } from "@/lib/hotkeys";
import type { SectionProps } from "../contract";
import { SettingBlock, SettingGroup, SettingSelect, SettingSlider } from "../fields";

const PAIRS = [
  {
    id: "move",
    label: "Перемещение окна",
    hint: "Модификатор со стрелками двигает окно, шаг — на сколько пикселей за нажатие.",
    modifierKey: "move_modifier",
    stepKey: "move_step",
    limits: SETTINGS_LIMITS.moveStep,
  },
  {
    id: "resize",
    label: "Размер окна",
    hint: "То же самое, но меняет ширину и высоту.",
    modifierKey: "resize_modifier",
    stepKey: "resize_step",
    limits: SETTINGS_LIMITS.resizeStep,
  },
  {
    id: "scroll",
    label: "Скролл чата",
    hint: "Прокрутка переписки стрелками.",
    modifierKey: "scroll_modifier",
    stepKey: "scroll_step",
    limits: SETTINGS_LIMITS.scrollStep,
  },
] as const;

const STEP_GRANULARITY = 5;

export function WindowSection({ draft, set }: SectionProps) {
  return (
    <SettingGroup
      title="Управление окном"
      description="Модификатор и его шаг настраиваются вместе — они работают только в паре."
    >
      {PAIRS.map((pair) => {
        const taken = PAIRS.filter((p) => p.id !== pair.id).map((p) => draft[p.modifierKey]);
        return (
          <SettingBlock key={pair.id} label={pair.label} hint={pair.hint}>
            <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-4">
              <SettingSelect
                ariaLabel={`${pair.label}: модификатор`}
                value={draft[pair.modifierKey]}
                onValueChange={(v) => {
                  set(pair.modifierKey, v);
                }}
              >
                {MODIFIER_COMBOS.filter(
                  (m) => m === draft[pair.modifierKey] || !taken.includes(m),
                ).map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatCombo(m)} + стрелки
                  </SelectItem>
                ))}
              </SettingSelect>
              <SettingSlider
                ariaLabel={`${pair.label}: шаг`}
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
    </SettingGroup>
  );
}
