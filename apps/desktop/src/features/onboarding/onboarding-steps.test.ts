import { describe, expect, it } from "vitest";
import { requiredPermissionRows } from "@/features/settings/permission-rows";
import { dictionary, LOCALES, type Locale } from "@/i18n";
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

/**
 * Every leaf of the namespace as a `a.b.c[0]` path, which is what a locale walk
 * compares: the compiler already holds the two dictionaries to one shape, but it
 * says nothing about the LENGTH of an array (the privacy disclosures) and nothing
 * at all about a string that is present and empty.
 */
type Leaf = readonly [path: string, text: string];

function leaves(value: unknown, prefix: string): Leaf[] {
  if (typeof value === "string") return [[prefix, value]];
  if (Array.isArray(value)) {
    return (value as unknown[]).flatMap((item, index) =>
      leaves(item, `${prefix}[${String(index)}]`),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, nested]: [string, unknown]) =>
      leaves(nested, prefix === "" ? key : `${prefix}.${key}`),
    );
  }
  return [];
}

function onboardingLeaves(locale: Locale): Leaf[] {
  return leaves(dictionary(locale).onboarding, "");
}

describe("словарь онбординга", () => {
  it.each(LOCALES)("ни одной пустой строки в локали %s", (locale) => {
    const found = onboardingLeaves(locale);
    expect(found.length).toBeGreaterThan(0);
    for (const [path, text] of found) {
      expect(text.trim(), path).not.toBe("");
    }
  });

  // The compiler holds the two dictionaries to one shape, but not to one array
  // LENGTH: a locale with three disclosures instead of four compiles and drops one.
  it("локали описывают одни и те же строки", () => {
    const paths = (locale: Locale) => onboardingLeaves(locale).map(([path]) => path);
    for (const locale of LOCALES) {
      expect(paths(locale)).toEqual(paths("ru"));
    }
  });

  // The registry and the dictionary record share a union, but `satisfies` checks
  // one direction only: a dictionary key with no step behind it would go unnoticed.
  it.each(LOCALES)("шаги словаря совпадают с реестром в локали %s", (locale) => {
    const keys = Object.keys(dictionary(locale).onboarding.steps).sort();
    expect(keys).toEqual([...ONBOARDING_STEP_IDS].sort());
  });
});
