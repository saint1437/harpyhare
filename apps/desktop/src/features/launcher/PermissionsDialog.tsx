import { AudioLines, Monitor, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionKind, PermissionState } from "@/ipc/bindings";
import { cn } from "@/lib/utils";

interface PermissionRow {
  kind: PermissionKind;
  title: string;
  purpose: string;
  icon: LucideIcon;
}

const PERMISSION_ROWS: PermissionRow[] = [
  {
    kind: "audio",
    title: "Запись системного звука",
    purpose: "Обязателен: без него нечего расшифровывать.",
    icon: AudioLines,
  },
  {
    kind: "screen",
    title: "Запись экрана",
    purpose: "Необязателен: нужен снимку области экрана.",
    icon: Monitor,
  },
];

const STATE_LABEL: Record<PermissionState, string> = {
  granted: "выдан",
  denied: "нет доступа",
  unknown: "не выдан",
};

function StatusChip({ state }: { state: PermissionState }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "granted" ? "bg-primary" : "bg-muted-foreground/40",
        )}
        aria-hidden
      />
      {STATE_LABEL[state]}
    </span>
  );
}

function PermissionRowView({
  row,
  permissions,
}: {
  row: PermissionRow;
  permissions: PermissionsApi;
}) {
  const state = permissions.status[row.kind];
  const granted = state === "granted";
  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_10.75rem] items-center gap-x-3 rounded-xl bg-surface px-3 py-2.5">
      <row.icon
        className={cn("size-5", granted ? "text-foreground" : "text-muted-foreground")}
        aria-hidden
      />

      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-body">{row.title}</span>
          <StatusChip state={state} />
        </div>
        <p className="min-h-9 text-caption text-muted-foreground">{row.purpose}</p>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        {!granted && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                permissions.openSettings(row.kind);
              }}
            >
              Настройки
            </Button>
            <Button
              size="sm"
              className="min-w-18"
              disabled={permissions.pending !== null}
              onClick={() => void permissions.request(row.kind)}
            >
              Выдать
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function PermissionsDialog({
  permissions,
  open,
  onOpenChange,
}: {
  permissions: PermissionsApi;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(520px,95vw)] sm:max-w-[min(520px,95vw)]">
        <DialogHeader>
          <DialogTitle>Доступы</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <p className="text-body text-muted-foreground">
            macOS выдаёт их только по запросу. Нажмите «Выдать» — система спросит подтверждение;
            если окно не появилось, доступ уже решён и его меняют в системных настройках.
          </p>
          <div className="grid gap-2">
            {PERMISSION_ROWS.map((row) => (
              <PermissionRowView key={row.kind} row={row} permissions={permissions} />
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => void permissions.refresh()}>
            Проверить заново
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
