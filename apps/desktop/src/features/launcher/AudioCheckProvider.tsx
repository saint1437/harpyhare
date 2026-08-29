import { useMemo, type ReactNode } from "react";
import { useAudioCheck } from "@/hooks/useAudioCheck";
import { AudioCheckControlContext, AudioLevelContext, type AudioCheckControl } from "./audio-check";

/**
 * Owns `useAudioCheck` for the whole launcher window — one instance, alive
 * across screen switches, which is what lets the header keep saying «Слушаю»
 * while the user walks away from «Старт» mid-check.
 *
 * `children` is passed in from above rather than built here, so the ten renders
 * a second the level costs stop at this component: the child element is the same
 * object every time and React clones it instead of re-rendering the tree under
 * it. Only `LevelMeter`, which reads the level context, wakes up.
 */
export function AudioCheckProvider({ children }: { children: ReactNode }) {
  const { level, running, source, result, run } = useAudioCheck();
  const control = useMemo<AudioCheckControl>(
    () => ({ running, source, result, run }),
    [running, source, result, run],
  );
  return (
    <AudioCheckControlContext.Provider value={control}>
      <AudioLevelContext.Provider value={level}>{children}</AudioLevelContext.Provider>
    </AudioCheckControlContext.Provider>
  );
}
