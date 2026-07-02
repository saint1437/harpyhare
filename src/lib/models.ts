/** Модель Anthropic из GET /v1/models (Rust-команда list_models) с выжимкой capabilities. */
export interface ModelInfo {
  id: string;
  displayName: string;
  /** Принимает thinking:{type:"adaptive"} — селект thinking активен. */
  adaptive: boolean;
  /** Thinking нельзя выключить (Fable/Mythos «думают всегда»). */
  alwaysThinks: boolean;
}

/** Дефолт новых чатов: живёт и в legacy-десериализации, поэтому фиксирован. */
export const DEFAULT_MODEL = "claude-opus-4-8";

/** Стартовый список до ответа list_models (и для браузерного мока). */
export const FALLBACK_MODELS: ModelInfo[] = [
  { id: "claude-opus-4-8", displayName: "Claude Opus 4.8", adaptive: true, alwaysThinks: false },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    adaptive: true,
    alwaysThinks: false,
  },
  { id: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", adaptive: false, alwaysThinks: false },
];

/** Короткое имя для селекта: display_name без бренда, либо реконструкция из id. */
export function modelLabel(m: Pick<ModelInfo, "id" | "displayName">): string {
  const short = m.displayName.replace(/^Claude\s+/i, "").trim();
  if (short !== "") return short;
  return m.id
    .replace(/^claude-/, "")
    .replace(/-(\d)-(\d)$/, " $1.$2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Список для селекта: текущая модель чата всегда присутствует (legacy/отозванные). */
export function selectableModels(models: ModelInfo[], currentId: string): ModelInfo[] {
  if (models.some((m) => m.id === currentId)) return models;
  return [
    { id: currentId, displayName: currentId, adaptive: true, alwaysThinks: false },
    ...models,
  ];
}

/** Селект thinking заблокирован: у модели нет adaptive (всегда выкл) или она думает всегда. */
export function thinkingLocked(models: ModelInfo[], currentId: string): boolean {
  const m = models.find((x) => x.id === currentId);
  return m !== undefined && (!m.adaptive || m.alwaysThinks);
}
