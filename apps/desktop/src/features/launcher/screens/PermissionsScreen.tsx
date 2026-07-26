import { AudioLines, Monitor, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionKind, PermissionState } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { SettingGroup } from "../fields";
import { ScreenShell } from "../ScreenShell";

interface PermissionRow {
  kind: PermissionKind;
  title: string;
  purpose: string;
  icon: LucideIcon;
  required: boolean;
}

const PERMISSION_ROWS: PermissionRow[] = [
  {
    kind: "audio",
    title: "Запись системного звука",
    purpose: "Приложение слышит собеседника и расшифровывает речь. Без него запускать нечего.",
    icon: AudioLines,
    required: true,
  },
  {
    kind: "screen",
    title: "Запись экрана",
    purpose: "Нужна снимку области экрана. Без неё работает всё остальное.",
    icon: Monitor,
    required: false,
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
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_10.75rem] items-center gap-x-4 px-4 py-3">
      <row.icon
        className={cn("size-5", granted ? "text-foreground" : "text-muted-foreground")}
        aria-hidden
      />

      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-body">{row.title}</span>
          <StatusChip state={state} />
          <span className="text-caption text-muted-foreground">
            {row.required ? "обязателен" : "необязателен"}
          </span>
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

export function PermissionsScreen({ permissions }: { permissions: PermissionsApi }) {
  return (
    <ScreenShell
      screen="permissions"
      actions={
        <Button variant="ghost" size="sm" onClick={() => void permissions.refresh()}>
          Проверить заново
        </Button>
      }
    >
      <SettingGroup
        title="Разрешения macOS"
        description="Система выдаёт их только по запросу. Нажмите «Выдать» — macOS спросит подтверждение; если окно не появилось, доступ уже решён и меняется в системных настройках."
      >
        {PERMISSION_ROWS.map((row) => (
          <PermissionRowView key={row.kind} row={row} permissions={permissions} />
        ))}
      </SettingGroup>
    </ScreenShell>
  );
}
