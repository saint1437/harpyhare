import { describe, expect, it } from "vitest";
import type { PermissionsApi } from "@/hooks/usePermissions";
import type { PermissionsStatus } from "@/ipc/bindings";
import { apiKeyInfo } from "@/lib/api-keys";
import { startSteps, stepsLeft, type StartStepId } from "./start-steps";
import type { LauncherReadiness } from "./useLauncherReadiness";

const ALL_GRANTED: PermissionsStatus = {
  audio: "granted",
  screen: "granted",
  microphone: "granted",
};

function readiness(overrides: Partial<LauncherReadiness> = {}): LauncherReadiness {
  const permissions = { status: ALL_GRANTED } as PermissionsApi;
  return {
    missingKeys: [],
    permissions,
    autoModeEnabled: false,
    blockers: [],
    checking: false,
    ready: true,
    ...overrides,
  };
}

function withStatus(status: PermissionsStatus, checking = false): LauncherReadiness {
  return readiness({ permissions: { status } as PermissionsApi, checking });
}

function ids(r: LauncherReadiness, platform: "macos" | "windows" = "macos"): StartStepId[] {
  return startSteps(r, platform).map((step) => step.id);
}

function step(r: LauncherReadiness, id: StartStepId, platform: "macos" | "windows" = "macos") {
  const found = startSteps(r, platform).find((s) => s.id === id);
  if (!found) throw new Error(`нет шага ${id}`);
  return found;
}

describe("startSteps", () => {
  it("шаги старта — доступ к API и обязательные разрешения, необязательных среди них нет", () => {
    expect(ids(readiness())).toEqual(["access", "audio"]);
  });

  it("на Windows разрешений нет вовсе — остаётся один шаг", () => {
    expect(ids(readiness(), "windows")).toEqual(["access"]);
  });

  it("недостающие ключи названы теми же словами, что и блокер в шапке", () => {
    const missing = [apiKeyInfo("groq")];
    const access = step(readiness({ missingKeys: missing, ready: false }), "access");
    expect(access.state).toBe("todo");
    expect(access.hint).toContain(apiKeyInfo("groq").name);
  });

  it("выданный доступ к звуку закрывает шаг", () => {
    expect(step(withStatus(ALL_GRANTED), "audio").state).toBe("done");
  });

  it("пока доступы не опрошены, шаг не кричит «нужно сделать»", () => {
    const checking = withStatus(
      { audio: "unknown", screen: "unknown", microphone: "unknown" },
      true,
    );
    expect(step(checking, "audio").state).toBe("checking");
    expect(stepsLeft(startSteps(checking, "macos"))).toBe(0);
  });

  it("отклонённый доступ к звуку остаётся невыполненным шагом", () => {
    const denied = withStatus({ audio: "denied", screen: "granted", microphone: "granted" });
    expect(step(denied, "audio").state).toBe("todo");
    expect(stepsLeft(startSteps(denied, "macos"))).toBe(1);
  });

  it("шаг доступа ведёт на вкладку ключей, шаг звука — на экран доступов", () => {
    expect(step(readiness(), "access").screen).toBe("settings");
    expect(step(readiness(), "access").tab).toBe("access");
    expect(step(readiness(), "audio").screen).toBe("permissions");
  });

  it("микрофон появляется шагом только при включённом автослушании", () => {
    expect(ids(readiness())).toEqual(["access", "audio"]);
    expect(ids(readiness({ autoModeEnabled: true }))).toEqual(["access", "audio", "microphone"]);
  });

  it("не выданный микрофон держит шаг открытым — автослушание без него не поднимется", () => {
    const denied = withStatus({ audio: "granted", screen: "granted", microphone: "denied" });
    const r = { ...denied, autoModeEnabled: true };
    expect(step(r, "microphone").state).toBe("todo");
    expect(stepsLeft(startSteps(r, "macos"))).toBe(1);
  });

  it("выданный микрофон закрывает шаг", () => {
    const r = { ...withStatus(ALL_GRANTED), autoModeEnabled: true };
    expect(step(r, "microphone").state).toBe("done");
    expect(stepsLeft(startSteps(r, "macos"))).toBe(0);
  });

  it("всё готово — незакрытых шагов не остаётся", () => {
    expect(stepsLeft(startSteps(readiness(), "macos"))).toBe(0);
  });
});
