import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NotificationCard } from "@/components/NotificationCard";
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
const UPDATE_FAILED_TITLE = "Не удалось обновиться";
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
      <DialogContent className="max-w-[min(440px,95vw)] sm:max-w-[min(440px,95vw)]">
        <DialogHeader>
          <DialogTitle>Доступна версия {info.version}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          {currentVersion !== "" && (
            <span className="font-mono text-caption text-fg-subtle">
              {currentVersion} → {info.version}
            </span>
          )}

          {info.notes !== "" && <ReleaseNotes notes={info.notes} />}

          {busy && <DownloadProgress status={status} progress={progress} />}

          {/* Единственная ошибка, которая НЕ уезжает в стопку уведомлений: она
              остаётся при своей кнопке «Повторить», да и стопка сидит в потоке
              под модалкой. Карточка та же — текст сворачивается и копируется. */}
          {status === "error" && error !== null && (
            <NotificationCard tone="danger" title={UPDATE_FAILED_TITLE} detail={error} />
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

function ReleaseNotes({ notes }: { notes: string }) {
  return (
    <div className="prose-answer max-h-48 overflow-y-auto rounded-lg bg-surface px-3 py-2 text-body leading-relaxed text-fg/90 ring-1 ring-inset ring-line">
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
      <Button variant="ghost" onClick={onSkip}>
        Пропустить эту версию
      </Button>
      <Button variant="ghost" onClick={onClose}>
        Позже
      </Button>
      <Button onClick={onInstall}>
        {status === "error" ? "Повторить" : "Обновить и перезапустить"}
      </Button>
    </>
  );
}
