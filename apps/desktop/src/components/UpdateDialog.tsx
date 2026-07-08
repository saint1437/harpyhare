import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UpdaterStatus } from "@/hooks/useUpdater";
import type { UpdateInfo, UpdateProgress } from "@/ipc/types";

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
const DOWNLOADING_LABEL = "Загрузка…";
const REMARK_PLUGINS = [remarkGfm];

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
): string {
  if (status === "restarting") return "Установлено. Перезапуск…";
  if (percent !== null) return `${DOWNLOADING_LABEL} ${percent}%`;
  return `${DOWNLOADING_LABEL} ${formatMib(progress?.downloaded ?? 0)} МиБ`;
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
  const busy = status === "downloading" || status === "restarting";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Доступна версия {info.version}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          {currentVersion !== "" && (
            <span className="font-mono text-[11.5px] text-muted-foreground">
              {currentVersion} → {info.version}
            </span>
          )}

          {info.notes !== "" && <ReleaseNotes notes={info.notes} />}

          {busy && <DownloadProgress status={status} progress={progress} />}

          {status === "error" && error !== null && (
            <span className="text-[12.5px] whitespace-pre-wrap text-destructive">{error}</span>
          )}
        </div>

        <DialogFooter>
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

function ReleaseNotes({ notes }: { notes: string }) {
  return (
    <div className="prose-answer max-h-48 overflow-y-auto rounded-md bg-white/5 p-3 text-[12.5px] leading-relaxed text-foreground/90">
      <Markdown remarkPlugins={REMARK_PLUGINS}>{notes}</Markdown>
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
  const percent = downloadPercent(progress);
  return (
    <div className="grid gap-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={
            percent === null
              ? "h-full w-full animate-pulse rounded-full bg-primary/60"
              : "h-full rounded-full bg-primary transition-[width]"
          }
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-[11.5px] text-muted-foreground">
        {progressCaption(status, percent, progress)}
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
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onSkip}>
        Пропустить эту версию
      </Button>
      <Button variant="ghost" size="sm" onClick={onClose}>
        Позже
      </Button>
      <Button size="sm" onClick={onInstall}>
        {status === "error" ? "Повторить" : "Обновить и перезапустить"}
      </Button>
    </>
  );
}
