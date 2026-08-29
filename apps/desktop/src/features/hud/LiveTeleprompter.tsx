import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { toReadingText } from "@/lib/teleprompter";
import { useStreamPartial } from "@/state/stream";
import { Teleprompter, type TeleprompterProps } from "./Teleprompter";

/** Where the reading was left off, and for which text — kept across openings. */
export interface TeleprompterResume {
  text: string;
  offset: number;
}

export type LiveTeleprompterProps = Omit<
  TeleprompterProps,
  "text" | "initialOffset" | "onPersist"
> & {
  chatId: string;
  /** Shown while nothing is streaming — the last finished answer. */
  fallbackText: string;
  resume: boolean;
  resumeRef: RefObject<TeleprompterResume>;
  onPersistSettings: (speed: number, fontSize: number) => void;
};

/**
 * Ten refreshes a second, not sixty. `toReadingText` runs thirteen regex passes
 * over the WHOLE answer and its result is the text of a tall `whitespace-pre-wrap`
 * block, so every frame of the reveal cost a full re-strip plus a re-layout of
 * the reading column — to move the text by a couple of characters nobody can
 * read that fast anyway.
 */
const READING_REFRESH_MS = 100;

/**
 * The freshest `value`, but handed on no more often than once per `intervalMs`.
 * Leading edge, so opening the panel shows the right text at once; trailing
 * call, so the LAST value is always the one that lands — the reading text must
 * be exact when the stream ends, not merely usually exact.
 */
function useCoalescedValue<T>(value: T, intervalMs: number): T {
  const [shown, setShown] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  const shownAt = useRef(0);

  useEffect(() => {
    if (value === shown) return;
    const wait = Math.max(0, intervalMs - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      shownAt.current = Date.now();
      setShown(latest.current);
    }, wait);
    return () => {
      clearTimeout(timer);
    };
  }, [value, shown, intervalMs]);

  return shown;
}

/**
 * Mounted only while the teleprompter is open, and that is the point: it is the
 * second reader of the live text, and subscribing to it from the root would
 * undo the whole reason the stream slice exists. `toReadingText` runs thirteen
 * regex passes over the answer, so a closed teleprompter must not pay for them.
 */
export function LiveTeleprompter({
  chatId,
  fallbackText,
  resume,
  resumeRef,
  onPersistSettings,
  ...rest
}: LiveTeleprompterProps) {
  const partial = useStreamPartial(chatId);
  const source = useCoalescedValue(partial !== "" ? partial : fallbackText, READING_REFRESH_MS);
  const text = useMemo(() => toReadingText(source), [source]);
  // The saved offset belongs to the text it was taken from: resuming into a
  // different answer would land at an arbitrary point in it.
  const initialOffset = resume && resumeRef.current.text === text ? resumeRef.current.offset : 0;
  return (
    <Teleprompter
      {...rest}
      text={text}
      initialOffset={initialOffset}
      onPersist={(speed, fontSize, offset) => {
        resumeRef.current = { text, offset };
        onPersistSettings(speed, fontSize);
      }}
    />
  );
}
