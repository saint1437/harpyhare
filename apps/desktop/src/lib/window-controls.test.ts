import { describe, expect, it } from "vitest";
import { SETTINGS_DEFAULTS, SETTINGS_LIMITS } from "@/ipc/types";
import {
  applyChatFontSize,
  applyOpacity,
  applyTheme,
  isDraggableChromeTarget,
  stepOpacity,
  THEME_DARK,
  THEME_LIGHT,
  THEME_SYSTEM,
  THEMES,
} from "./window-controls";

describe("isDraggableChromeTarget", () => {
  it("нейтральная поверхность (div/span) → тащим", () => {
    expect(isDraggableChromeTarget(document.createElement("div"))).toBe(true);
    expect(isDraggableChromeTarget(document.createElement("span"))).toBe(true);
  });
  it("сам интерактивный элемент → не тащим", () => {
    expect(isDraggableChromeTarget(document.createElement("button"))).toBe(false);
    expect(isDraggableChromeTarget(document.createElement("input"))).toBe(false);
  });
  it("потомок кнопки (значок внутри) → не тащим", () => {
    const button = document.createElement("button");
    const icon = document.createElement("span");
    button.appendChild(icon);
    expect(isDraggableChromeTarget(icon)).toBe(false);
  });
  it("элемент с [role=tab] → не тащим (табы кликабельны)", () => {
    const tab = document.createElement("div");
    tab.setAttribute("role", "tab");
    expect(isDraggableChromeTarget(tab)).toBe(false);
  });
  it("null или не-HTMLElement → не тащим", () => {
    expect(isDraggableChromeTarget(null)).toBe(false);
  });
});

describe("applyOpacity", () => {
  it("ставит CSS-переменную с клампом до границ Rust", () => {
    const el = document.createElement("div");
    applyOpacity(el, 0.8);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("0.8");
    applyOpacity(el, 0.01);
    expect(el.style.getPropertyValue("--app-opacity")).toBe(
      String(SETTINGS_LIMITS.windowOpacity.min),
    );
    applyOpacity(el, 7);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("1");
  });

  it("NaN/Infinity игнорируются — значение не меняется", () => {
    const el = document.createElement("div");
    applyOpacity(el, 0.8);
    applyOpacity(el, NaN);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("0.8");
    applyOpacity(el, Infinity);
    expect(el.style.getPropertyValue("--app-opacity")).toBe("0.8");
  });
});

describe("applyChatFontSize", () => {
  it("ставит --chat-font-size в px с клампом 10..20", () => {
    const el = document.createElement("div");
    applyChatFontSize(el, 15);
    expect(el.style.getPropertyValue("--chat-font-size")).toBe("15px");
    applyChatFontSize(el, 5);
    expect(el.style.getPropertyValue("--chat-font-size")).toBe("10px");
    applyChatFontSize(el, 99);
    expect(el.style.getPropertyValue("--chat-font-size")).toBe("20px");
    applyChatFontSize(el, NaN);
    expect(el.style.getPropertyValue("--chat-font-size")).toBe("20px");
  });
});

describe("stepOpacity", () => {
  it("шаг вверх/вниз", () => {
    expect(stepOpacity(0.85, 1, 0.05)).toBeCloseTo(0.9);
    expect(stepOpacity(0.85, -1, 0.05)).toBeCloseTo(0.8);
  });
  it("кламп в границы Rust", () => {
    const { min } = SETTINGS_LIMITS.windowOpacity;
    expect(stepOpacity(0.95, 1, 0.1)).toBe(1);
    expect(stepOpacity(1, 1, 0.1)).toBe(1);
    expect(stepOpacity(min + 0.05, -1, 0.1)).toBe(min);
    expect(stepOpacity(min, -1, 0.1)).toBe(min);
  });
  it("без дрейфа float", () => {
    expect(stepOpacity(0.7, 1, 0.1)).toBe(0.8);
  });
  // Локальная копия границ уже расходилась с Rust — тест прибивает её к реестру.
  it("нижняя граница совпадает с SETTINGS_LIMITS", () => {
    expect(stepOpacity(0, -1, 0.1)).toBe(SETTINGS_LIMITS.windowOpacity.min);
    expect(stepOpacity(2, 1, 0.1)).toBe(SETTINGS_LIMITS.windowOpacity.max);
  });
});

describe("applyTheme", () => {
  it("явная тема выставляет data-theme", () => {
    const el = document.createElement("div");
    applyTheme(el, THEME_DARK);
    expect(el.getAttribute("data-theme")).toBe(THEME_DARK);
    applyTheme(el, THEME_LIGHT);
    expect(el.getAttribute("data-theme")).toBe(THEME_LIGHT);
  });

  // Атрибут именно снимается: разрешать системную тему в JS значило бы
  // зафиксировать её на момент загрузки и перестать следовать переключению ОС.
  it("«как в системе» снимает атрибут", () => {
    const el = document.createElement("div");
    applyTheme(el, THEME_DARK);
    applyTheme(el, THEME_SYSTEM);
    expect(el.getAttribute("data-theme")).toBeNull();
  });

  it("неизвестная тема ведёт себя как системная", () => {
    const el = document.createElement("div");
    applyTheme(el, THEME_LIGHT);
    applyTheme(el, "neon");
    expect(el.getAttribute("data-theme")).toBeNull();
  });

  it("список тем совпадает с дефолтом Rust", () => {
    expect(THEMES).toContain(SETTINGS_DEFAULTS.theme);
  });
});
