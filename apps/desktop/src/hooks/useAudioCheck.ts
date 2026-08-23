import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioCheck, AudioSource } from "@/ipc/bindings";
import { checkAudioSource } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { asAppError, type AppError } from "@/lib/errors";

/**
 * Разрешение выдано — это ещё не «звук идёт». Проверка слушает выбранный
 * источник несколько секунд и показывает и уровень, и распознанный текст:
 * вторая половина заодно доказывает, что ключ Groq рабочий.
 */
export interface AudioCheckState {
  running: AudioSource | null;
  level: number;
  source: AudioSource | null;
  result: AudioCheck | null;
  error: AppError | null;
}

export interface AudioCheckApi extends AudioCheckState {
  run: (source: AudioSource) => void;
}

const IDLE: AudioCheckState = {
  running: null,
  level: 0,
  source: null,
  result: null,
  error: null,
};

export function useAudioCheck(): AudioCheckApi {
  const [state, setState] = useState<AudioCheckState>(IDLE);
  const runningRef = useRef<AudioSource | null>(null);

  useEffect(
    () =>
      onEvent("audio-level", ({ level }) => {
        if (runningRef.current === null) return;
        setState((prev) => ({ ...prev, level }));
      }),
    [],
  );

  useEffect(
    () => () => {
      runningRef.current = null;
    },
    [],
  );

  const run = useCallback((source: AudioSource) => {
    if (runningRef.current !== null) return;
    runningRef.current = source;
    setState({ running: source, level: 0, source, result: null, error: null });
    void checkAudioSource(source)
      .then((result) => {
        if (runningRef.current !== source) return;
        setState({ running: null, level: 0, source, result, error: null });
      })
      .catch((e: unknown) => {
        if (runningRef.current !== source) return;
        setState({ running: null, level: 0, source, result: null, error: asAppError(e) });
      })
      .finally(() => {
        if (runningRef.current === source) runningRef.current = null;
      });
  }, []);

  return { ...state, run };
}
