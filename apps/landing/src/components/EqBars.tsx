import { cn } from "@/lib/cn";

const BAR_HEIGHTS = [6, 11, 8, 13, 7];

export function EqBars({
  animated = false,
  className,
}: {
  animated?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} aria-hidden>
      {BAR_HEIGHTS.map((height, index) => (
        <span
          key={index}
          className={cn("w-[2.5px] bg-fg", animated && "eq-bar")}
          style={{
            height: `${height}px`,
            animationDelay: animated ? `${index * 0.12}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}
