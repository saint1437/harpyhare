import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface WarningBannerProps {
  actionLabel: string;
  onAction: () => void;
  children: ReactNode;
}

export function WarningBanner({ actionLabel, onAction, children }: WarningBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-xl bg-destructive/10 px-3 py-2.5 ring-1 ring-destructive/30 ring-inset">
      <span className="text-[12.5px] text-destructive">{children}</span>
      <Button variant="ghost" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
