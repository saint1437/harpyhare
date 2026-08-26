import { StateBadge } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import type { Settings } from "@/ipc/types";
import { effectiveCombo, formatCombo, hotkeyAction } from "@/lib/hotkeys";
import { cn, SURFACE_CARD_CLASS } from "@/lib/utils";
import type { LauncherReadiness } from "../../launcher/useLauncherReadiness";
import { OnboardingShell } from "../OnboardingShell";

const RECORD_ACTION = "record";

const AFTERWARDS =
  "Отпустите — расшифровка попадёт в поле ввода. Остальные сочетания перечислены в окне по кнопке с клавиатурой.";

/**
 * Hands over exactly one thing to remember. The combination and its caption both
 * come from the hotkey registry — a literal here would go stale the moment a user
 * rebinds the key, which is precisely when the hint matters most.
 */
export function ReadyStep({
  step,
  total,
  settings,
  readiness,
  launching,
  onLaunch,
  onFixAudio,
  onOpenLauncher,
}: {
  step: number;
  total: number;
  settings: Settings;
  readiness: LauncherReadiness;
  launching: boolean;
  onLaunch: () => void;
  onFixAudio: () => void;
  onOpenLauncher: () => void;
}) {
  const combo = effectiveCombo(settings.hotkeys, RECORD_ACTION);
  const hint = hotkeyAction(RECORD_ACTION).hint;
  const audioReady = readiness.permissions.audioOk;
  const ready = readiness.ready && !readiness.checking;
  // A blocker other than system audio (the mic for auto-listening, keys on a
  // replay): the button must name the reason — LauncherApp silently refuses to
  // launch without readiness.ready, so the click used to go nowhere.
  const otherBlocker = ready || !audioReady ? null : (readiness.blockers[0]?.label ?? null);

  return (
    <OnboardingShell
      step={step}
      total={total}
      heading={ready ? "Всё готово" : "Почти готово"}
      primary={
        // Без доступа к системному звуку запуск физически заблокирован
        // (`canLaunch` требует `audioOk`), поэтому кнопка «всё равно запустить»
        // была бы обещанием, которого приложение не выполнит.
        audioReady ? (
          <Button disabled={launching || !ready} onClick={onLaunch}>
            {launching ? "Запускаю…" : "Запустить"}
          </Button>
        ) : (
          <Button onClick={onFixAudio}>Выдать доступ</Button>
        )
      }
      secondary={
        <Button variant="ghost" size="sm" onClick={onOpenLauncher}>
          {audioReady ? "Открыть настройки" : "Продолжить без него"}
        </Button>
      }
    >
      <div className={cn("flex flex-col items-center gap-2 px-4 py-7", SURFACE_CARD_CLASS)}>
        <span className="font-mono text-display font-semibold tracking-wider text-fg">
          {combo === "" ? "не назначено" : formatCombo(combo)}
        </span>
        <span className="text-body text-fg-muted">{hint}</span>
      </div>

      <p className="text-caption text-fg-subtle">{AFTERWARDS}</p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <StateBadge
          tone={readiness.missingKeys.length === 0 ? "success" : "warning"}
          label="Доступ к API"
        />
        {audioReady ? (
          <StateBadge tone="success" label="Системный звук" />
        ) : (
          <StateBadge
            tone="warning"
            label="Системный звук не выдан — без него запуск недоступен."
          />
        )}
        {otherBlocker !== null && <StateBadge tone="warning" label={otherBlocker} />}
      </div>
    </OnboardingShell>
  );
}
