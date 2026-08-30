import { ChevronRight, Play } from "lucide-react";
import type { ReactNode } from "react";
import { EqBars } from "@/components/EqBars";
import { Button } from "@/components/ui/button";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import { BRAND_NAME } from "@/lib/brand";
import { PLATFORM } from "@/lib/platform";
import { cn } from "@/lib/utils";
import type { LauncherBlocker, LauncherReadiness } from "./useLauncherReadiness";

const MACOS_TRAFFIC_LIGHTS_CLASS = PLATFORM === "macos" ? "pl-16" : "";

function statusText(readiness: LauncherReadiness, launching: boolean, saving: boolean): string {
  if (launching) return "Запускаю основное окно…";
  if (readiness.checking) return "Проверяю доступы…";
  if (saving) return "Сохраняю…";
  const blocker = readiness.blockers[0];
  if (blocker) return blocker.label;
  return "Всё готово к запуску";
}

function StatusLine({
  readiness,
  launching,
  saving,
  onGoToBlocker,
}: {
  readiness: LauncherReadiness;
  launching: boolean;
  saving: boolean;
  onGoToBlocker: (blocker: LauncherBlocker) => void;
}) {
  const blocker = readiness.blockers[0];
  const busy = launching || readiness.checking || saving;
  const text = statusText(readiness, launching, saving);
  const dot = (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        busy && "bg-muted-foreground/40",
        !busy && (blocker ? "bg-destructive" : "bg-primary"),
      )}
      aria-hidden
    />
  );

  if (blocker && !busy) {
    return (
      <Button
        variant="ghost"
        size="compact"
        className="min-w-0 gap-2 text-muted-foreground"
        onClick={() => {
          onGoToBlocker(blocker);
        }}
      >
        {dot}
        <span className="truncate" title={text}>
          {text}
        </span>
        <ChevronRight className="size-3 shrink-0 text-muted-foreground/70" aria-hidden />
      </Button>
    );
  }

  return (
    <span className="inline-flex h-6.5 min-w-0 items-center gap-2 px-2 text-caption text-muted-foreground">
      {dot}
      <span className="truncate" title={text}>
        {text}
      </span>
    </span>
  );
}

export function LaunchBar({
  readiness,
  launching,
  saving,
  search,
  onGoToBlocker,
  onLaunch,
}: {
  readiness: LauncherReadiness;
  launching: boolean;
  saving: boolean;
  search: ReactNode;
  onGoToBlocker: (blocker: LauncherBlocker) => void;
  onLaunch: () => void;
}) {
  const onDragMouseDown = useWindowDrag();
  return (
    <header
      onMouseDown={onDragMouseDown}
      className={cn("flex h-9 shrink-0 items-center gap-3", MACOS_TRAFFIC_LIGHTS_CLASS)}
    >
      <div className="flex shrink-0 items-center gap-2">
        <EqBars animated={launching} barClass="bg-primary" />
        <h1 className="font-mono text-hint font-semibold tracking-wider text-foreground/55 uppercase">
          {BRAND_NAME}
        </h1>
      </div>

      <div className="max-w-96 min-w-0 flex-1">{search}</div>

      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
        <div className="max-w-80 min-w-0">
          <StatusLine
            readiness={readiness}
            launching={launching}
            saving={saving}
            onGoToBlocker={onGoToBlocker}
          />
        </div>
        <Button
          size="compact"
          className="gap-1.5"
          disabled={launching || readiness.checking || !readiness.ready}
          onClick={onLaunch}
        >
          <Play className="size-3" aria-hidden />
          {launching ? "Запускаю…" : "Запустить"}
        </Button>
      </div>
    </header>
  );
}
