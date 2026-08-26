import { StateBadge } from "@/components/StateBadge";
import { Button } from "@/components/ui/button";
import { SettingGroup } from "@/features/settings/fields";
import {
  permissionNeedLabel,
  permissionRowCopy,
  PERMISSION_ROWS,
  PERMISSION_STATE_TONE,
  type PermissionRow,
} from "@/features/settings/permission-rows";
import { RequestPermissionButton } from "@/features/settings/RequestPermissionButton";
import { useDict } from "@/hooks/useDict";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionState } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { ScreenShell } from "../ScreenShell";

function StatusChip({ state }: { state: PermissionState }) {
  const label = useDict().launcher.permissions.states[state];
  return <StateBadge tone={PERMISSION_STATE_TONE[state]} label={label} />;
}

function PermissionRowView({
  row,
  permissions,
}: {
  row: PermissionRow;
  permissions: PermissionsApi;
}) {
  const dict = useDict();
  const copy = permissionRowCopy(row.kind, dict);
  const buttons = dict.settings.permissions;
  const state = permissions.status[row.kind];
  const granted = state === "granted";
  return (
    <div
      role="group"
      aria-label={copy.title}
      className="grid grid-cols-[1.25rem_minmax(0,1fr)_14rem] items-center gap-x-3 px-3 py-2.5"
    >
      <row.icon className={cn("size-4.5", granted ? "text-fg" : "text-fg-subtle")} aria-hidden />

      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-body">{copy.title}</span>
          <StatusChip state={state} />
          <span className="text-hint text-fg-subtle/80">{permissionNeedLabel(row.need, dict)}</span>
        </div>
        <p className="min-h-9 text-caption text-fg-subtle">{copy.purpose}</p>
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
              {buttons.openSettings}
            </Button>
            <RequestPermissionButton
              permissions={permissions}
              kind={row.kind}
              label={buttons.grant}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function PermissionsScreen({ permissions }: { permissions: PermissionsApi }) {
  const copy = useDict().launcher.permissions;
  return (
    <ScreenShell
      screen="permissions"
      actions={
        <Button variant="ghost" size="sm" onClick={() => void permissions.refresh()}>
          {copy.recheck}
        </Button>
      }
    >
      <SettingGroup title={copy.title} description={copy.description}>
        {PERMISSION_ROWS.map((row) => (
          <PermissionRowView key={row.kind} row={row} permissions={permissions} />
        ))}
      </SettingGroup>
    </ScreenShell>
  );
}
