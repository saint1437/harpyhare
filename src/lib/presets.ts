/** id засиженного пресета «Расшифровка речи» — общий для Rust-сида, дефолта чата и TS. */
export const TRANSCRIPTION_PRESET_ID = "transcription";

export interface PromptPreset {
  id: string;
  name: string;
  text: string;
}

/** Текст пресета по id; неизвестный/пустой id → "" (без препромпта). */
export function presetText(presets: PromptPreset[], presetId: string): string {
  return presets.find((p) => p.id === presetId)?.text ?? "";
}
