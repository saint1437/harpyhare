import { cn } from "@/lib/utils";

const BAR_HEIGHTS_PX = [8, 14, 10, 17, 9];
const BAR_STAGGER_S = 0.12;

export interface EqBarsProps {
  animated: boolean;
  barClass: string;
}

export function EqBars({ animated, barClass }: EqBarsProps) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[2.5px]" aria-hidden>
      {BAR_HEIGHTS_PX.map((height, index) => (
        <span
          key={index}
          className={cn("w-[2.5px] rounded-full", barClass, animated && "eq-bar")}
          style={{
            height: `${String(height)}px`,
            animationDelay: animated ? `${String(index * BAR_STAGGER_S)}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}
