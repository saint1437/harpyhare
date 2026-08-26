import { lazy, Suspense } from "react";
import { NotificationCard } from "@/components/NotificationCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDict } from "@/hooks/useDict";
import type { UpdaterStatus } from "@/hooks/useUpdater";
import { format } from "@/i18n";
import type { HudCopy } from "@/i18n/hud-types";
import type { UpdateInfo, UpdateProgress } from "@/ipc/types";

// The release notes are the HUD's only markdown outside the answer panel, and
// the dialog opens at most once per release: rendering them eagerly kept the
// whole markdown pipeline in the HUD's startup chunk.
const ReleaseNotes = lazy(() => import("@/components/ReleaseNotes"));

export interface UpdateDialogProps {
  open: boolean;
  info: UpdateInfo;
  status: UpdaterStatus;
  progress: UpdateProgress | null;
  error: string | null;
  currentVersion: string;
  onClose: () => void;
  onInstall: () => void;
  onSkip: () => void;
}

const MIB = 1024 * 1024;
const PERCENT_MAX = 100;

function downloadPercent(progress: UpdateProgress | null): number | null {
  if (progress && progress.total !== null && progress.total > 0) {
    return Math.min(PERCENT_MAX, Math.round((progress.downloaded / progress.total) * PERCENT_MAX));
  }
  return null;
}

function formatMib(bytes: number): string {
  return (bytes / MIB).toFixed(1);
}

function progressCaption(
  status: UpdaterStatus,
  percent: number | null,
  progress: UpdateProgress | null,
  copy: HudCopy["update"],
): string {
  if (status === "restarting") return copy.restarting;
  if (percent !== null) return format(copy.downloadingPercent, { percent: String(percent) });
  return format(copy.downloadingSize, { size: formatMib(progress?.downloaded ?? 0) });
}

export function UpdateDialog({
  open,
  info,
  status,
  progress,
  error,
  currentVersion,
  onClose,
  onInstall,
  onSkip,
}: UpdateDialogProps) {
  const copy = useDict().hud.update;
  const busy = status === "downloading" || status === "restarting";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-[min(440px,95vw)] sm:max-w-[min(440px,95vw)]">
        <DialogHeader>
          <DialogTitle>{format(copy.available, { version: info.version })}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          {currentVersion !== "" && (
            <span className="font-mono text-caption text-fg-subtle">
              {currentVersion} → {info.version}
            </span>
          )}

          {info.notes !== "" && <ReleaseNotesCard notes={info.notes} />}

          {busy && <DownloadProgress status={status} progress={progress} />}

          {/* Единственная ошибка, которая НЕ уезжает в стопку уведомлений: она
              остаётся при своей кнопке «Повторить», да и стопка сидит в потоке
              под модалкой. Карточка та же — текст сворачивается и копируется. */}
          {status === "error" && error !== null && (
            <NotificationCard tone="danger" title={copy.failedTitle} detail={error} />
          )}
        </div>

        <DialogFooter className="flex-wrap">
          {!busy && (
            <UpdateActions
              status={status}
              onSkip={onSkip}
              onClose={onClose}
              onInstall={onInstall}
            />
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseNotesCard({ notes }: { notes: string }) {
  return (
    <div className="prose-answer max-h-48 overflow-y-auto rounded-lg bg-surface px-3 py-2 text-body leading-relaxed text-fg/90 ring-1 ring-inset ring-line">
      <Suspense fallback={<span className="whitespace-pre-wrap">{notes}</span>}>
        <ReleaseNotes notes={notes} />
      </Suspense>
    </div>
  );
}

function DownloadProgress({
  status,
  progress,
}: {
  status: UpdaterStatus;
  progress: UpdateProgress | null;
}) {
  const copy = useDict().hud.update;
  const percent = downloadPercent(progress);
  return (
    <div className="grid gap-1.5">
      <div className="h-1 overflow-hidden rounded-full bg-surface-active">
        <div
          className={
            percent === null
              ? "h-full w-full animate-pulse rounded-full bg-accent/60"
              : "h-full rounded-full bg-accent transition-[width]"
          }
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-caption text-fg-subtle tabular-nums">
        {progressCaption(status, percent, progress, copy)}
      </span>
    </div>
  );
}

function UpdateActions({
  status,
  onSkip,
  onClose,
  onInstall,
}: {
  status: UpdaterStatus;
  onSkip: () => void;
  onClose: () => void;
  onInstall: () => void;
}) {
  const dict = useDict();
  const copy = dict.hud.update;
  return (
    <>
      <Button variant="ghost" onClick={onSkip}>
        {copy.skipVersion}
      </Button>
      <Button variant="ghost" onClick={onClose}>
        {copy.later}
      </Button>
      <Button onClick={onInstall}>
        {status === "error" ? dict.common.actions.retry : copy.install}
      </Button>
    </>
  );
}
