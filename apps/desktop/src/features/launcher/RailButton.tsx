import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One button for both rails — the sidebar's screens and the nested settings tabs.
 * They are the same control at two scales, and the shared part is precisely the
 * part that drifts silently: the focus ring, the hover/active tones and the
 * active item's left marker. Both rails collapse to icons below 900px (two text
 * columns ate a third of the window), so the label is hidden at the same
 * breakpoint on both.
 */
export function RailButton<T extends string>({
  id,
  label,
  title,
  icon: Icon,
  active,
  tabProps,
  className,
  onSelect,
  children,
}: {
  id: T;
  label: string;
  title: string;
  icon: LucideIcon;
  active: boolean;
  tabProps: Record<string, unknown>;
  className?: string;
  onSelect: (id: T) => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...tabProps}
      title={title}
      onClick={() => {
        onSelect(id);
      }}
      className={cn(
        "relative flex items-center justify-center gap-2 rounded-md px-0 text-body transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid min-[900px]:justify-start min-[900px]:px-2",
        active
          ? "bg-surface-active text-fg"
          : "text-fg-subtle hover:bg-surface hover:text-fg active:bg-surface-active",
        className,
      )}
    >
      {active && (
        <span
          className="absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-mark"
          aria-hidden
        />
      )}
      <Icon className="size-4 shrink-0" />
      <span className="hidden truncate min-[900px]:inline">{label}</span>
      {children}
    </button>
  );
}
