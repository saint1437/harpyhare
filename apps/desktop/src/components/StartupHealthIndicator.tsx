import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StartupHealthReport } from "@/ipc/bindings";
import { cn } from "@/lib/utils";

function hasFailure(report: StartupHealthReport): boolean {
  return [report.network, report.openrouter, report.speech].some(
    (check) => !["ok", "skipped"].includes(check.status),
  );
}

export function StartupHealthIndicator({
  report,
  checking,
  onRetry,
}: {
  report: StartupHealthReport | null;
  checking: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const failed = report !== null && hasFailure(report);
  const label = checking
    ? t("hud.health.checking")
    : report === null
      ? t("hud.health.unknown")
      : failed
        ? t("hud.health.attention")
        : t("hud.health.ready");
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="rounded-full p-1 text-muted-foreground hover:bg-transparent"
      onClick={onRetry}
    >
      {checking ? (
        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : failed ? (
        <CircleAlert className={cn("size-3.5", "text-destructive")} aria-hidden />
      ) : (
        <CheckCircle2 className="size-3.5 text-primary" aria-hidden />
      )}
    </button>
  );
}
