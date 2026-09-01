import {
  ORB_SIZE_INLINE,
  ORB_STATE_IDLE,
  ORB_THEME,
  ThinkingOrb,
  type OrbState,
} from "@/components/ui/thinking-orbs";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

const STATIC_DOT_SIZE_PX = 6;

function StaticStatusDot({ state }: { state: OrbState }) {
  return (
    <span
      className={cn(
        "rounded-full",
        state === ORB_STATE_IDLE ? "bg-muted-foreground" : "bg-primary",
      )}
      style={{ width: STATIC_DOT_SIZE_PX, height: STATIC_DOT_SIZE_PX }}
    />
  );
}

export function StatusOrb({ state }: { state: OrbState }) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <span
      className="flex shrink-0 items-center justify-center self-center"
      style={{ width: ORB_SIZE_INLINE, height: ORB_SIZE_INLINE }}
      aria-hidden
    >
      {reducedMotion ? (
        <StaticStatusDot state={state} />
      ) : (
        <ThinkingOrb state={state} size={ORB_SIZE_INLINE} theme={ORB_THEME} />
      )}
    </span>
  );
}
