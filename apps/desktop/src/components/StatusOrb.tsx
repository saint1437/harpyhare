import {
  ORB_SIZE_INLINE,
  ORB_THEME,
  ThinkingOrb,
  type OrbState,
} from "@/components/ui/thinking-orbs";

export const RECORDING_ORB_STATE: OrbState = "listening";

const RECORDING_DOT_CLASS = "size-1.5 rounded-full bg-recording";

const canvasOrbsAvailable = () => typeof window.matchMedia === "function";

export function StatusOrb({ state }: { state: OrbState }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center self-center"
      style={{ width: ORB_SIZE_INLINE, height: ORB_SIZE_INLINE }}
      aria-hidden
    >
      {state === RECORDING_ORB_STATE ? (
        <span className={RECORDING_DOT_CLASS} />
      ) : (
        canvasOrbsAvailable() && (
          <ThinkingOrb state={state} size={ORB_SIZE_INLINE} theme={ORB_THEME} />
        )
      )}
    </span>
  );
}
