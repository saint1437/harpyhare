import type { SectionProps } from "../contract";
import { SettingGroup, SettingRow } from "../fields";
import { HotkeyCapture } from "../HotkeyCapture";

const HOTKEYS = [
  {
    key: "hotkey",
    label: "Запись (push-to-talk)",
    hint: "Удерживайте, пока говорит собеседник, — это главный жест приложения.",
  },
  {
    key: "toggle_hotkey",
    label: "Скрыть или показать окно",
    hint: "Работает, даже когда окно спрятано.",
  },
  { key: "teleprompter_hotkey", label: "Суфлёр", hint: "Крупный текст ответа поверх экрана." },
  {
    key: "screenshot_hotkey",
    label: "Снимок области",
    hint: "Выделенная область уходит вложением в чат.",
  },
] as const satisfies readonly { key: keyof SectionProps["draft"]; label: string; hint: string }[];

export function HotkeysSection({ draft, set }: SectionProps) {
  return (
    <SettingGroup
      title="Горячие клавиши"
      description="Глобальные — срабатывают, пока запущено основное окно."
    >
      {HOTKEYS.map(({ key, label, hint }) => (
        <SettingRow key={key} label={label} hint={hint}>
          <HotkeyCapture
            value={draft[key]}
            onChange={(hk) => {
              set(key, hk);
            }}
          />
        </SettingRow>
      ))}
    </SettingGroup>
  );
}
