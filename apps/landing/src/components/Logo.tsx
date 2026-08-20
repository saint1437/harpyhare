import { cn } from "@/lib/cn";
import { SITE_NAME } from "@/lib/site";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[13px] font-bold tracking-[0.06em] text-fg uppercase select-none sm:text-[15px]",
        className,
      )}
    >
      {SITE_NAME}
    </span>
  );
}
