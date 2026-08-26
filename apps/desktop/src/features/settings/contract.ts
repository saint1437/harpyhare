import type { ApiKeyKind, SecretsStatus, Settings } from "@/ipc/types";

/**
 * The settings form's vocabulary, shared by the two surfaces that render it —
 * the launcher's «Настройки» screen and the onboarding flow. It lives outside
 * both features so neither has to import the other: onboarding reuses whole
 * settings blocks (`ApiKeysSection`, the privacy switches), and the launcher
 * decides when onboarding runs.
 */
export type SetSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

export interface SectionProps {
  draft: Settings;
  set: SetSetting;
}

/**
 * The credentials and the only four ways to change them, threaded to wherever
 * the key form is rendered — the launcher's «Доступ к API» tab, the «Старт»
 * screen and onboarding's first step.
 *
 * It is a bundle rather than five props because it is one decision: after the
 * security audit the secrets are NOT part of `Settings` and therefore not part
 * of any draft, so every surface that used to read `draft.anthropic_api_key` now
 * reads a flag from `status` and writes through one of these commands. Each of
 * them answers `null` on success or the failure's text, the same shape
 * `saveSettings` uses.
 */
export interface SecretsApi {
  status: SecretsStatus;
  /** Empty value = "leave the stored key alone"; see `state/secrets`. */
  setKey: (kind: ApiKeyKind, value: string) => Promise<string | null>;
  clearKey: (kind: ApiKeyKind) => Promise<string | null>;
  clearAccessCode: () => Promise<string | null>;
  redeem: (code: string) => Promise<string | null>;
}
