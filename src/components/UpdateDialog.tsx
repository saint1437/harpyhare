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
  /** Версия текущей сборки для строки «текущая → новая». */
  currentVersion: string;
  onClose: () => void;
  onInstall: () => void;
  onSkip: () => void;
}

const MIB = 1024 * 1024;

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
  const percent =
    progress && progress.total !== null && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose(); // «Позже»: закрыть можно и во время загрузки — бейдж покажет ход
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

          {info.notes !== "" && (
            <div className="prose-answer max-h-48 overflow-y-auto rounded-md bg-white/5 p-3 text-[12.5px] leading-relaxed text-foreground/90">
              <Markdown remarkPlugins={[remarkGfm]}>{info.notes}</Markdown>
            </div>
          )}

          {busy && (
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
                {status === "restarting"
                  ? "Установлено. Перезапуск…"
                  : percent !== null
                    ? `Загрузка… ${percent}%`
                    : `Загрузка… ${((progress?.downloaded ?? 0) / MIB).toFixed(1)} МиБ`}
              </span>
            </div>
          )}

          {status === "error" && error !== null && (
            <span className="text-[12.5px] whitespace-pre-wrap text-destructive">{error}</span>
          )}
        </div>

        <DialogFooter>
          {!busy && (
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
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
