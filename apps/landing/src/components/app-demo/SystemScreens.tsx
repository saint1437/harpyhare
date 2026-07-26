import { Check, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PermissionCopy } from "@/i18n/demo-types";
import { cn } from "@/lib/cn";
import { useCopy } from "./copy";
import { AppGhostButton, AppPrimaryButton, SettingGroup } from "./ui";

const CHECK_DELAY_MS = 900;

function PermissionRow({
  permission,
  granted,
  onGrant,
}: {
  permission: PermissionCopy;
  granted: boolean;
  onGrant: () => void;
}) {
  const copy = useCopy().launcher.permissions;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_10.75rem] items-center gap-x-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              granted ? "bg-app-primary" : "bg-app-destructive",
            )}
            aria-hidden
          />
          <span className="text-app-body text-app-fg">{permission.label}</span>
          {!permission.required && (
            <span className="rounded border border-app-border px-1 text-app-hint text-app-muted">
              {copy.optionalBadge}
            </span>
          )}
        </div>
        <p className="mt-0.5 min-h-9 text-app-caption text-app-muted">{permission.hint}</p>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        {granted ? (
          <span className="inline-flex items-center gap-1.5 text-app-caption text-app-muted">
            <Check className="size-3.5" />
            {copy.granted}
          </span>
        ) : (
          <>
            <AppGhostButton>{copy.openSettings}</AppGhostButton>
            <AppPrimaryButton className="h-7 min-w-18" onClick={onGrant}>
              {copy.grant}
            </AppPrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}

export function PermissionsScreen() {
  const copy = useCopy().launcher.permissions;
  const [granted, setGranted] = useState<string[]>(["audio"]);
  return (
    <SettingGroup {...copy.group}>
      {copy.items.map((permission) => (
        <PermissionRow
          key={permission.id}
          permission={permission}
          granted={granted.includes(permission.id)}
          onGrant={() => {
            setGranted((prev) => [...prev, permission.id]);
          }}
        />
      ))}
    </SettingGroup>
  );
}

export function UpdatesScreen() {
  const demo = useCopy();
  const copy = demo.launcher.updates;
  const [state, setState] = useState<"idle" | "checking" | "latest">("idle");
  const timerRef = useRef(0);

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
    },
    [],
  );

  const check = () => {
    setState("checking");
    timerRef.current = window.setTimeout(() => {
      setState("latest");
    }, CHECK_DELAY_MS);
  };

  return (
    <SettingGroup {...copy.group}>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <span className="font-mono text-app-body text-app-fg">{demo.version}</span>
          <p className="mt-0.5 text-app-caption text-app-muted">
            {state === "checking" && copy.checking}
            {state === "latest" && copy.latest}
            {state === "idle" && copy.auto}
          </p>
        </div>
        <AppPrimaryButton onClick={check} disabled={state === "checking"}>
          <Download />
          {copy.check}
        </AppPrimaryButton>
      </div>
    </SettingGroup>
  );
}
