import type { RefObject } from "react";
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
  const text = toReadingText(partial !== "" ? partial : fallbackText);
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
