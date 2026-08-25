import { cn } from "@/lib/utils";

const BAR_HEIGHTS_PX = [8, 14, 10, 17, 9];
const BAR_STAGGER_S = 0.12;

/**
 * The five bars mean ONE thing now: sound is being captured, or was about to be.
 *
 * They used to be two components in one — the launcher's brand mark and the HUD's
 * capture indicator — separated only by which red filled them. The brand half is
 * `Wordmark`; this half never leaves the capture vocabulary.
 */
export type CaptureTone = "listening" | "armed" | "processing" | "danger" | "idle";

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
  className?: string;
}

export function CaptureMeter({ tone, animated, className }: CaptureMeterProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-[2.5px]", className)} aria-hidden>
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
