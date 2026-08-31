export interface ModelInfo {
  id: string;
  displayName: string;
  adaptive: boolean;
  alwaysThinks: boolean;
  codeExec: boolean;
  maxInputTokens: number;
}

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const UNKNOWN_MAX_INPUT_TOKENS = 0;

export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    adaptive: true,
    alwaysThinks: false,
    codeExec: true,
    maxInputTokens: UNKNOWN_MAX_INPUT_TOKENS,
  },
  {
    id: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    adaptive: true,
    alwaysThinks: false,
    codeExec: true,
    maxInputTokens: UNKNOWN_MAX_INPUT_TOKENS,
  },
  {
    id: DEFAULT_MODEL,
    displayName: "Claude Haiku 4.5",
    adaptive: false,
    alwaysThinks: false,
    codeExec: false,
    maxInputTokens: UNKNOWN_MAX_INPUT_TOKENS,
  },
];

const CURATED_FAMILIES = ["opus", "sonnet", "haiku"];
const THINKING_SUFFIX = "-thinking";
const DATE_PART = /^\d{8}$/;

function familyVersion(id: string, family: string): [number, number] {
  const base = id.replace(new RegExp(`${THINKING_SUFFIX}$`), "");
  const marker = `-${family}-`;
  const start = base.indexOf(marker);
  if (start < 0) return [0, 0];
  const parts = base
    .slice(start + marker.length)
    .split("-")
    .filter((part) => !DATE_PART.test(part))
    .map((part) => Number.parseInt(part, 10))
    .filter(Number.isFinite);
  return [parts[0] ?? 0, parts[1] ?? 0];
}

function compareFamilyModels(a: ModelInfo, b: ModelInfo, family: string): number {
  const av = familyVersion(a.id, family);
  const bv = familyVersion(b.id, family);
  if (av[0] !== bv[0]) return bv[0] - av[0];
  if (av[1] !== bv[1]) return bv[1] - av[1];
  if (a.adaptive !== b.adaptive) return a.adaptive ? -1 : 1;
  return a.id.length - b.id.length;
}

export function curatedModels(models: ModelInfo[]): ModelInfo[] {
  const baseModels = models.filter((m) => !m.id.endsWith(THINKING_SUFFIX));
  const picked: ModelInfo[] = [];
  for (const family of CURATED_FAMILIES) {
    const candidates = baseModels
      .filter((m) => m.id.includes(`-${family}-`))
      .sort((a, b) => compareFamilyModels(a, b, family));
    const candidate = candidates[0];
    if (candidate !== undefined) picked.push(candidate);
  }
  return picked.length > 0 ? picked : baseModels;
}

const BRAND_PREFIX = /^Claude\s+/i;
const MODEL_ID_PREFIX = /^claude-/;

function capitalizeFirst(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

function labelFromModelId(id: string): string {
  const base = id.replace(THINKING_SUFFIX, "").replace(MODEL_ID_PREFIX, "");
  const [family = base, ...rest] = base.split("-");
  const version = rest.filter((part) => /^\d+$/.test(part) && !DATE_PART.test(part)).slice(0, 2);
  return version.length > 0
    ? `${capitalizeFirst(family)} ${version.join(".")}`
    : capitalizeFirst(family);
}

export function modelLabel(m: Pick<ModelInfo, "id" | "displayName">): string {
  const display = m.displayName.trim();
  if (display === "" || display === m.id || MODEL_ID_PREFIX.test(display)) {
    return labelFromModelId(m.id);
  }
  return display.replace(BRAND_PREFIX, "").trim();
}

function unlistedModel(id: string): ModelInfo {
  return {
    id,
    displayName: id,
    adaptive: true,
    alwaysThinks: false,
    codeExec: true,
    maxInputTokens: UNKNOWN_MAX_INPUT_TOKENS,
  };
}

export function selectableModels(models: ModelInfo[], currentId: string): ModelInfo[] {
  if (models.some((m) => m.id === currentId)) return models;
  return [unlistedModel(currentId), ...models];
}

export function thinkingLocked(models: ModelInfo[], currentId: string): boolean {
  const m = models.find((x) => x.id === currentId);
  return m !== undefined && (!m.adaptive || m.alwaysThinks);
}
