import { useEffect, useRef } from "react";
import { LiveRegion } from "@/components/LiveRegion";
import { useDict } from "@/hooks/useDict";
import { useOrbDrag } from "@/hooks/useOrbDrag";
import type { OrbState } from "@/lib/orb";
import { cn } from "@/lib/utils";

const RING: Record<OrbState, string> = {
  recording: "ring-listening",
  auto: "ring-listening",
  armed: "ring-listening-dim",
  transcribing: "ring-processing",
  answer: "ring-accent-mark",
  off: "ring-line-strong",
  error: "ring-danger",
};

const CORE: Record<OrbState, string> = {
  recording: "bg-listening",
  auto: "bg-listening",
  armed: "bg-listening-dim",
  transcribing: "bg-processing",
  answer: "bg-accent-mark",
  off: "bg-fg-subtle",
  error: "bg-danger",
};

/** Only capture breathes. Work spins. Everything else is still. */
const BREATHES: OrbState[] = ["recording", "auto"];
const SPINS: OrbState[] = ["transcribing"];

/**
 * The window collapsed into a ball.
 *
 * It replaces hiding outright, because a hidden window answered nothing — and
 * "another app is focused" is precisely the scenario push-to-talk was built for.
 * Collapsed, the window is still there, still always-on-top, still cut out of a
 * screen share, and still says whether it can hear you.
 *
 * The circle is drawn INSIDE a slightly larger transparent window, so the native
 * corner clip (22px on macOS, the system radius on Windows) never reaches it and
 * neither platform needs a special case.
 */
export function Orb({ state, onExpand }: { state: OrbState; onExpand: () => void }) {
  const dict = useDict();
  const label = dict.hud.orb.labels[state];
  const drag = useOrbDrag(onExpand);
  // Композер только что размонтировался вместе с окном, и фокус ушёл бы в body.
  // Забираем его на кружок: с клавиатуры Enter разворачивает окно обратно.
  const face = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    face.current?.focus();
  }, []);
  return (
    <div className="grid h-screen w-screen place-items-center bg-transparent">
      <LiveRegion
        message={
          state === "answer"
            ? dict.hud.orb.answerAnnouncement
            : dict.common.listening[state].announcement
        }
      />
      <button
        ref={face}
        type="button"
        title={label}
        aria-label={label}
        {...drag}
        className={cn(
          // Ни тёмного канта, ни shadow-modal: 64px размытия в окне 80px
          // обрезалось краем и читалось как чёрная рамка, а кант --line на
          // произвольном фоне выглядел просто чёрной обводкой. Кромка теперь
          // светлая и своя, тень — маленькая и помещается в поле окна.
          "orb-face relative grid size-14 place-items-center rounded-full bg-elevated outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid",
        )}
      >
        {BREATHES.includes(state) && (
          <span
            className={cn("listening-breath absolute inset-0 rounded-full ring-2", RING[state])}
            aria-hidden
          />
        )}
        <span
          className={cn(
            "absolute inset-0 rounded-full ring-2",
            RING[state],
            SPINS.includes(state) && "orb-spin",
          )}
          aria-hidden
        />
        <span className={cn("size-2.5 rounded-full", CORE[state])} aria-hidden />
      </button>
    </div>
  );
}
