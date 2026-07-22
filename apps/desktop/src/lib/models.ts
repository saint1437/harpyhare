export interface ModelInfo {
  id: string;
  displayName: string;
  adaptive: boolean;
  alwaysThinks: boolean;
  maxInputTokens?: number;
}

export const DEFAULT_MODEL = "claude-haiku-4-5";

export const FALLBACK_MODELS: ModelInfo[] = [
  { id: "claude-opus-4-8", displayName: "Claude Opus 4.8", adaptive: true, alwaysThinks: false },
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    adaptive: true,
    alwaysThinks: false,
  },
  { id: DEFAULT_MODEL, displayName: "Claude Haiku 4.5", adaptive: false, alwaysThinks: false },
];

const BRAND_PREFIX = /^Claude\s+/i;
const MODEL_ID_PREFIX = /^claude-/;
const MODEL_ID_VERSION_SUFFIX = /-(\d)-(\d)$/;
const VERSION_LABEL = " $1.$2";

function capitalizeFirst(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

function labelFromModelId(id: string): string {
  return capitalizeFirst(
    id.replace(MODEL_ID_PREFIX, "").replace(MODEL_ID_VERSION_SUFFIX, VERSION_LABEL),
  );
}

export function modelLabel(m: Pick<ModelInfo, "id" | "displayName">): string {
  const short = m.displayName.replace(BRAND_PREFIX, "").trim();
  if (short !== "") return short;
  return labelFromModelId(m.id);
}

function unlistedModel(id: string): ModelInfo {
  return { id, displayName: id, adaptive: true, alwaysThinks: false };
}

export function selectableModels(models: ModelInfo[], currentId: string): ModelInfo[] {
  if (models.some((m) => m.id === currentId)) return models;
  return [unlistedModel(currentId), ...models];
}

export function thinkingLocked(models: ModelInfo[], currentId: string): boolean {
  const m = models.find((x) => x.id === currentId);
  return m !== undefined && (!m.adaptive || m.alwaysThinks);
}
