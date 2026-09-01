import {
  ORB_SIZE_INLINE,
  ORB_THEME,
  ThinkingOrb,
  type OrbState,
} from "@/components/ui/thinking-orbs";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export function StatusOrb({ state }: { state: OrbState }) {
  const reducedMotion = usePrefersReducedMotion();
  if (reducedMotion) return null;
  return (
    <span
      className="flex shrink-0 items-center justify-center self-center"
      style={{ width: ORB_SIZE_INLINE, height: ORB_SIZE_INLINE }}
      aria-hidden
    >
      <ThinkingOrb state={state} size={ORB_SIZE_INLINE} theme={ORB_THEME} />
    </span>
  );
}
