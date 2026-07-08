import { cn } from "@/lib/cn";

const BAR_HEIGHTS = [10, 18, 13, 22, 12];

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
          className={cn("w-[3px] rounded-full bg-primary", animated && "eq-bar")}
          style={{
            height: `${height}px`,
            animationDelay: animated ? `${index * 0.12}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}
