import pool from "../../../../config/presets.json";
import { withBaseSystemPrompt } from "./system-prompt";

export interface PromptPreset {
  id: string;
  name: string;
  text: string;
}

export const OFFICIAL_PRESETS_FALLBACK: PromptPreset[] = pool.presets;

export function isPresetFilled(preset: PromptPreset): boolean {
  return preset.name.trim() !== "" || preset.text.trim() !== "";
}

/**
 * Returns the source that goes into the chat system prompt, not the raw text
 * shown in the preset editor. The stable base rules are always present; the
 * selected preset remains the optional mode-specific section.
 */
export function presetText(presets: PromptPreset[], presetId: string): string {
  const raw = presets.find((p) => p.id === presetId)?.text ?? "";
  return withBaseSystemPrompt(raw);
}

export function mergePresets(official: PromptPreset[], user: PromptPreset[]): PromptPreset[] {
  const officialIds = new Set(official.map((p) => p.id));
  return [...official, ...user.filter((p) => !officialIds.has(p.id))];
}
