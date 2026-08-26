import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { autoModeActive, startAutoMode, stopAutoMode, takeAutoModeError } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { AutoTurn } from "@/ipc/types";
import {
  insertTurn,
  NO_TURN_SUBMITTED,
  planManualSubmission,
  planSubmission,
  turnsAfter,
  type SubmissionPlan,
} from "@/lib/auto-turns";
import { asAppError } from "@/lib/errors";
import { notifyAppError } from "@/lib/notifications";

const SUBMIT_DEBOUNCE_MS = 900;

export interface AutoModeApi {
  active: boolean;
  turns: AutoTurn[];
  /** Реплики, ещё не ушедшие в чат: их и отправит «Ответить». */
  pending: AutoTurn[];
  submittedThrough: number;
  toggle: () => void;
  answer: () => void;
}

export function useAutoMode(onSubmit: (text: string) => boolean, instant: boolean): AutoModeApi {
  const [active, setActive] = useState(false);
  const [turns, setTurns] = useState<AutoTurn[]>([]);
  const [submittedThrough, setSubmittedThrough] = useState(NO_TURN_SUBMITTED);

  const turnsRef = useRef<AutoTurn[]>([]);
  const submittedThroughRef = useRef(NO_TURN_SUBMITTED);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);
  // Режим читается из рефа: подписки на события живут одну сессию окна, и смена
  // настройки не должна их пересоздавать — иначе реплика, пришедшая в этот момент, теряется.
  const instantRef = useRef(instant);
  useEffect(() => {
    instantRef.current = instant;
  }, [instant]);

  const advanceThrough = useCallback((seq: number) => {
    submittedThroughRef.current = seq;
    setSubmittedThrough(seq);
  }, []);

  const flush = useCallback(
    (plan: SubmissionPlan | null) => {
      if (plan === null) return;
      // The cursor advances only on an accepted submission: when the chat is busy
      // streaming, the turn is not lost — it ships with the next window.
      if (!onSubmitRef.current(plan.text)) return;
      advanceThrough(plan.throughSeq);
    },
    [advanceThrough],
  );

  const flushInstant = useCallback(() => {
    flush(planSubmission(turnsRef.current, submittedThroughRef.current));
  }, [flush]);

  const answer = useCallback(() => {
    flush(planManualSubmission(turnsRef.current, submittedThroughRef.current));
  }, [flush]);

  useEffect(
    () =>
      onEvent("auto-turn", (turn) => {
        turnsRef.current = insertTurn(turnsRef.current, turn);
        setTurns(turnsRef.current);
        if (!instantRef.current) return;
        clearTimeout(submitTimerRef.current);
        submitTimerRef.current = setTimeout(flushInstant, SUBMIT_DEBOUNCE_MS);
      }),
    [flushInstant],
  );

  useEffect(() => onEvent("auto-answer", answer), [answer]);

  useEffect(
    () =>
      onEvent("auto-mode-changed", ({ active: next }) => {
        setActive(next);
        if (next) return;
        clearTimeout(submitTimerRef.current);
        turnsRef.current = [];
        setTurns([]);
        advanceThrough(NO_TURN_SUBMITTED);
      }),
    [advanceThrough],
  );

  useEffect(() => onEvent("auto-mode-error", notifyAppError), []);

  useEffect(() => {
    let live = true;
    void autoModeActive().then((running) => {
      if (live) setActive(running);
    });
    // A start failure at HUD launch lands before the auto-mode-error
    // subscription exists (the emit goes into a not-yet-mounted webview) —
    // Rust stores it and we pull it once on mount.
    void takeAutoModeError().then((pending) => {
      if (live && pending) notifyAppError(pending);
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

  const toggle = useCallback(() => {
    if (active) {
      void stopAutoMode();
      return;
    }
    void startAutoMode().catch((e: unknown) => {
      notifyAppError(asAppError(e));
    });
  }, [active]);

  const pending = useMemo(() => turnsAfter(turns, submittedThrough), [turns, submittedThrough]);

  return { active, turns, pending, submittedThrough, toggle, answer };
}
