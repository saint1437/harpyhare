import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { SETTINGS_LIMITS } from "@/ipc/bindings";
import { formatCombo } from "@/lib/hotkeys";
import { applyTheme, THEME_BLACK, THEME_GRAY } from "@/lib/window-controls";
import type { SectionProps } from "../contract";
import { Field, SectionColumns, SelectField } from "../fields";

const CHAT_FONT_SIZE_STEP = 0.5;
const WINDOW_OPACITY_STEP = 0.05;

const PERCENT_SCALE = 100;

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * PERCENT_SCALE)}%`;
}

function StepField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
      />
    </Field>
  );
}

export function AppearanceSection({ draft, set }: SectionProps) {
  return (
    <SectionColumns>
      <SelectField
        label="Тема"
        value={draft.theme === THEME_BLACK ? THEME_BLACK : THEME_GRAY}
        onValueChange={(v) => {
          set("theme", v);
          applyTheme(document.documentElement, v);
        }}
      >
        <SelectItem value={THEME_GRAY}>Серая (светлее)</SelectItem>
        <SelectItem value={THEME_BLACK}>Чёрная (темнее)</SelectItem>
      </SelectField>
      <Field label={`Размер шрифта чата — ${draft.chat_font_size}px`}>
        <Slider
          min={SETTINGS_LIMITS.chatFontSize.min}
          max={SETTINGS_LIMITS.chatFontSize.max}
          step={CHAT_FONT_SIZE_STEP}
          value={[draft.chat_font_size]}
          onValueChange={([v]) => {
            if (v === undefined) return;
            set("chat_font_size", v);
          }}
        />
      </Field>
      <Field label={`Прозрачность окна — ${formatPercent(draft.window_opacity)}`}>
        <Slider
          min={SETTINGS_LIMITS.windowOpacity.min}
          max={SETTINGS_LIMITS.windowOpacity.max}
          step={WINDOW_OPACITY_STEP}
          value={[draft.window_opacity]}
          onValueChange={([v]) => {
            if (v === undefined) return;
            set("window_opacity", v);
          }}
        />
      </Field>
      <StepField
        label={`Шаг перемещения (${formatCombo(draft.move_modifier)}+стрелки), px`}
        min={SETTINGS_LIMITS.moveStep.min}
        max={SETTINGS_LIMITS.moveStep.max}
        value={draft.move_step}
        onChange={(v) => {
          set("move_step", v);
        }}
      />
      <StepField
        label={`Шаг изменения размера (${formatCombo(draft.resize_modifier)}+стрелки), px`}
        min={SETTINGS_LIMITS.resizeStep.min}
        max={SETTINGS_LIMITS.resizeStep.max}
        value={draft.resize_step}
        onChange={(v) => {
          set("resize_step", v);
        }}
      />
      <StepField
        label={`Шаг скролла чата (${formatCombo(draft.scroll_modifier)}+стрелки), px`}
        min={SETTINGS_LIMITS.scrollStep.min}
        max={SETTINGS_LIMITS.scrollStep.max}
        value={draft.scroll_step}
        onChange={(v) => {
          set("scroll_step", v);
        }}
      />
    </SectionColumns>
  );
}
