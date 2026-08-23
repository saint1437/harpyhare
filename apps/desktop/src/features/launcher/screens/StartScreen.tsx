import { ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";
import { AccessCodeForm } from "@/components/AccessCodeForm";
import { Button } from "@/components/ui/button";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionKind } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import type { LauncherDestination } from "../contract";
import { SettingGroup } from "../fields";
import { LaunchButton } from "../LaunchButton";
import type { ScreenId } from "../screens";
import { ScreenShell } from "../ScreenShell";
import { startSteps, stepsLeft, type StartStep, type StartStepState } from "../start-steps";
import type { LauncherReadiness } from "../useLauncherReadiness";

const SETTINGS_SCREEN: ScreenId = "settings";

const STATE_LABEL: Record<StartStepState, string> = {
  done: "готово",
  todo: "нужно сделать",
  checking: "проверяю…",
};

const DEFAULTS_NOTE =
  "Клавиши, быстрые действия, размеры окна и вид уже заданы по умолчанию — их можно не трогать.";

function summary(steps: StartStep[]): string {
  if (steps.some((step) => step.state === "checking")) return "Проверяю доступы…";
  const left = stepsLeft(steps);
  return left === 0 ? "Всё готово — можно запускать." : `Осталось шагов: ${String(left)}.`;
}

function StateChip({ state }: { state: StartStepState }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "done" ? "bg-primary" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      {STATE_LABEL[state]}
    </span>
  );
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
        className={cn("mt-0.5 size-4.5", done ? "text-primary" : "text-muted-foreground")}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-body">{step.title}</span>
          <StateChip state={step.state} />
        </div>
        <p className="text-caption text-muted-foreground">{step.hint}</p>
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
  onRedeem,
  onNavigate,
  onLaunch,
}: {
  readiness: LauncherReadiness;
  launching: boolean;
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

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-lg bg-card px-3 py-2.5 shadow-raise ring-1 ring-border ring-inset">
        <p className="min-w-40 flex-1 text-caption text-muted-foreground">{DEFAULTS_NOTE}</p>
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
