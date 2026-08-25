import { SelectItem } from "@/components/ui/select";
import { SETTINGS_LIMITS } from "@/ipc/bindings";
import { applyTheme, THEMES, type Theme } from "@/lib/window-controls";
import type { SectionProps } from "../contract";
import { SettingGroup, SettingRow, SettingSelect, SettingSlider } from "../fields";

const CHAT_FONT_SIZE_STEP = 0.5;
const WINDOW_OPACITY_STEP = 0.05;
const PERCENT_SCALE = 100;

const THEME_LABEL: Record<Theme, string> = {
  system: "Как в системе",
  light: "Светлая",
  dark: "Тёмная",
};

function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

function formatPercent(fraction: number): string {
  return `${String(Math.round(fraction * PERCENT_SCALE))}%`;
}

export function AppearanceSection({ draft, set }: SectionProps) {
  return (
    <SettingGroup title="Вид" description="Оформление основного окна с чатом.">
      <SettingRow
        label="Тема"
        hint="«Как в системе» переключается вместе с оформлением macOS или Windows."
      >
        <SettingSelect
          ariaLabel="Тема"
          value={isTheme(draft.theme) ? draft.theme : THEMES[0]}
          onValueChange={(v) => {
            set("theme", v);
            applyTheme(document.documentElement, v);
          }}
        >
          {THEMES.map((theme) => (
            <SelectItem key={theme} value={theme}>
              {THEME_LABEL[theme]}
            </SelectItem>
          ))}
        </SettingSelect>
      </SettingRow>
      <SettingRow label="Размер шрифта чата" hint="Влияет на текст переписки и код в ответах.">
        <SettingSlider
          ariaLabel="Размер шрифта чата"
          value={draft.chat_font_size}
          min={SETTINGS_LIMITS.chatFontSize.min}
          max={SETTINGS_LIMITS.chatFontSize.max}
          step={CHAT_FONT_SIZE_STEP}
          readout={`${String(draft.chat_font_size)}px`}
          onChange={(v) => {
            set("chat_font_size", v);
          }}
        />
      </SettingRow>
      <SettingRow label="Прозрачность окна" hint="Сквозь окно видно то, что под ним.">
        <SettingSlider
          ariaLabel="Прозрачность окна"
          value={draft.window_opacity}
          min={SETTINGS_LIMITS.windowOpacity.min}
          max={SETTINGS_LIMITS.windowOpacity.max}
          step={WINDOW_OPACITY_STEP}
          readout={formatPercent(draft.window_opacity)}
          onChange={(v) => {
            set("window_opacity", v);
          }}
        />
      </SettingRow>
    </SettingGroup>
  );
}
