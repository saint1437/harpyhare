import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { listIdentities, setAppIdentity } from "@/ipc/commands";
import type { IdentityInfo } from "@/ipc/types";
import { queryKeys } from "@/lib/query-client";
import { cn } from "@/lib/utils";

const ORIGINAL_IDENTITY_ID = "";
const IDENTITIES_STALE_MS = Infinity;

interface IdentityPanelProps {
  currentIdentityId: string;
}

export function IdentityPanel({ currentIdentityId }: IdentityPanelProps) {
  const { data } = useQuery({
    queryKey: queryKeys.identities,
    queryFn: listIdentities,
    staleTime: IDENTITIES_STALE_MS,
  });
  const identities = data ?? [];
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (id: string) => {
    if (pendingId !== null || id === currentIdentityId) return;
    setError(null);
    setPendingId(id);
    setAppIdentity(id).catch((e: unknown) => {
      setError(String(e));
      setPendingId(null);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Облик приложения</SectionLabel>
      <p className="max-w-prose text-caption text-muted-foreground">
        Меняет имя и иконку процесса везде — в Dock, ⌘-Tab, Finder и Activity Monitor. Приложение
        переименуется и перезапустится. Работает только в собранном .app — в режиме разработки (npm
        run tauri dev) недоступно.
      </p>
      <div className="grid grid-cols-4 gap-2.5">
        {identities.map((identity) => (
          <IdentityTile
            key={identity.id}
            identity={identity}
            active={identity.id === currentIdentityId}
            pending={pendingId === identity.id}
            disabled={pendingId !== null}
            onClick={() => {
              apply(identity.id);
            }}
          />
        ))}
      </div>
      {currentIdentityId !== ORIGINAL_IDENTITY_ID && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={pendingId !== null}
          onClick={() => {
            apply(ORIGINAL_IDENTITY_ID);
          }}
        >
          {pendingId === ORIGINAL_IDENTITY_ID ? "Возвращаю…" : "Вернуть оригинал"}
        </Button>
      )}
      {error !== null && <span className="text-caption text-destructive">{error}</span>}
    </div>
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
        "flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center ring-1 ring-border transition-colors",
        active ? "bg-primary/10 ring-primary" : "bg-card/60 hover:bg-card",
        disabled && !active && !pending && "opacity-50",
      )}
    >
      <img
        src={`data:image/png;base64,${identity.iconPngBase64}`}
        alt={identity.displayName}
        className="size-12 rounded-[10px]"
      />
      <span className="text-caption text-foreground/80">
        {pending ? "Применяю…" : identity.displayName}
      </span>
    </button>
  );
}
