import type { CaptureTone } from "@/lib/listening";
import { cn } from "@/lib/utils";

const BAR_HEIGHTS_PX = [8, 14, 10, 17, 9];
const BAR_STAGGER_S = 0.12;

const TONE_CLASS: Record<CaptureTone, string> = {
  listening: "bg-listening",
  armed: "bg-listening-dim",
  processing: "bg-processing",
  danger: "bg-danger",
  idle: "bg-fg-subtle",
};

export interface CaptureMeterProps {
  tone: CaptureTone;
  animated: boolean;
}

export function CaptureMeter({ tone, animated }: CaptureMeterProps) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[2.5px]" aria-hidden>
      {BAR_HEIGHTS_PX.map((height, index) => (
        <span
          key={index}
          className={cn("w-[2.5px] rounded-full", TONE_CLASS[tone], animated && "eq-bar")}
          style={{
            height: `${String(height)}px`,
            animationDelay: animated ? `${String(index * BAR_STAGGER_S)}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}
