import { Button } from "@/components/ui/button";

export interface PermissionBannerProps {
  onOpenSettings: () => void;
}

export function PermissionBanner({ onOpenSettings }: PermissionBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 bg-destructive/10 ring-1 ring-inset ring-destructive/30">
      <span className="text-[12.5px] text-destructive">
        Нет разрешения на запись системного звука
      </span>
      <Button variant="ghost" size="sm" onClick={onOpenSettings}>
        Открыть настройки
      </Button>
    </div>
  );
}
