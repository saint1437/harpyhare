import { AudioLines, Mic, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AudioCheckApi } from "@/hooks/useAudioCheck";
import type { AudioCheck, AudioSource } from "@/ipc/bindings";
import { SettingGroup, SettingRow } from "./fields";

const TITLE = "Проверка звука";
const DESCRIPTION =
  "Выданный доступ ещё не значит, что звук идёт. Проверка слушает пять секунд и показывает, что расслышала.";

const RUN_LABEL = "Проверить";
const RUNNING_LABEL = "Слушаю…";

const SILENCE_RESULT =
  "Тишина — звук не дошёл. Проверьте устройство и что источник действительно звучит.";
const NO_SPEECH_RESULT = "Звук идёт, но речи в нём не разобрать.";
const LEVEL_SCALE = 100;

interface SourceMeta {
  source: AudioSource;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const SOURCES = [
  {
    source: "system",
    label: "Системный звук",
    hint: "Голос собеседника: включите видео или музыку и нажмите проверку.",
    icon: AudioLines,
  },
  {
    source: "microphone",
    label: "Микрофон",
    hint: "Ваша речь для автослушания: скажите пару слов после нажатия.",
    icon: Mic,
  },
] as const satisfies readonly SourceMeta[];

function heardResult(result: AudioCheck): string {
  if (!result.heard) return SILENCE_RESULT;
  return result.text === "" ? NO_SPEECH_RESULT : `Расслышала: «${result.text}»`;
}

// Отказ проверки уходит в уведомление, а не в подсказку строки: текст ошибки
// с бэкенда бывает длиннее самой карточки, и строка настроек его не держит.
function rowHint(meta: SourceMeta, shown: boolean, result: AudioCheck | null): string {
  if (!shown || result === null) return meta.hint;
  return heardResult(result);
}

function LevelMeter({ level }: { level: number }) {
  return (
    <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-inset" aria-hidden>
      <span
        className="block h-full rounded-full bg-listening"
        style={{ width: `${String(Math.round(level * LEVEL_SCALE))}%` }}
      />
    </span>
  );
}

export function AudioCheckCard({
  autoModeEnabled,
  check,
}: {
  autoModeEnabled: boolean;
  check: AudioCheckApi;
}) {
  const sources = SOURCES.filter((meta) => meta.source !== "microphone" || autoModeEnabled);

  return (
    <SettingGroup title={TITLE} description={DESCRIPTION}>
      {sources.map((meta) => {
        const running = check.running === meta.source;
        const shown = check.source === meta.source;
        return (
          <SettingRow
            key={meta.source}
            label={meta.label}
            hint={rowHint(meta, shown, check.result)}
          >
            <div className="flex items-center justify-end gap-2">
              {running && <LevelMeter level={check.level} />}
              <Button
                size="sm"
                variant="outline"
                className="min-w-22"
                disabled={check.running !== null}
                onClick={() => {
                  check.run(meta.source);
                }}
              >
                {running ? RUNNING_LABEL : RUN_LABEL}
              </Button>
            </div>
          </SettingRow>
        );
      })}
    </SettingGroup>
  );
}
