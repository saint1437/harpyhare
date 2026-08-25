import { Button } from "@/components/ui/button";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionState } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { SettingGroup } from "../fields";
import { permissionNeedLabel, PERMISSION_ROWS, type PermissionRow } from "../permission-rows";
import { ScreenShell } from "../ScreenShell";

const STATE_LABEL: Record<PermissionState, string> = {
  granted: "выдан",
  denied: "нет доступа",
  unknown: "не выдан",
};

function StatusChip({ state }: { state: PermissionState }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-caption text-fg-subtle">
      <span
        className={cn("size-1.5 rounded-full", state === "granted" ? "bg-success" : "bg-fg-subtle")}
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
    <div
      role="group"
      aria-label={row.title}
      className="grid grid-cols-[1.25rem_minmax(0,1fr)_14rem] items-center gap-x-3 px-3 py-2.5"
    >
      <row.icon className={cn("size-4.5", granted ? "text-fg" : "text-fg-subtle")} aria-hidden />

      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-body">{row.title}</span>
          <StatusChip state={state} />
          <span className="text-hint text-fg-subtle/80">{permissionNeedLabel(row.need)}</span>
        </div>
        <p className="min-h-9 text-caption text-fg-subtle">{row.purpose}</p>
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
              {permissions.pending === row.kind ? "Запрашиваю…" : "Выдать"}
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
        description="Система выдаёт их только по запросу. Нажмите «Выдать» — macOS спросит подтверждение; если окно не появилось, доступ уже решён и меняется в системных настройках. Меняли что-то там — нажмите «Проверить заново»."
      >
        {PERMISSION_ROWS.map((row) => (
          <PermissionRowView key={row.kind} row={row} permissions={permissions} />
        ))}
      </SettingGroup>
    </ScreenShell>
  );
}
