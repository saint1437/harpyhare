import { createContext, useContext } from "react";
import type { AudioCheckApi } from "@/hooks/useAudioCheck";

/**
 * The sound check, minus its live level.
 *
 * `audio-level` arrives every 100 ms for the five seconds the check runs, and
 * the level is read by exactly one 40px bar. Kept in the same object as `run`
 * and `result` it re-rendered the entire launcher — header, sidebar, the active
 * screen and every Radix control on it — ten times a second, so the two travel
 * separately: this half only changes when the check starts, ends or answers.
 */
export type AudioCheckControl = Omit<AudioCheckApi, "level">;

export const AudioCheckControlContext = createContext<AudioCheckControl | null>(null);
export const AudioLevelContext = createContext(0);

export function useAudioCheckControl(): AudioCheckControl {
  const control = useContext(AudioCheckControlContext);
  if (control === null) throw new Error("useAudioCheckControl used outside AudioCheckProvider");
  return control;
}

export function useAudioLevel(): number {
  return useContext(AudioLevelContext);
}
