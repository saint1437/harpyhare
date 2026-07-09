import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WarningTone = "error" | "info";

export interface WarningBannerProps {
  actionLabel: string;
  onAction: () => void;
  children: ReactNode;
  tone?: WarningTone;
}

const TONE_STYLES: Record<WarningTone, string> = {
  error: "bg-destructive/10 text-destructive ring-destructive/30",
  info: "bg-white/5 text-muted-foreground ring-white/10",
};

export function WarningBanner({
  actionLabel,
  onAction,
  children,
  tone = "error",
}: WarningBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-inset",
        TONE_STYLES[tone],
      )}
    >
      <span className="text-[12.5px]">{children}</span>
      <Button variant="ghost" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
