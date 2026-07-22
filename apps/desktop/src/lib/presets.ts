import pool from "../../../../config/presets.json";

export interface PromptPreset {
  id: string;
  name: string;
  text: string;
}

export const OFFICIAL_PRESETS_FALLBACK: PromptPreset[] = pool.presets;

export function presetText(presets: PromptPreset[], presetId: string): string {
  return presets.find((p) => p.id === presetId)?.text ?? "";
}

export function mergePresets(official: PromptPreset[], user: PromptPreset[]): PromptPreset[] {
  const officialIds = new Set(official.map((p) => p.id));
  return [...official, ...user.filter((p) => !officialIds.has(p.id))];
}
