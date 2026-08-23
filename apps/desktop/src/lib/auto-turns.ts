import type { AutoTurn, Speaker } from "@/ipc/types";

export const NO_TURN_SUBMITTED = -1;

const NOT_FOUND = -1;

const SPEAKER_LABEL: Record<Speaker, string> = {
  interviewer: "Интервьюер",
  user: "Я",
};

export function speakerLabel(speaker: Speaker): string {
  return SPEAKER_LABEL[speaker];
}

const LABEL_SEPARATOR = ": ";
const BLOCK_SEPARATOR = "\n";
const SAME_SPEAKER_SEPARATOR = " ";

export interface SubmissionPlan {
  text: string;
  throughSeq: number;
}

interface SpeakerBlock {
  speaker: Speaker;
  text: string;
}

export function insertTurn(turns: AutoTurn[], turn: AutoTurn): AutoTurn[] {
  if (turns.some((t) => t.seq === turn.seq)) return turns;
  const at = turns.findIndex((t) => t.seq > turn.seq);
  if (at === NOT_FOUND) return [...turns, turn];
  return [...turns.slice(0, at), turn, ...turns.slice(at)];
}

export function turnsAfter(turns: AutoTurn[], seq: number): AutoTurn[] {
  return turns.filter((t) => t.seq > seq);
}

function speakerBlocks(turns: AutoTurn[]): SpeakerBlock[] {
  return turns.reduce<SpeakerBlock[]>((blocks, turn) => {
    const last = blocks[blocks.length - 1];
    if (last?.speaker === turn.speaker) {
      last.text += SAME_SPEAKER_SEPARATOR + turn.text;
      return blocks;
    }
    return [...blocks, { speaker: turn.speaker, text: turn.text }];
  }, []);
}

export function renderTurns(turns: AutoTurn[]): string {
  const blocks = speakerBlocks(turns);
  const everyoneIsTheInterviewer = blocks.every((b) => b.speaker === "interviewer");
  if (everyoneIsTheInterviewer) {
    return blocks.map((b) => b.text).join(SAME_SPEAKER_SEPARATOR);
  }
  return blocks
    .map((b) => SPEAKER_LABEL[b.speaker] + LABEL_SEPARATOR + b.text)
    .join(BLOCK_SEPARATOR);
}

// A request goes out only when the newest unsent turn belongs to the interviewer.
// The user's own turns ride along as context but never trigger a request themselves.
export interface TurnDispatch {
  interrupt: boolean;
  send: boolean;
}

// The user talking over a streaming answer is not an interruption — they are reading
// it aloud, which is the whole point of the product. Only a fresh interviewer turn
// supersedes an answer in flight, and `planSubmission` has already established that
// the newest unsent turn is the interviewer's by the time this is asked.
export function planDispatch(text: string, streaming: boolean): TurnDispatch {
  if (text.trim() === "") return { interrupt: false, send: false };
  return { interrupt: streaming, send: true };
}

function planFrom(fresh: AutoTurn[]): SubmissionPlan | null {
  const newest = fresh[fresh.length - 1];
  if (newest === undefined) return null;
  const text = renderTurns(fresh);
  if (text.trim() === "") return null;
  return { text, throughSeq: newest.seq };
}

export function planSubmission(
  turns: AutoTurn[],
  submittedThroughSeq: number,
): SubmissionPlan | null {
  const fresh = turnsAfter(turns, submittedThroughSeq);
  if (fresh[fresh.length - 1]?.speaker !== "interviewer") return null;
  return planFrom(fresh);
}

// Ручной ответ отправляет всё услышанное с прошлого раза: нажали сами, и ждать
// реплики интервьюера, как в мгновенном режиме, здесь нечего — иначе кнопка
// молчала бы ровно там, где её нажимают чаще всего: после своей же фразы.
export function planManualSubmission(
  turns: AutoTurn[],
  submittedThroughSeq: number,
): SubmissionPlan | null {
  return planFrom(turnsAfter(turns, submittedThroughSeq));
}
