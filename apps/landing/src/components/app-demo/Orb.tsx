import { useEffect, useRef } from "react";
import type { OrbStateId } from "@/i18n/demo-types";
import { cn } from "@/lib/cn";
import { useCopy } from "./copy";

/**
 * The collapsed window.
 *
 * This is what the app's `⌘⇧H` actually does, and it is worth stating plainly
 * because the demo used to get it wrong: the window is not hidden. It shrinks
 * to an 80px transparent frame holding a 56px ball, and that ball keeps
 * answering the only question a hidden window could not — "can it still hear
 * me?". It stays always-on-top, stays cut out of a screen share, and comes back
 * on its own when an answer lands in the chat you are looking at.
 *
 * Seven states, and the motion is the state: capture BREATHES, work SPINS,
 * everything else is still. `apps/desktop/src/features/hud/Orb.tsx`.
 */
const RING: Record<OrbStateId, string> = {
  recording: "ring-app-recording",
  auto: "ring-app-recording",
  armed: "ring-app-recording-dim",
  transcribing: "ring-app-muted",
  answer: "ring-app-primary-mark",
  off: "ring-app-border-strong",
  error: "ring-app-destructive",
};

const CORE: Record<OrbStateId, string> = {
  recording: "bg-app-recording",
  auto: "bg-app-recording",
  armed: "bg-app-recording-dim",
  transcribing: "bg-app-muted",
  answer: "bg-app-primary-mark",
  off: "bg-app-subtle",
  error: "bg-app-destructive",
};

const BREATHES: OrbStateId[] = ["recording", "auto"];
const SPINS: OrbStateId[] = ["transcribing"];

export function Orb({ state, onExpand }: { state: OrbStateId; onExpand: () => void }) {
  const copy = useCopy().hud;
  const label = copy.orbLabels[state];
  const faceRef = useRef<HTMLButtonElement>(null);

  // The app focuses the ball on mount so Enter brings the window back without
  // reaching for the mouse. Here it also keeps the frame's key scope alive:
  // the chat that had focus has just unmounted underneath it.
  useEffect(() => {
    faceRef.current?.focus();
  }, []);

  return (
    <div className="grid h-full w-full place-items-center">
      <span className="sr-only" role="status">
        {state === "answer" ? copy.orbAnswerAnnouncement : label}
      </span>
      <button
        ref={faceRef}
        type="button"
        title={label}
        aria-label={label}
        onClick={onExpand}
        className="relative grid size-14 place-items-center rounded-full bg-app-surface shadow-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus focus-visible:outline-solid"
      >
        {BREATHES.includes(state) && (
          <span
            className={cn("app-breath absolute inset-0 rounded-full ring-2", RING[state])}
            aria-hidden
          />
        )}
        <span
          className={cn(
            "absolute inset-0 rounded-full ring-2",
            RING[state],
            SPINS.includes(state) && "app-orb-spin",
          )}
          aria-hidden
        />
        <span className={cn("size-2.5 rounded-full", CORE[state])} aria-hidden />
      </button>
    </div>
  );
}
