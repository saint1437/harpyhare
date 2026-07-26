import { SelectItem } from "@/components/ui/select";
import { MODIFIER_COMBOS } from "@/ipc/bindings";
import { formatCombo } from "@/lib/hotkeys";
import type { SectionProps } from "../contract";
import { Field, SectionColumns, SelectField } from "../fields";
import { HotkeyCapture } from "../HotkeyCapture";

function ModifierField({
  label,
  value,
  takenByOthers,
  onChange,
}: {
  label: string;
  value: string;
  takenByOthers: string[];
  onChange: (value: string) => void;
}) {
  return (
    <SelectField label={label} value={value} onValueChange={onChange}>
      {MODIFIER_COMBOS.filter((m) => m === value || !takenByOthers.includes(m)).map((m) => (
        <SelectItem key={m} value={m}>
          {formatCombo(m)} + стрелки
        </SelectItem>
      ))}
    </SelectField>
  );
}

export function HotkeysSection({ draft, set }: SectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <SectionColumns>
        <Field label="Push-to-talk клавиша">
          <HotkeyCapture
            value={draft.hotkey}
            onChange={(hk) => {
              set("hotkey", hk);
            }}
          />
        </Field>
        <Field label="Скрыть/показать окно">
          <HotkeyCapture
            value={draft.toggle_hotkey}
            onChange={(hk) => {
              set("toggle_hotkey", hk);
            }}
          />
        </Field>
        <Field label="Суфлёр">
          <HotkeyCapture
            value={draft.teleprompter_hotkey}
            onChange={(hk) => {
              set("teleprompter_hotkey", hk);
            }}
          />
        </Field>
        <Field label="Снимок области экрана">
          <HotkeyCapture
            value={draft.screenshot_hotkey}
            onChange={(hk) => {
              set("screenshot_hotkey", hk);
            }}
          />
        </Field>
      </SectionColumns>

      <SectionColumns>
        <ModifierField
          label="Перемещение окна"
          value={draft.move_modifier}
          takenByOthers={[draft.resize_modifier, draft.scroll_modifier]}
          onChange={(v) => {
            set("move_modifier", v);
          }}
        />
        <ModifierField
          label="Изменение размера окна"
          value={draft.resize_modifier}
          takenByOthers={[draft.move_modifier, draft.scroll_modifier]}
          onChange={(v) => {
            set("resize_modifier", v);
          }}
        />
        <ModifierField
          label="Скролл чата"
          value={draft.scroll_modifier}
          takenByOthers={[draft.move_modifier, draft.resize_modifier]}
          onChange={(v) => {
            set("scroll_modifier", v);
          }}
        />
      </SectionColumns>
    </div>
  );
}
