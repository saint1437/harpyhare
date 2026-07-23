import type { SectionProps } from "../contract";
import { SwitchRow } from "../fields";

export function BehaviorSection({ draft, set }: SectionProps) {
  return (
    <div className="grid grid-cols-1 gap-y-3.5 sm:grid-cols-2 sm:gap-x-10">
      <SwitchRow
        checked={draft.auto_send}
        onCheckedChange={(v) => {
          set("auto_send", v);
        }}
      >
        Отправлять сразу после распознавания
      </SwitchRow>
      <SwitchRow
        checked={draft.auto_preview_html}
        onCheckedChange={(v) => {
          set("auto_preview_html", v);
        }}
      >
        Автопревью HTML из ответа
      </SwitchRow>
      <SwitchRow
        checked={draft.screen_share_visible}
        onCheckedChange={(v) => {
          set("screen_share_visible", v);
        }}
      >
        Показывать окно при демонстрации экрана
      </SwitchRow>
      <SwitchRow
        checked={draft.teleprompter_resume}
        onCheckedChange={(v) => {
          set("teleprompter_resume", v);
        }}
      >
        Суфлёр продолжает с места остановки
      </SwitchRow>
    </div>
  );
}
