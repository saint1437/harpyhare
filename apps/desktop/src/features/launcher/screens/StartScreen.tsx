import { ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { AccessCodeForm } from "@/components/AccessCodeForm";
import { StateBadge, type StateTone } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import type { AudioCheckApi } from "@/hooks/useAudioCheck";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionKind } from "@/ipc/bindings";
import { formatCombo, hotkeyAction } from "@/lib/hotkeys";
import { cn, SURFACE_CARD_CLASS } from "@/lib/utils";
import { AudioCheckCard } from "../AudioCheckCard";
import type { LauncherDestination } from "../contract";
import { SettingGroup } from "../fields";
import { LaunchButton } from "../LaunchButton";
import type { ScreenId } from "../screens";
import { ScreenShell } from "../ScreenShell";
import { startSteps, stepsLeft, type StartStep, type StartStepState } from "../start-steps";
import type { LauncherReadiness } from "../useLauncherReadiness";

const SETTINGS_SCREEN: ScreenId = "settings";
const RECORD_ACTION = "record";

const STATE_LABEL: Record<StartStepState, string> = {
  done: "готово",
  todo: "нужно сделать",
  checking: "проверяю…",
};

// Пуш-ту-ток нигде не объяснялся, а экран, где он описан, уничтожается ровно в
// тот момент, когда знание становится нужным. Комбинация и подпись берутся из
// реестра: литерал устарел бы в ту секунду, когда пользователь переназначит клавишу.
const DEFAULTS_NOTE =
  "Клавиши, быстрые действия, размеры окна и вид уже заданы по умолчанию — их можно не трогать.";

function summary(steps: StartStep[]): string {
  if (steps.some((step) => step.state === "checking")) return "Проверяю доступы…";
  const left = stepsLeft(steps);
  return left === 0 ? "Всё готово — можно запускать." : `Осталось шагов: ${String(left)}.`;
}

// `todo` and `checking` used to share one grey dot and differed only by the word.
// They now differ by glyph too — the word is still there, but it is no longer the
// only thing carrying the difference.
const STATE_TONE: Record<StartStepState, StateTone> = {
  done: "success",
  todo: "warning",
  checking: "neutral",
};

function StateChip({ state }: { state: StartStepState }) {
  return <StateBadge tone={STATE_TONE[state]} label={STATE_LABEL[state]} />;
}

function StepView({ step, children }: { step: StartStep; children: ReactNode }) {
  const done = step.state === "done";
  const Icon = done ? Check : step.icon;
  return (
    <div
      role="group"
      aria-label={step.title}
      className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 px-3 py-2.5"
    >
      <Icon
        className={cn("mt-0.5 size-4.5", done ? "text-success" : "text-fg-subtle")}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-body">{step.title}</span>
          <StateChip state={step.state} />
        </div>
        <p className="text-caption text-fg-subtle">{step.hint}</p>
        {children}
      </div>
    </div>
  );
}

function AccessControl({
  step,
  onRedeem,
  onNavigate,
}: {
  step: StartStep;
  onRedeem: (code: string) => Promise<string | null>;
  onNavigate: (destination: LauncherDestination) => void;
}) {
  const openKeys = (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2.5 self-start"
      onClick={() => {
        onNavigate({ screen: step.screen, tab: step.tab });
      }}
    >
      {step.state === "done" ? "Изменить доступ" : "Ввести свои ключи"}
      <ArrowRight className="size-3" aria-hidden />
    </Button>
  );

  if (step.state === "done") return openKeys;

  return (
    <div className="flex flex-col gap-1.5">
      <AccessCodeForm onRedeem={onRedeem} autoFocus />
      {openKeys}
    </div>
  );
}

function PermissionControl({
  step,
  kind,
  permissions,
  onNavigate,
}: {
  step: StartStep;
  kind: PermissionKind;
  permissions: PermissionsApi;
  onNavigate: (destination: LauncherDestination) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 self-start">
      {step.state === "todo" && (
        <>
          <Button
            size="sm"
            className="min-w-18"
            disabled={permissions.pending !== null}
            onClick={() => void permissions.request(kind)}
          >
            {permissions.pending === kind ? "Запрашиваю…" : "Выдать"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              permissions.openSettings(kind);
            }}
          >
            Настройки
          </Button>
        </>
      )}
      {/* Необязательные доступы живут только на своём экране — со «Старта» туда нужна дверь. */}
      <Button
        variant="ghost"
        size="sm"
        className={step.state === "todo" ? undefined : "-ml-2.5"}
        onClick={() => {
          onNavigate({ screen: step.screen, tab: step.tab });
        }}
      >
        Все доступы
        <ArrowRight className="size-3" aria-hidden />
      </Button>
    </div>
  );
}

export function StartScreen({
  readiness,
  launching,
  audioCheck,
  recordCombo,
  onRedeem,
  onNavigate,
  onLaunch,
}: {
  readiness: LauncherReadiness;
  launching: boolean;
  audioCheck: AudioCheckApi;
  recordCombo: string;
  onRedeem: (code: string) => Promise<string | null>;
  onNavigate: (destination: LauncherDestination) => void;
  onLaunch: () => void;
}) {
  const steps = startSteps(readiness);

  return (
    <ScreenShell screen="start">
      <SettingGroup title="Что нужно для запуска" description={summary(steps)}>
        {steps.map((step) => (
          <StepView key={step.id} step={step}>
            {step.id === "access" ? (
              <AccessControl step={step} onRedeem={onRedeem} onNavigate={onNavigate} />
            ) : (
              <PermissionControl
                step={step}
                kind={step.id}
                permissions={readiness.permissions}
                onNavigate={onNavigate}
              />
            )}
          </StepView>
        ))}
      </SettingGroup>

      <AudioCheckCard autoModeEnabled={readiness.autoModeEnabled} check={audioCheck} />

      <SettingGroup title="Как пользоваться">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
          <span className="rounded-md bg-inset px-2 py-1 font-mono text-body font-semibold text-fg">
            {recordCombo === "" ? "не назначено" : formatCombo(recordCombo)}
          </span>
          <span className="min-w-40 flex-1 text-body text-fg-muted">
            {hotkeyAction(RECORD_ACTION).hint}
          </span>
        </div>
        <p className="px-3 py-2.5 text-caption text-fg-subtle">
          Отпустите — расшифровка попадёт в поле ввода. Остальные сочетания перечислены в основном
          окне по кнопке с клавиатурой.
        </p>
      </SettingGroup>

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-3 py-2.5",
          SURFACE_CARD_CLASS,
        )}
      >
        <p className="min-w-40 flex-1 text-caption text-fg-subtle">{DEFAULTS_NOTE}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onNavigate({ screen: SETTINGS_SCREEN });
            }}
          >
            Все настройки
          </Button>
          <LaunchButton readiness={readiness} launching={launching} size="sm" onLaunch={onLaunch} />
        </div>
      </div>
    </ScreenShell>
  );
}
