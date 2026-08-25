import { Button } from "@/components/ui/button";
import type { Settings } from "@/ipc/types";
import type { SetSetting } from "../../launcher/contract";
import { SettingGroup, SettingRow, SettingSwitch } from "../../launcher/fields";
import { OnboardingShell } from "../OnboardingShell";

/**
 * The honest declaration. Three of these four lines describe behaviour the
 * interface has never admitted to anywhere: the always-on ring buffer was a
 * settings row on a tab nobody opens, its pre-roll silently extended every
 * recording backwards, and every finished transcript and every screenshot went to
 * the system clipboard with no setting and no mention.
 */
const DISCLOSURES = [
  "Пока вы держите клавишу записи — звук уходит на расшифровку. Это единственный момент, когда что-то покидает компьютер.",
  "Фоновый буфер держит последние секунды звука в памяти, чтобы не терять начало фразы. На диск он не пишется и стирается, когда вы его выключаете.",
  "Расшифровка и снимки экрана копируются в буфер обмена, чтобы их можно было вставить куда угодно.",
  "Микрофон включается только в автослушании — оно выключено.",
];

const CLOSING = "Слушание видно в окне и ставится на паузу одной кнопкой.";

export function PrivacyStep({
  step,
  total,
  draft,
  set,
  onNext,
}: {
  step: number;
  total: number;
  draft: Settings;
  set: SetSetting;
  onNext: () => void;
}) {
  return (
    <OnboardingShell
      step={step}
      total={total}
      heading="Что приложение слышит и когда"
      primary={<Button onClick={onNext}>Дальше</Button>}
      secondary={<span className="text-caption text-fg-subtle">{CLOSING}</span>}
    >
      <ul className="flex flex-col gap-2.5">
        {DISCLOSURES.map((line) => (
          <li key={line} className="flex gap-2.5 text-body text-fg-muted">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-listening" aria-hidden />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>

      <SettingGroup title="Что можно выключить прямо сейчас">
        <SettingRow label="Фоновый буфер" hint="Подхватывает сказанное за секунды до нажатия.">
          <SettingSwitch
            ariaLabel="Фоновый буфер"
            checked={draft.buffer_enabled}
            onCheckedChange={(v) => {
              set("buffer_enabled", v);
            }}
          />
        </SettingRow>
        <SettingRow label="Копировать в буфер обмена" hint="Расшифровки и снимки экрана.">
          <SettingSwitch
            ariaLabel="Копировать в буфер обмена"
            checked={draft.copy_results_to_clipboard}
            onCheckedChange={(v) => {
              set("copy_results_to_clipboard", v);
            }}
          />
        </SettingRow>
      </SettingGroup>
    </OnboardingShell>
  );
}
