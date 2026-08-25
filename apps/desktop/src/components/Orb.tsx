import { useWindowDrag } from "@/hooks/useWindowDrag";
import { listeningAnnouncement, type ListeningState } from "@/lib/listening";
import { cn } from "@/lib/utils";
import { LiveRegion } from "./LiveRegion";

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
export type OrbState = ListeningState | "answer";

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

const LABEL: Record<OrbState, string> = {
  recording: "Идёт запись — нажмите, чтобы развернуть",
  auto: "Автослушание — нажмите, чтобы развернуть",
  armed: "Наготове — нажмите, чтобы развернуть",
  transcribing: "Распознаю — нажмите, чтобы развернуть",
  answer: "Ответ готов — нажмите, чтобы развернуть",
  off: "Не слушает — нажмите, чтобы развернуть",
  error: "Ошибка — нажмите, чтобы развернуть",
};

export function Orb({ state, onExpand }: { state: OrbState; onExpand: () => void }) {
  const onDragMouseDown = useWindowDrag();
  return (
    <div
      className="grid h-screen w-screen place-items-center bg-transparent"
      onMouseDown={onDragMouseDown}
    >
      <LiveRegion message={state === "answer" ? "Ответ готов" : listeningAnnouncement(state)} />
      <button
        type="button"
        title={LABEL[state]}
        aria-label={LABEL[state]}
        onClick={onExpand}
        className={cn(
          "relative grid size-14 place-items-center rounded-full bg-elevated shadow-modal ring-1 ring-line outline-none",
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
            SPINS.includes(state) && "orb-spin border-transparent",
          )}
          aria-hidden
        />
        <span className={cn("size-2.5 rounded-full", CORE[state])} aria-hidden />
      </button>
    </div>
  );
}
