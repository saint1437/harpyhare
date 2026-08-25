import { describe, expect, it } from "vitest";
import { requiredPermissionRows } from "../launcher/permission-rows";
import { onboardingSteps, stepPosition, ONBOARDING_STEP_IDS } from "./onboarding-steps";

describe("onboardingSteps", () => {
  it("на macOS спрашивает системный звук", () => {
    const steps = onboardingSteps("macos");
    expect(steps).toEqual(["access", "audio", "privacy", "ready"]);
  });

  // На Windows у WASAPI loopback нет разрешения вовсе, спрашивать нечего —
  // и это должно вытекать из реестра, а не из ветки в самом флоу.
  it("на Windows шага со звуком нет", () => {
    const steps = onboardingSteps("windows");
    expect(steps).toEqual(["access", "privacy", "ready"]);
    expect(steps).not.toContain("audio");
  });

  it("укладывается в пять шагов на любой платформе", () => {
    for (const platform of ["macos", "windows"] as const) {
      expect(onboardingSteps(platform).length).toBeLessThanOrEqual(5);
    }
  });

  // Микрофон и запись экрана не нужны для первого ответа: автослушание выключено
  // по умолчанию, а снимок области — не первый сценарий. Если реестр когда-нибудь
  // пометит их `need: "launch"`, этот тест должен упасть и заставить пересмотреть флоу.
  it("во время онбординга обязателен только системный звук", () => {
    const required = requiredPermissionRows(false).map((row) => row.kind);
    expect(required).toEqual(["audio"]);
  });

  it("порядок шагов не зависит от платформы", () => {
    for (const platform of ["macos", "windows"] as const) {
      const steps = onboardingSteps(platform);
      const canonical = ONBOARDING_STEP_IDS.filter((id) => steps.includes(id));
      expect(steps).toEqual(canonical);
    }
  });
});

describe("stepPosition", () => {
  it("считает позицию внутри реального списка платформы", () => {
    const windows = onboardingSteps("windows");
    expect(stepPosition(windows, "access")).toBe(0);
    expect(stepPosition(windows, "privacy")).toBe(1);
    expect(stepPosition(windows, "ready")).toBe(2);
  });

  it("шаг, которого нет на платформе, не уводит счётчик в минус", () => {
    expect(stepPosition(onboardingSteps("windows"), "audio")).toBe(0);
  });
});
