import { vi } from "vitest";
import type { SecretsApi } from "@/features/settings/contract";
import { DEFAULT_SECRETS_STATUS, type SecretsStatus } from "@/ipc/types";

/**
 * A `SecretsApi` whose four writes are spies. Three surfaces render the key form
 * (the launcher's tab, «Старт» and onboarding), so every one of their tests
 * needs the bundle — and the point of most of them is exactly WHICH command was
 * called, which is what a shared fake keeps honest.
 */
export function fakeSecrets(status: Partial<SecretsStatus> = {}): SecretsApi & {
  setKey: ReturnType<typeof vi.fn>;
  clearKey: ReturnType<typeof vi.fn>;
  clearAccessCode: ReturnType<typeof vi.fn>;
  redeem: ReturnType<typeof vi.fn>;
} {
  return {
    status: { ...DEFAULT_SECRETS_STATUS, ...status },
    setKey: vi.fn(() => Promise.resolve(null)),
    clearKey: vi.fn(() => Promise.resolve(null)),
    clearAccessCode: vi.fn(() => Promise.resolve(null)),
    redeem: vi.fn(() => Promise.resolve(null)),
  };
}
