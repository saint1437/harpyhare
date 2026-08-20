import type { SectionProps } from "../contract";
import { SettingGroup, SettingRow, SettingSwitch } from "../fields";

const TOGGLES = [
  {
    key: "auto_send",
    label: "Отправлять сразу после распознавания",
    hint: "Расшифровка уходит в чат без нажатия отправки.",
  },
  {
    key: "auto_preview_html",
    label: "Открывать превью HTML",
    hint: "Если в ответе есть HTML-блок, рядом с чатом открывается панель просмотра.",
  },
  {
    key: "teleprompter_resume",
    label: "Суфлёр продолжает с места остановки",
    hint: "Иначе текст каждый раз начинается сверху.",
  },
] as const satisfies readonly { key: keyof SectionProps["draft"]; label: string; hint: string }[];

export function BehaviorSection({ draft, set }: SectionProps) {
  return (
    <SettingGroup title="Поведение" description="Как приложение ведёт себя во время работы.">
      <SettingRow
        label="Показывать окно при демонстрации экрана"
        hint="По умолчанию окно вырезано из захвата — собеседники его не видят. Включите, только если хотите показать его намеренно."
      >
        <SettingSwitch
          ariaLabel="Показывать окно при демонстрации экрана"
          checked={draft.screen_share_visible}
          onCheckedChange={(v) => {
            set("screen_share_visible", v);
          }}
        />
      </SettingRow>
      {TOGGLES.map(({ key, label, hint }) => (
        <SettingRow key={key} label={label} hint={hint}>
          <SettingSwitch
            ariaLabel={label}
            checked={draft[key]}
            onCheckedChange={(v) => {
              set(key, v);
            }}
          />
        </SettingRow>
      ))}
    </SettingGroup>
  );
}
