import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { Readiness } from "@/features/settings/readiness";
import { format, getDict } from "@/i18n";
import { DEFAULT_SETTINGS } from "@/ipc/types";
import { apiKeyInfo } from "@/lib/api-keys";

vi.mock("@/ipc/events", () => ({ onEvent: () => () => undefined }));
vi.mock("@/ipc/commands", () => ({
  probeConnectivity: () => Promise.resolve(true),
  startWindowDrag: () => Promise.resolve(),
  openExternal: () => Promise.resolve(),
}));

import { fakeSecrets } from "@/test-utils/fake-secrets";
import { OnboardingFlow } from "./OnboardingFlow";
import { ONBOARDING_STEP_IDS, onboardingSteps } from "./onboarding-steps";

const dict = getDict();
const NEXT = dict.common.actions.next;

/** The same template the shell renders — the assertion must not hold a second copy. */
function position(step: number, total: number): string {
  return format(dict.onboarding.shell.position, { step: String(step), total: String(total) });
}

const PERMISSIONS: PermissionsApi = {
  status: { audio: "granted", screen: "granted", microphone: "granted" },
  loaded: true,
  audioOk: true,
  microphoneOk: true,
  pending: null,
  awaiting: null,
  request: () => Promise.resolve(),
  openSettings: () => undefined,
  refresh: () => Promise.resolve(),
};

const READINESS: Readiness = {
  missingKeys: [],
  permissions: PERMISSIONS,
  autoModeEnabled: false,
  blockers: [],
  checking: false,
  ready: true,
};

/** Ключей нет — шаг доступа не пройден, поток обязан начаться с него. */
const UNCONFIGURED: Readiness = {
  ...READINESS,
  missingKeys: [apiKeyInfo("anthropic"), apiKeyInfo("groq")],
  ready: false,
};

function renderFlow(readiness: Readiness = READINESS) {
  return render(
    <OnboardingFlow
      draft={DEFAULT_SETTINGS}
      set={() => undefined}
      readiness={readiness}
      secrets={fakeSecrets({
        anthropic_key_set: readiness.missingKeys.length === 0,
        groq_key_set: readiness.missingKeys.length === 0,
      })}
      launching={false}
      onLaunch={() => undefined}
      onFinish={() => undefined}
    />,
  );
}

afterEach(cleanup);

describe("OnboardingFlow", () => {
  it("renders a non-empty step for every id in the registry", () => {
    // Onboarding is entered at the first UNFINISHED step, and the answer comes
    // from readiness — the same flags the launcher's gate uses, never from a
    // key sitting in the draft. With both keys stored the flow starts at step
    // two; the walk covers the rest.
    const steps = onboardingSteps();
    renderFlow();

    const headings = new Set<string>();
    for (let at = 2; at <= steps.length; at++) {
      expect(screen.getByText(position(at, steps.length))).toBeTruthy();
      const heading = screen.getByRole("heading", { level: 2 });
      expect(heading.textContent?.trim()).not.toBe("");
      headings.add(heading.textContent ?? "");
      if (at < steps.length) fireEvent.click(screen.getByRole("button", { name: NEXT }));
    }
    expect(headings.size).toBe(steps.length - 1);
  });

  it("starts at the access step when a key is missing, and it renders", () => {
    renderFlow(UNCONFIGURED);
    const steps = onboardingSteps();
    expect(screen.getByText(position(1, steps.length))).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2 }).textContent?.trim()).not.toBe("");
  });

  it("keeps the registry and the platform-filtered list in step", () => {
    const steps = onboardingSteps();
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((id) => ONBOARDING_STEP_IDS.includes(id))).toBe(true);
  });
});
