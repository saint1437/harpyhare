import { ANSWER_STYLES } from "@/ipc/bindings";
import pack from "../../../../config/answer-styles.json";

export type AnswerStyle = (typeof ANSWER_STYLES)[number];

export const ANSWER_STYLE_LABELS: Record<AnswerStyle, string> = {
  detailed: "Много текста",
  concise: "Меньше текста",
};

const CONCISE_STYLE: AnswerStyle = "concise";
const BLOCK_SEPARATOR = "\n\n";

const CONCISE_BY_PRESET: Record<string, string> = pack.concise.byPreset;

export function answerStyleBlock(style: string, presetId: string): string {
  if (style !== CONCISE_STYLE) return "";
  const body = CONCISE_BY_PRESET[presetId] ?? pack.concise.default;
  return [pack.concise.precedence, body].join(BLOCK_SEPARATOR);
}
