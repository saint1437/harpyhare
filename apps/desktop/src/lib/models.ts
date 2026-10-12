import { t } from "@/i18n";
import { DEFAULT_MODEL as GENERATED_DEFAULT_MODEL, LLM_PROVIDERS } from "@/ipc/bindings";
import type { ApiKeyId } from "./api-keys";

export interface ModelInfo {
  id: string;
  displayName: string;
  provider: string;
  adaptive: boolean;
  alwaysThinks: boolean;
  codeExec: boolean;
}

/** New chats start here. The id is declared in Rust (`llm::DEFAULT_MODEL`). */
export const DEFAULT_MODEL: string = GENERATED_DEFAULT_MODEL;

/** Aggregators have no offline catalogue; their live lists get a dedicated picker page. */
export const DYNAMIC_MODEL_PROVIDERS = LLM_PROVIDERS.filter((p) => p.id === "openrouter");

export interface ModelProvider {
  id: string;
  label: string;
  keyId: ApiKeyId;
  families: readonly string[];
  /** What a new chat opens on when this vendor is the one available. */
  defaultModel: string;
  /** Whether an access code alone reaches this vendor through the relay. */
  proxied: boolean;
}

/**
 * Derived from the generated registry вЂ” never hand-written.
 *
 * A vendor added to `llm/registry.rs` shows up in every picker, with its group
 * heading, its offline catalogue and its В«РЅРµС‚ РєР»СЋС‡Р°В» lock, without a line of
 * TypeScript. The annotation is load-bearing: specta prints the constant `as
 * const`, so `keyId` arrives as a literal type and assigning it to `ApiKeyId`
 * is checked by `tsc` вЂ” a row naming a key the app has no field for fails the
 * build here, at the vendor that introduced it.
 */
export const MODEL_PROVIDERS: readonly ModelProvider[] = LLM_PROVIDERS.map((p) => ({
  id: p.id,
  label: p.label,
  keyId: p.keyId,
  families: p.families,
  defaultModel: p.defaultModel,
  proxied: p.proxied,
}));

/**
 * Every model the app can name without a credential, tagged with its vendor.
 * Same table the backend serves as its own offline catalogue, so the picker and
 * the router cannot disagree about what exists.
 */
export const FALLBACK_MODELS: ModelInfo[] = LLM_PROVIDERS.flatMap((p) =>
  p.catalog.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    provider: p.id,
    adaptive: m.adaptive,
    alwaysThinks: m.alwaysThinks,
    codeExec: m.codeExec,
  })),
);

/**
 * Models of a provider the backend did not report вЂ” it has no credential, so
 * `list_models` never saw it. They stay in the list on purpose, locked, so the
 * picker answers "can this app talk to that vendor at all?" instead of staying
 * silent.
 */
export function withLockedModels(reported: ModelInfo[]): ModelInfo[] {
  const answering = new Set(reported.map((m) => m.provider));
  return [...reported, ...FALLBACK_MODELS.filter((m) => !answering.has(m.provider))];
}

function newestPerFamily(models: ModelInfo[], families: readonly string[]): ModelInfo[] {
  if (families.length === 0) return models;
  const picked = families.flatMap((family) => {
    const newest = models.find((m) => m.id.includes(family));
    return newest === undefined ? [] : [newest];
  });
  return picked.length > 0 ? picked : models;
}

function modelsOfProvider(models: ModelInfo[], provider: string): ModelInfo[] {
  return models.filter((m) => m.provider === provider);
}

function modelsOfUnknownProvider(models: ModelInfo[]): ModelInfo[] {
  const known = new Set<string>(MODEL_PROVIDERS.map((p) => p.id));
  return models.filter((m) => !known.has(m.provider));
}

export function curatedModels(models: ModelInfo[]): ModelInfo[] {
  const curated = MODEL_PROVIDERS.flatMap((p) =>
    newestPerFamily(modelsOfProvider(models, p.id), p.families),
  );
  return [...curated, ...modelsOfUnknownProvider(models)];
}

export interface ModelGroup {
  id: string;
  label: string;
  models: ModelInfo[];
}

export function modelGroups(
  models: ModelInfo[],
  selectedId?: string,
  options: { includeDynamicProviders?: boolean } = {},
): ModelGroup[] {
  const groups = MODEL_PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    models: modelsOfProvider(models, p.id).sort(
      (a, b) => Number(b.id === selectedId) - Number(a.id === selectedId),
    ),
  }));
  const rest = modelsOfUnknownProvider(models);
  const unknown =
    rest.length > 0 ? [{ id: "", label: t("models.otherProvider"), models: rest }] : [];
  return [...groups, ...unknown].filter(
    (g) =>
      g.models.length > 0 ||
      (options.includeDynamicProviders && DYNAMIC_MODEL_PROVIDERS.some((p) => p.id === g.id)),
  );
}

const BRAND_PREFIX = /^Claude\s+/i;
const MODEL_ID_PREFIX = /^claude-/;
/** `claude-haiku-4-5` Рё РґР°С‚РёСЂРѕРІР°РЅРЅС‹Р№ `claude-haiku-4-5-20251001` вЂ” РѕР±Рµ С„РѕСЂРјС‹ РґР°СЋС‚ В«Haiku 4.5В». */
const MODEL_ID_VERSION_SUFFIX = /-(\d+)(?:-(\d+)|\.(\d+))(?:-\d{8})?$/;

function capitalizeFirst(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

function labelFromModelId(id: string): string {
  return capitalizeFirst(
    id
      .replace(MODEL_ID_PREFIX, "")
      .replace(
        MODEL_ID_VERSION_SUFFIX,
        (_, major: string, minor: string, dottedMinor: string) =>
          ` ${major}.${dottedMinor || minor}`,
      ),
  );
}

export function modelLabel(m: Pick<ModelInfo, "id" | "displayName">): string {
  const short = m.displayName.replace(BRAND_PREFIX, "").trim();
  if (short !== "") return short;
  return labelFromModelId(m.id);
}

function unlistedModel(id: string): ModelInfo {
  const provider = id.startsWith("openrouter/")
    ? "openrouter"
    : (DYNAMIC_MODEL_PROVIDERS.find((p) => id.startsWith(`${p.id}/`))?.id ?? "");
  return {
    id,
    displayName: id,
    provider,
    adaptive: true,
    alwaysThinks: false,
    codeExec: true,
  };
}

/** Show the upstream id under aggregator model names without changing the saved id. */
export function modelIdHint(model: Pick<ModelInfo, "id" | "provider">): string | undefined {
  const prefix = `${model.provider}/`;
  return (model.provider === "openrouter" ||
    DYNAMIC_MODEL_PROVIDERS.some((p) => p.id === model.provider)) &&
    model.id.startsWith(prefix)
    ? model.id.slice(prefix.length)
    : undefined;
}

export function selectableModels(models: ModelInfo[], currentId: string): ModelInfo[] {
  if (models.some((m) => m.id === currentId)) return models;
  return [unlistedModel(currentId), ...models];
}

export function thinkingLocked(models: ModelInfo[], currentId: string): boolean {
  const m = models.find((x) => x.id === currentId);
  return m !== undefined && (!m.adaptive || m.alwaysThinks);
}

/**
 * A model the user can actually call right now.
 *
 * New chats used to open on `DEFAULT_MODEL` unconditionally, which was fine
 * while Claude was the only vendor. With a key for one vendor and not another,
 * that default is a model the account cannot reach вЂ” the chat looks ready and
 * fails on send. Picks the first catalogue model of the first unlocked vendor,
 * in registry order, and only falls back to `DEFAULT_MODEL` when nothing is
 * unlocked (there is no better answer then, and the picker shows why).
 */
export function defaultModelFor(
  lockedProviderIds: readonly string[],
  models: ModelInfo[] = [],
): string {
  // Р’РµРЅРґРѕСЂ СЃ РґРёРЅР°РјРёС‡РµСЃРєРёРј РєР°С‚Р°Р»РѕРіРѕРј (Р°РіСЂРµРіР°С‚РѕСЂ) РѕС„Р»Р°Р№РЅ РЅРµ РЅР°Р·С‹РІР°РµС‚ РґРµС„РѕР»С‚Р°: РµРіРѕ
  // СЃРїРёСЃРѕРє РјРѕРґРµР»РµР№ РїСЂРёРІСЏР·Р°РЅ Рє РєР»СЋС‡Сѓ Рё РїСЂРёС…РѕРґРёС‚ С‚РѕР»СЊРєРѕ РёР· Р¶РёРІРѕРіРѕ API. РџРѕРєР° РѕРЅ РЅРµ
  // РїСЂРёС€С‘Р», РѕС‚РєСЂС‹РІР°С‚СЊ РЅР° РЅС‘Рј С‡Р°С‚ РЅРµ РЅР° С‡РµРј вЂ” Р±РµСЂС‘Рј СЃР»РµРґСѓСЋС‰РµРіРѕ, Сѓ РєРѕРіРѕ РµСЃС‚СЊ С‡С‚Рѕ
  // РїСЂРµРґР»РѕР¶РёС‚СЊ, РёРЅР°С‡Рµ С‡Р°С‚ РѕС‚РєСЂС‹Р»СЃСЏ Р±С‹ СЃ РїСѓСЃС‚С‹Рј id РјРѕРґРµР»Рё Рё РїР°РґР°Р» РЅР° РѕС‚РїСЂР°РІРєРµ.
  const usable = MODEL_PROVIDERS.find(
    (p) => !lockedProviderIds.includes(p.id) && p.defaultModel !== "",
  );
  if (usable) return usable.defaultModel;
  return (
    models.find(
      (model) =>
        !lockedProviderIds.includes(model.provider) &&
        MODEL_PROVIDERS.some((p) => p.id === model.provider),
    )?.id ?? DEFAULT_MODEL
  );
}
