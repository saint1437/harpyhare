import { AudioLines, Mic, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingGroup, SettingRow } from "@/features/settings/fields";
import type { AudioCheckApi } from "@/hooks/useAudioCheck";
import { useDict } from "@/hooks/useDict";
import { format } from "@/i18n";
import type { Dictionary } from "@/i18n/types";
import type { AudioCheck, AudioSource } from "@/ipc/types";

const LEVEL_SCALE = 100;

/** The registry keeps the icon; the two phrases are `dict.launcher.audioCheck.sources`. */
interface SourceMeta {
  source: AudioSource;
  icon: LucideIcon;
}

const SOURCES = [
  { source: "system", icon: AudioLines },
  { source: "microphone", icon: Mic },
] as const satisfies readonly SourceMeta[];

function heardResult(result: AudioCheck, dict: Dictionary): string {
  const copy = dict.launcher.audioCheck;
  if (!result.heard) return copy.silence;
  return result.text === "" ? copy.noSpeech : format(copy.heard, { text: result.text });
}

// Отказ проверки уходит в уведомление, а не в подсказку строки: текст ошибки
// с бэкенда бывает длиннее самой карточки, и строка настроек его не держит.
function rowHint(
  source: AudioSource,
  shown: boolean,
  result: AudioCheck | null,
  dict: Dictionary,
): string {
  if (!shown || result === null) return dict.launcher.audioCheck.sources[source].hint;
  return heardResult(result, dict);
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
  const dict = useDict();
  const copy = dict.launcher.audioCheck;
  const sources = SOURCES.filter((meta) => meta.source !== "microphone" || autoModeEnabled);

  return (
    <SettingGroup title={copy.title} description={copy.description}>
      {sources.map((meta) => {
        const running = check.running === meta.source;
        const shown = check.source === meta.source;
        return (
          <SettingRow
            key={meta.source}
            label={copy.sources[meta.source].label}
            hint={rowHint(meta.source, shown, check.result, dict)}
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
                {running ? copy.running : copy.run}
              </Button>
            </div>
          </SettingRow>
        );
      })}
    </SettingGroup>
  );
}
