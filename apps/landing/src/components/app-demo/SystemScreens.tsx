import { Check, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { DEMO_VERSION } from "./demo-data";
import { AppGhostButton, AppPrimaryButton, SettingGroup } from "./ui";

const CHECK_DELAY_MS = 900;

interface PermissionMeta {
  id: string;
  label: string;
  hint: string;
  required: boolean;
}

const PERMISSIONS: PermissionMeta[] = [
  {
    id: "audio",
    label: "Запись системного звука",
    hint: "Без него приложение не слышит собеседника — запуск заблокирован.",
    required: true,
  },
  {
    id: "screen",
    label: "Запись экрана",
    hint: "Нужен только снимку области экрана.",
    required: false,
  },
];

function PermissionRow({
  permission,
  granted,
  onGrant,
}: {
  permission: PermissionMeta;
  granted: boolean;
  onGrant: () => void;
}) {
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
              необязательный
            </span>
          )}
        </div>
        <p className="mt-0.5 min-h-9 text-app-caption text-app-muted">{permission.hint}</p>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        {granted ? (
          <span className="inline-flex items-center gap-1.5 text-app-caption text-app-muted">
            <Check className="size-3.5" />
            Доступ выдан
          </span>
        ) : (
          <>
            <AppGhostButton>Настройки</AppGhostButton>
            <AppPrimaryButton className="h-7 min-w-18" onClick={onGrant}>
              Выдать
            </AppPrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}

export function PermissionsScreen() {
  const [granted, setGranted] = useState<string[]>(["audio"]);
  return (
    <SettingGroup
      title="Системные разрешения"
      description="Запрашиваются только по кнопке — сами по себе окна macOS не всплывают."
    >
      {PERMISSIONS.map((permission) => (
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
    <SettingGroup title="Версия" description="Обновления приходят подписанным бандлом.">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <span className="font-mono text-app-body text-app-fg">{DEMO_VERSION}</span>
          <p className="mt-0.5 text-app-caption text-app-muted">
            {state === "checking" && "Проверяю…"}
            {state === "latest" && "Установлена последняя версия"}
            {state === "idle" && "Проверка выполняется автоматически раз в шесть часов"}
          </p>
        </div>
        <AppPrimaryButton onClick={check} disabled={state === "checking"}>
          <Download />
          Проверить
        </AppPrimaryButton>
      </div>
    </SettingGroup>
  );
}
