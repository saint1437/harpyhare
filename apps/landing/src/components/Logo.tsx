import { cn } from "@/lib/cn";
import { EqBars } from "./EqBars";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)}>
      <EqBars />
      <span className="text-[15px] font-semibold tracking-tight text-fg">harpyhare</span>
    </span>
  );
}
