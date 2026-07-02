/** Модели Anthropic, доступные в селекте чата. Модель — свойство чата (как thinking). */
export const MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"] as const;

export const DEFAULT_MODEL: string = MODELS[0];

/** Короткое имя для UI-селекта. */
export function modelLabel(id: string): string {
  return id
    .replace(/^claude-/, "")
    .replace(/-(\d)-(\d)$/, " $1.$2")
    .replace(/^./, (c) => c.toUpperCase());
}
