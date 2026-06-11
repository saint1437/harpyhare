import { Button } from "@/components/ui/button";

export interface PermissionBannerProps {
  onOpenSettings: () => void;
}

export function PermissionBanner({ onOpenSettings }: PermissionBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-xl bg-destructive/10 px-3 py-2.5 ring-1 ring-destructive/30 ring-inset">
      <span className="text-[12.5px] text-destructive">
        Нет разрешения на запись системного звука
      </span>
      <Button variant="ghost" size="sm" onClick={onOpenSettings}>
        Открыть настройки
      </Button>
    </div>
  );
}
