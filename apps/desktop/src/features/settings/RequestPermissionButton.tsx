import { Button } from "@/components/ui/button";
import { useDict } from "@/hooks/useDict";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionKind } from "@/ipc/types";

/**
 * Asking for one permission, in the three places that ask: the launcher's
 * «Доступы», the «Старт» steps and onboarding's audio step. Only the word on the
 * button differs between them — the gate does not: while ANY request is out,
 * every button is blocked, because a second TCC prompt on top of the first is
 * not a state macOS has.
 */
export function RequestPermissionButton({
  permissions,
  kind,
  label,
}: {
  permissions: PermissionsApi;
  kind: PermissionKind;
  label: string;
}) {
  const requesting = useDict().settings.permissions.requesting;
  return (
    <Button
      size="sm"
      className="min-w-18"
      disabled={permissions.pending !== null}
      onClick={() => void permissions.request(kind)}
    >
      {permissions.pending === kind ? requesting : label}
    </Button>
  );
}
