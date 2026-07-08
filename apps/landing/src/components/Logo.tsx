import { cn } from "@/lib/cn";

export function Logo({ className, showMark = true }: { className?: string; showMark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      {showMark && (
        <img src="./logo.png" alt="" aria-hidden draggable={false} className="h-[22px] w-auto" />
      )}
      <span className="text-[15px] font-semibold tracking-tight text-fg">harpyhare</span>
    </span>
  );
}
