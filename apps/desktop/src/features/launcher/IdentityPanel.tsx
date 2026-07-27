import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WarningBanner } from "@/components/WarningBanner";
import { listIdentities, setAppIdentity } from "@/ipc/commands";
import type { IdentityInfo } from "@/ipc/types";
import { BRAND_NAME } from "@/lib/brand";
import { queryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";

const IDENTITIES_STALE_MS = Infinity;
const APPLY_TIMEOUT_MS = 15_000;

interface IdentityPanelProps {
  currentIdentityId: string;
}

const SKELETON_TILES = 3;

function IdentitySkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: SKELETON_TILES }, (_, index) => (
        <div
          key={index}
          className="flex animate-pulse flex-col items-center gap-2 rounded-xl bg-card p-4 ring-1 ring-border ring-inset"
        >
          <div className="size-16 rounded-[14px] bg-surface" />
          <div className="h-3 w-20 rounded-full bg-surface" />
        </div>
      ))}
    </div>
  );
}

function loadErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function IdentityPanel({ currentIdentityId }: IdentityPanelProps) {
  const {
    data,
    isPending,
    error: loadError,
  } = useQuery({
    queryKey: queryKeys.identities,
    queryFn: listIdentities,
    staleTime: IDENTITIES_STALE_MS,
  });
  const identities = data ?? [];
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmTarget = identities.find((i) => i.id === confirmId) ?? null;

  const apply = (id: string) => {
    setConfirmId(null);
    setError(null);
    setPendingId(id);
    const timeout = window.setTimeout(() => {
      setPendingId(null);
      setError("Смена облика затянулась — попробуйте ещё раз");
    }, APPLY_TIMEOUT_MS);
    setAppIdentity(id).catch((e: unknown) => {
      window.clearTimeout(timeout);
      setError(String(e));
      setPendingId(null);
    });
  };

  const requestApply = (id: string) => {
    if (pendingId !== null || id === currentIdentityId) return;
    setConfirmId(id);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-prose text-caption text-muted-foreground">
        {BRAND_NAME} маскируется под обычную программу: в Dock, переключателе окон ⌘-Tab и мониторе
        активности он показывается под выбранным именем и иконкой. Смена облика перезапускает
        приложение.
      </p>
      {isPending && <IdentitySkeleton />}
      {!isPending && loadError !== null && (
        <p className="text-caption text-destructive">
          Не удалось получить список обликов: {loadErrorText(loadError)}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {identities.map((identity) => (
          <IdentityTile
            key={identity.id}
            identity={identity}
            active={identity.id === currentIdentityId}
            pending={pendingId === identity.id}
            disabled={pendingId !== null}
            onClick={() => {
              requestApply(identity.id);
            }}
          />
        ))}
      </div>
      {error !== null && (
        <WarningBanner
          actionLabel="Понятно"
          onAction={() => {
            setError(null);
          }}
        >
          {error}
        </WarningBanner>
      )}

      <ConfirmIdentityDialog
        target={confirmTarget}
        onCancel={() => {
          setConfirmId(null);
        }}
        onConfirm={() => {
          if (confirmTarget) apply(confirmTarget.id);
        }}
      />
    </div>
  );
}

function ConfirmIdentityDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: IdentityInfo | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [shownTarget, setShownTarget] = useState(target);
  if (target !== null && target !== shownTarget) setShownTarget(target);
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Сменить облик?</DialogTitle>
        </DialogHeader>
        {shownTarget && (
          <div className="flex items-center gap-3">
            <img
              src={`data:image/png;base64,${shownTarget.iconPngBase64}`}
              alt=""
              className="size-12 shrink-0 rounded-[10px]"
            />
            <p className="text-body text-muted-foreground">
              Приложение станет выглядеть как «{shownTarget.displayName}» — сменит имя и иконку,
              затем перезапустится.
            </p>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
          <Button onClick={onConfirm}>Сменить и перезапустить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IdentityTile({
  identity,
  active,
  pending,
  disabled,
  onClick,
}: {
  identity: IdentityInfo;
  active: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-w-0 flex-col items-center gap-2 rounded-xl p-4 text-center ring-1 ring-border transition-colors ring-inset",
        active ? "bg-primary/10 ring-primary" : "bg-card hover:bg-surface",
        disabled && !active && !pending && "opacity-50",
      )}
    >
      <img
        src={`data:image/png;base64,${identity.iconPngBase64}`}
        alt={identity.displayName}
        className="size-16 rounded-[14px]"
      />
      <span className="w-full truncate text-caption text-muted-foreground">
        {pending ? "Применяю…" : identity.displayName}
      </span>
    </button>
  );
}
