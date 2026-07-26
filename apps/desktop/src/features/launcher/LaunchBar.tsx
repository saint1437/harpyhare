import { Play } from "lucide-react";
import { EqBars } from "@/components/EqBars";
import { Button } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { ScreenId } from "./screens";
import type { LauncherReadiness } from "./useLauncherReadiness";

function statusText(readiness: LauncherReadiness, launching: boolean): string {
  if (launching) return "Запускаю основное окно…";
  if (readiness.checking) return "Проверяю доступы…";
  const blocker = readiness.blockers[0];
  if (blocker) return blocker.label;
  return "Всё готово к запуску";
}

function StatusLine({
  readiness,
  launching,
  onGoToBlocker,
}: {
  readiness: LauncherReadiness;
  launching: boolean;
  onGoToBlocker: (screen: ScreenId) => void;
}) {
  const blocker = readiness.blockers[0];
  const text = statusText(readiness, launching);
  const dot = (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        readiness.checking && "bg-muted-foreground/40",
        !readiness.checking && (blocker ? "bg-destructive" : "bg-primary"),
      )}
      aria-hidden
    />
  );

  if (blocker && !launching) {
    return (
      <Button
        variant="ghost"
        size="compact"
        className="min-w-0 gap-2 text-muted-foreground"
        onClick={() => {
          onGoToBlocker(blocker.screen);
        }}
      >
        {dot}
        <span className="truncate">{text}</span>
      </Button>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2 px-2 text-caption text-muted-foreground">
      {dot}
      <span className="truncate">{text}</span>
    </span>
  );
}

export function LaunchBar({
  readiness,
  launching,
  error,
  onGoToBlocker,
  onLaunch,
}: {
  readiness: LauncherReadiness;
  launching: boolean;
  error: string | null;
  onGoToBlocker: (screen: ScreenId) => void;
  onLaunch: () => void;
}) {
  return (
    <header className="flex h-8 items-center gap-2.5">
      <EqBars animated={launching} barClass="bg-primary" />
      <h1 className="font-mono text-caption font-semibold tracking-[0.16em] text-foreground/80 uppercase">
        {BRAND_NAME}
      </h1>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {error !== null && (
          <span className="min-w-0 truncate text-caption text-destructive" title={error}>
            {error}
          </span>
        )}
        <StatusLine readiness={readiness} launching={launching} onGoToBlocker={onGoToBlocker} />
        <Button
          size="sm"
          className="gap-1.5"
          disabled={launching || readiness.checking || !readiness.ready}
          onClick={onLaunch}
        >
          <Play className="size-3.5" aria-hidden />
          {launching ? "Запускаю…" : "Запустить"}
        </Button>
      </div>
    </header>
  );
}
