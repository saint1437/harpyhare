import { useCallback, useEffect, useRef, useState } from "react";
import { autoModeActive, startAutoMode, stopAutoMode } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { AutoTurn } from "@/ipc/types";
import { insertTurn, NO_TURN_SUBMITTED, planSubmission } from "@/lib/auto-turns";
import { asAppError, type AppError } from "@/lib/errors";

const SUBMIT_DEBOUNCE_MS = 900;

export interface AutoModeApi {
  active: boolean;
  turns: AutoTurn[];
  error: AppError | null;
  toggle: () => void;
  clearError: () => void;
}

export function useAutoMode(onSubmit: (text: string) => boolean): AutoModeApi {
  const [active, setActive] = useState(false);
  const [turns, setTurns] = useState<AutoTurn[]>([]);
  const [error, setError] = useState<AppError | null>(null);

  const turnsRef = useRef<AutoTurn[]>([]);
  const submittedThroughRef = useRef(NO_TURN_SUBMITTED);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const flushSubmission = useCallback(() => {
    const plan = planSubmission(turnsRef.current, submittedThroughRef.current);
    if (plan === null) return;
    // The cursor advances only on an accepted submission: when the chat is busy
    // streaming, the turn is not lost — it ships with the next window.
    if (!onSubmitRef.current(plan.text)) return;
    submittedThroughRef.current = plan.throughSeq;
  }, []);

  useEffect(
    () =>
      onEvent("auto-turn", (turn) => {
        turnsRef.current = insertTurn(turnsRef.current, turn);
        setTurns(turnsRef.current);
        clearTimeout(submitTimerRef.current);
        submitTimerRef.current = setTimeout(flushSubmission, SUBMIT_DEBOUNCE_MS);
      }),
    [flushSubmission],
  );

  useEffect(
    () =>
      onEvent("auto-mode-changed", ({ active: next }) => {
        setActive(next);
        if (next) return;
        clearTimeout(submitTimerRef.current);
        turnsRef.current = [];
        submittedThroughRef.current = NO_TURN_SUBMITTED;
        setTurns([]);
      }),
    [],
  );

  useEffect(() => onEvent("auto-mode-error", setError), []);

  useEffect(() => {
    let live = true;
    void autoModeActive().then((running) => {
      if (live) setActive(running);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () => () => {
      clearTimeout(submitTimerRef.current);
    },
    [],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const toggle = useCallback(() => {
    if (active) {
      void stopAutoMode();
      return;
    }
    setError(null);
    void startAutoMode().catch((e: unknown) => {
      setError(asAppError(e));
    });
  }, [active]);

  return { active, turns, error, toggle, clearError };
}
