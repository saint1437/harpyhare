export const TRANSCRIPTION_PRESET_ID = "transcription";

export interface PromptPreset {
  id: string;
  name: string;
  text: string;
}

export function presetText(presets: PromptPreset[], presetId: string): string {
  return presets.find((p) => p.id === presetId)?.text ?? "";
}
