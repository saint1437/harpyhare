# Opacity-хоткеи, захват хоткея записи, удаление оверлея — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить управление прозрачностью с клавиатуры (`Cmd+Shift+=/-`), захват сочетания клавиш для хоткея записи в настройках, и убрать отдельное мини-окно «запись».

**Architecture:** Чистая логика — в `src/lib/` (`stepOpacity`, `hotkeyFromEvent`) под юнит-тесты. Opacity-степ persist'ится дебаунсом в `useSettings` (`bumpOpacity`), хоткей ловит `useWindowControls`. Захват комбо — компонент `HotkeyCapture` поверх чистой `hotkeyFromEvent`. Оверлей удаляется из конфигов и `emit_state`.

**Tech Stack:** React 19 + TS (строгий ESLint type-aware — код должен быть lint-чистым на каждом коммите, т.к. pre-commit гоняет lint-staged → tsc → knip), Tauri 2 (Rust), Vitest.

**Важно про pre-commit:** каждый `git commit` запускает husky-хук (eslint --fix + prettier на застейдженных → `tsc -b` → `knip`). Весь код в плане написан строго-lint-совместимым (без `any`/`!`, индексный доступ через `?.`, плавающие промисы через `void`).

---

## Файловая структура

**Создаётся:**
- `src/lib/hotkey-capture.ts` — `hotkeyFromEvent(e)` (событие → строка хоткея).
- `src/lib/hotkey-capture.test.ts` — тесты.
- `src/components/HotkeyCapture.tsx` — кнопка-захват комбо.
- `src/hooks/useWindowControls.test.ts` — тест ветки opacity.

**Модифицируется:**
- `src/lib/window-controls.ts` — `stepOpacity`.
- `src/lib/window-controls.test.ts` — тесты `stepOpacity`.
- `src/hooks/useSettings.ts` — метод `bumpOpacity`.
- `src/hooks/useSettings.test.ts` — тест `bumpOpacity`.
- `src/hooks/useWindowControls.ts` — параметр `onOpacityStep` + ветка.
- `src/App.tsx` — проброс `bumpOpacity` в `useWindowControls`.
- `src/components/SettingsDialog.tsx` — поле хоткея → `HotkeyCapture`; убрать `.toUpperCase()`.
- `src-tauri/src/lib.rs` — убрать show/hide оверлея из `emit_state`.
- `src-tauri/tauri.conf.json` — убрать окно `overlay`.
- `vite.config.ts` — убрать вход `overlay`.

**Удаляется:**
- `overlay.html`.

---

## Task 1: `stepOpacity` (чистая логика шага прозрачности)

**Files:**
- Modify: `src/lib/window-controls.ts`
- Modify: `src/lib/window-controls.test.ts`

- [ ] **Step 1: Написать падающие тесты**

В `src/lib/window-controls.test.ts` добавить импорт `stepOpacity` (в первую строку импортов) и блок тестов в конец файла:

Импорт:
```ts
import { applyOpacity, moveDelta, stepOpacity } from "./window-controls";
```

Блок (в конец файла):
```ts
describe("stepOpacity", () => {
  it("шаг вверх/вниз", () => {
    expect(stepOpacity(0.5, 1, 0.1)).toBeCloseTo(0.6);
    expect(stepOpacity(0.5, -1, 0.1)).toBeCloseTo(0.4);
  });
  it("кламп в [0.2, 1]", () => {
    expect(stepOpacity(0.95, 1, 0.1)).toBe(1);
    expect(stepOpacity(1, 1, 0.1)).toBe(1);
    expect(stepOpacity(0.25, -1, 0.1)).toBe(0.2);
    expect(stepOpacity(0.2, -1, 0.1)).toBe(0.2);
  });
  it("без дрейфа float", () => {
    expect(stepOpacity(0.7, 1, 0.1)).toBe(0.8);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd /Users/mark/i.tech && npx vitest run src/lib/window-controls.test.ts`
Expected: FAIL — `stepOpacity` не экспортирована.

- [ ] **Step 3: Реализовать `stepOpacity`**

В `src/lib/window-controls.ts` добавить в конец файла:
```ts
/** Шаг прозрачности с клампом [0.2, 1] и округлением до 2 знаков (без float-дрейфа). */
export function stepOpacity(current: number, dir: 1 | -1, step: number): number {
  const next = Math.round((current + dir * step) * 100) / 100;
  return Math.min(1, Math.max(0.2, next));
}
```

- [ ] **Step 4: Запустить — зелёные**

Run: `cd /Users/mark/i.tech && npx vitest run src/lib/window-controls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/window-controls.ts src/lib/window-controls.test.ts
git commit -m "feat(lib): stepOpacity — шаг прозрачности с клампом"
```

---

## Task 2: `hotkeyFromEvent` (событие → строка хоткея)

**Files:**
- Create: `src/lib/hotkey-capture.ts`
- Create: `src/lib/hotkey-capture.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/lib/hotkey-capture.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hotkeyFromEvent } from "./hotkey-capture";

const base = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };

describe("hotkeyFromEvent", () => {
  it("одиночная буква", () => {
    expect(hotkeyFromEvent({ ...base, code: "KeyV" })).toBe("V");
  });
  it("F-клавиша", () => {
    expect(hotkeyFromEvent({ ...base, code: "F9" })).toBe("F9");
  });
  it("цифра с модификатором", () => {
    expect(hotkeyFromEvent({ ...base, ctrlKey: true, code: "Digit1" })).toBe("Ctrl+1");
  });
  it("комбо с несколькими модификаторами в фиксированном порядке", () => {
    expect(hotkeyFromEvent({ ...base, metaKey: true, shiftKey: true, code: "KeyR" })).toBe(
      "Cmd+Shift+R",
    );
    expect(
      hotkeyFromEvent({ metaKey: true, ctrlKey: true, altKey: true, shiftKey: true, code: "KeyA" }),
    ).toBe("Cmd+Ctrl+Alt+Shift+A");
  });
  it("только модификаторы → null", () => {
    expect(hotkeyFromEvent({ ...base, metaKey: true, code: "MetaLeft" })).toBeNull();
    expect(hotkeyFromEvent({ ...base, shiftKey: true, code: "ShiftLeft" })).toBeNull();
  });
  it("нераспознанный код → null", () => {
    expect(hotkeyFromEvent({ ...base, code: "Space" })).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd /Users/mark/i.tech && npx vitest run src/lib/hotkey-capture.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

Создать `src/lib/hotkey-capture.ts`:
```ts
export interface HotkeyEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  code: string;
}

/** Основная (не-модификаторная) клавиша из event.code → токен парсера, иначе null. */
function mainKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3); // KeyR → R
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code; // F1..F24
  if (/^Digit[0-9]$/.test(code)) return code.slice(5); // Digit1 → 1
  return null;
}

/**
 * Сериализует keydown в строку формата `parse_hotkey` ("Cmd+Shift+R", "F9", "V").
 * Возвращает null, если основной клавиши нет (нажаты только модификаторы) или код не распознан.
 */
export function hotkeyFromEvent(e: HotkeyEvent): string | null {
  const key = mainKey(e.code);
  if (key === null) return null;
  const mods: string[] = [];
  if (e.metaKey) mods.push("Cmd");
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, key].join("+");
}
```

- [ ] **Step 4: Запустить — зелёные**

Run: `cd /Users/mark/i.tech && npx vitest run src/lib/hotkey-capture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hotkey-capture.ts src/lib/hotkey-capture.test.ts
git commit -m "feat(lib): hotkeyFromEvent — захват комбо в строку хоткея"
```

---

## Task 3: `useSettings.bumpOpacity` (шаг + live + дебаунс-персист)

**Files:**
- Modify: `src/hooks/useSettings.ts`
- Modify: `src/hooks/useSettings.test.ts`

- [ ] **Step 1: Написать падающий тест**

В `src/hooks/useSettings.test.ts` добавить импорт `act` (он уже импортируется — проверь первую строку; если нет, добавь) и тест внутрь `describe("useSettings", ...)`:
```ts
  it("bumpOpacity меняет прозрачность, применяет и персистит с дебаунсом", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    applyOpacity.mockClear();
    act(() => {
      result.current.bumpOpacity(-1);
    });
    expect(result.current.settings.window_opacity).toBeCloseTo(0.9);
    expect(applyOpacity).toHaveBeenCalledWith(document.documentElement, 0.9);
    expect(setSettings).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(setSettings).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
```
(`DEFAULT_SETTINGS.window_opacity === 1`, шаг −0.1 → 0.9.)

- [ ] **Step 2: Запустить — упадёт**

Run: `cd /Users/mark/i.tech && npx vitest run src/hooks/useSettings.test.ts`
Expected: FAIL — `bumpOpacity` не существует.

- [ ] **Step 3: Реализовать `bumpOpacity`**

В `src/hooks/useSettings.ts`:

Обновить импорт react (добавить `useRef`):
```ts
import { useCallback, useEffect, useRef, useState } from "react";
```
Обновить импорт lib (добавить `stepOpacity`):
```ts
import { applyOpacity, stepOpacity } from "@/lib/window-controls";
```
В интерфейс `SettingsApi` добавить:
```ts
  bumpOpacity: (dir: 1 | -1) => void;
```
Внутри `useSettings`, после объявления `save`, добавить:
```ts
  const opacityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => {
    clearTimeout(opacityTimer.current);
  }, []);

  const bumpOpacity = useCallback((dir: 1 | -1) => {
    setSettings((prev) => {
      const next = stepOpacity(prev.window_opacity, dir, 0.1);
      applyOpacity(document.documentElement, next);
      const updated = { ...prev, window_opacity: next };
      clearTimeout(opacityTimer.current);
      opacityTimer.current = setTimeout(() => {
        void ipcSet(updated);
      }, 400);
      return updated;
    });
  }, []);
```
В `return { ... }` добавить `bumpOpacity`:
```ts
  return { settings, loading, save, bumpOpacity };
```

- [ ] **Step 4: Запустить — зелёные**

Run: `cd /Users/mark/i.tech && npx vitest run src/hooks/useSettings.test.ts`
Expected: PASS (все тесты useSettings).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSettings.ts src/hooks/useSettings.test.ts
git commit -m "feat(hooks): useSettings.bumpOpacity — шаг прозрачности с дебаунс-персистом"
```

---

## Task 4: `useWindowControls` ветка opacity + проброс в App

**Files:**
- Modify: `src/hooks/useWindowControls.ts`
- Create: `src/hooks/useWindowControls.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Написать падающий тест**

Создать `src/hooks/useWindowControls.test.ts`:
```ts
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/commands", () => ({
  moveWindowBy: vi.fn(() => Promise.resolve()),
}));

import { useWindowControls } from "./useWindowControls";

afterEach(() => {
  vi.clearAllMocks();
});

function keydown(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
}

describe("useWindowControls — opacity", () => {
  it("Cmd+Shift+Equal → onOpacityStep(1)", () => {
    const onOpacityStep = vi.fn<(dir: 1 | -1) => void>();
    renderHook(() => useWindowControls(20, vi.fn(), onOpacityStep));
    keydown({ metaKey: true, shiftKey: true, code: "Equal" });
    expect(onOpacityStep).toHaveBeenCalledWith(1);
  });
  it("Cmd+Shift+Minus → onOpacityStep(-1)", () => {
    const onOpacityStep = vi.fn<(dir: 1 | -1) => void>();
    renderHook(() => useWindowControls(20, vi.fn(), onOpacityStep));
    keydown({ metaKey: true, shiftKey: true, code: "Minus" });
    expect(onOpacityStep).toHaveBeenCalledWith(-1);
  });
  it("без Shift не триггерит opacity", () => {
    const onOpacityStep = vi.fn<(dir: 1 | -1) => void>();
    renderHook(() => useWindowControls(20, vi.fn(), onOpacityStep));
    keydown({ metaKey: true, code: "Equal" });
    expect(onOpacityStep).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd /Users/mark/i.tech && npx vitest run src/hooks/useWindowControls.test.ts`
Expected: FAIL — `useWindowControls` принимает 2 аргумента, `onOpacityStep` undefined.

- [ ] **Step 3: Реализовать ветку opacity**

Заменить содержимое `src/hooks/useWindowControls.ts` на:
```ts
import { useEffect } from "react";
import { moveWindowBy } from "@/ipc/commands";
import { moveDelta } from "@/lib/window-controls";

/**
 * Cmd/Ctrl+стрелки → move_window_by. Cmd+Enter → onSend.
 * Cmd+Shift+= / Cmd+Shift+- → onOpacityStep(±1) (прозрачность при фокусе HUD).
 */
export function useWindowControls(
  moveStep: number,
  onSend: () => void,
  onOpacityStep: (dir: 1 | -1) => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.code === "Equal") {
        e.preventDefault();
        onOpacityStep(1);
        return;
      }
      if (e.metaKey && e.shiftKey && e.code === "Minus") {
        e.preventDefault();
        onOpacityStep(-1);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.code === "Enter") {
        e.preventDefault();
        onSend();
        return;
      }
      const delta = moveDelta(e.code, moveStep);
      if (delta) {
        e.preventDefault();
        void moveWindowBy(delta.dx, delta.dy);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [moveStep, onSend, onOpacityStep]);
}
```

- [ ] **Step 4: Пробросить `bumpOpacity` в App**

В `src/App.tsx`:
- В деструктуризации `useSettings` добавить `bumpOpacity`:
```ts
  const { settings, save, bumpOpacity } = useSettings();
```
- В вызове `useWindowControls` (строка ~125) добавить третий аргумент:
```ts
  useWindowControls(settings.move_step, doSend, bumpOpacity);
```
(`bumpOpacity` стабильна — `useCallback` внутри хука; тип `(dir: 1 | -1) => void` совпадает.)

- [ ] **Step 5: Запустить тест + проверить App собирается**

Run: `cd /Users/mark/i.tech && npx vitest run src/hooks/useWindowControls.test.ts && npx tsc -b && echo OK`
Expected: PASS; `OK`.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useWindowControls.ts src/hooks/useWindowControls.test.ts src/App.tsx
git commit -m "feat: Cmd+Shift+=/- меняют прозрачность HUD при фокусе"
```

---

## Task 5: `HotkeyCapture` + интеграция в SettingsDialog

**Files:**
- Create: `src/components/HotkeyCapture.tsx`
- Modify: `src/components/SettingsDialog.tsx`

- [ ] **Step 1: Создать компонент `HotkeyCapture`**

Создать `src/components/HotkeyCapture.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { hotkeyFromEvent } from "@/lib/hotkey-capture";

export interface HotkeyCaptureProps {
  value: string;
  onChange: (hotkey: string) => void;
}

/** Кнопка-захват: клик → «Нажмите клавиши…» → следующий валидный keydown пишет комбо. Esc — отмена. */
export function HotkeyCapture({ value, onChange }: HotkeyCaptureProps) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setCapturing(false);
        return;
      }
      const hk = hotkeyFromEvent(e);
      if (hk !== null) {
        onChange(hk);
        setCapturing(false);
      }
    };
    // capture-фаза, чтобы перехватить раньше window-controls/opacity
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [capturing, onChange]);

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        setCapturing((c) => !c);
      }}
      className="w-full justify-start font-mono"
    >
      {capturing ? "Нажмите клавиши…" : value || "Не задано"}
    </Button>
  );
}
```

- [ ] **Step 2: Интегрировать в SettingsDialog**

В `src/components/SettingsDialog.tsx`:
- Добавить импорт:
```ts
import { HotkeyCapture } from "@/components/HotkeyCapture";
```
- Заменить поле хоткея (Field «Push-to-talk клавиша» с `<Input value={draft.hotkey} ...>`) на:
```tsx
          <Field label="Push-to-talk клавиша">
            <HotkeyCapture
              value={draft.hotkey}
              onChange={(hk) => {
                set("hotkey", hk);
              }}
            />
          </Field>
```
- В обработчике `save` убрать `.toUpperCase()`:
```ts
      hotkey: draft.hotkey.trim() || "V",
```

- [ ] **Step 3: Проверить сборку и линт**

Run: `cd /Users/mark/i.tech && npx tsc -b && npx eslint src/components/HotkeyCapture.tsx src/components/SettingsDialog.tsx --max-warnings 0 && echo OK`
Expected: `OK` (нет ошибок типов/линта; `Input` всё ещё используется для других полей — импорт не убираем).

- [ ] **Step 4: Прогнать все фронт-тесты**

Run: `cd /Users/mark/i.tech && npx vitest run 2>&1 | tail -3`
Expected: все зелёные.

- [ ] **Step 5: Commit**

```bash
git add src/components/HotkeyCapture.tsx src/components/SettingsDialog.tsx
git commit -m "feat(ui): захват комбо для хоткея записи в настройках"
```

---

## Task 6: Убрать оверлей-окно «запись»

**Files:**
- Modify: `src-tauri/src/lib.rs` (`emit_state`)
- Modify: `src-tauri/tauri.conf.json`
- Modify: `vite.config.ts`
- Delete: `overlay.html`

- [ ] **Step 1: Убрать show/hide оверлея из `emit_state`**

В `src-tauri/src/lib.rs` заменить функцию `emit_state` на:
```rust
fn emit_state(app: &AppHandle, s: state::RecorderState) {
    let _ = app.emit("state-changed", s);
}
```
(Удаляются строки с `get_webview_window("overlay")` и show/hide.)

- [ ] **Step 2: Убрать окно `overlay` из `tauri.conf.json`**

В `src-tauri/tauri.conf.json` в массиве `app.windows` удалить весь объект окна `overlay` (от `{ "label": "overlay", ... }` до его закрывающей `}`), оставив только окно `main`. Убедиться, что JSON валиден (массив `windows` содержит один объект `main`, без висящей запятой).

- [ ] **Step 3: Убрать вход `overlay` из `vite.config.ts`**

В `vite.config.ts` заменить блок `build` на (оставляем единственный вход — дефолтный `index.html`, поэтому `rollupOptions.input` больше не нужен):
```ts
  build: {},
```
(или удалить ключ `build` целиком — эквивалентно. Главное: убрать `rollupOptions.input` с `overlay`.)

- [ ] **Step 4: Удалить `overlay.html`**

```bash
cd /Users/mark/i.tech && git rm overlay.html
```

- [ ] **Step 5: Проверить сборку (Rust + фронт)**

Run:
```bash
cd /Users/mark/i.tech
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --manifest-path src-tauri/Cargo.toml --lib 2>&1 | tail -3
npm run build 2>&1 | grep -E 'overlay|error|built in' | tail -5
```
Expected: Rust собирается; `npm run build` проходит и в выводе НЕТ `dist/overlay.html` (только `dist/index.html`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: убрать отдельное оверлей-окно записи (статус остаётся в HUD)"
```

---

## Task 7: Финальная проверка + ручной прогон

**Files:** —

- [ ] **Step 1: Полная авто-верификация**

Run:
```bash
cd /Users/mark/i.tech
export PATH="$HOME/.cargo/bin:$PATH"
npm run lint --silent && echo "LINT OK"
npm run typecheck --silent && echo "TSC OK"
npm run knip --silent && echo "KNIP OK"
npm run format:check --silent >/dev/null && echo "FMT OK"
npx vitest run 2>&1 | grep -E 'Test Files|Tests '
cargo test --manifest-path src-tauri/Cargo.toml --lib 2>&1 | grep 'test result'
```
Expected: `LINT OK`, `TSC OK`, `KNIP OK`, `FMT OK`; vitest все зелёные; cargo все зелёные.

- [ ] **Step 2: Ручная проверка в приложении**

Run: `npm run tauri dev`

Проверить:
1. При фокусе HUD `Cmd+Shift+=` повышает прозрачность шагом, `Cmd+Shift+-` понижает; видно сразу; кламп на 0.2 и 1.0; после перезапуска значение сохранилось.
2. В настройках поле хоткея — кнопка; клик → «Нажмите клавиши…»; нажатие `Cmd+Shift+R` (или иного комбо) записывает его; `Esc` отменяет; сохранение → хоткей работает как PTT (запись по удержанию).
3. При записи (удержании PTT) НЕТ отдельного мини-окна; индикатор «Запись…» виден в самом HUD (StatusBar).

- [ ] **Step 3: (если правок не было) ничего не коммитить**

Если ручная проверка выявила баг — зафиксировать как отдельную задачу/правку. Иначе фича готова.

---

## Self-review (выполнено при написании плана)

**Покрытие спеки:**
- Часть 1 (opacity Cmd+Shift+=/-) → Task 1 (stepOpacity), Task 3 (bumpOpacity+persist), Task 4 (хоткей-ветка+проброс). ✓
- Часть 2 (захват комбо) → Task 2 (hotkeyFromEvent), Task 5 (HotkeyCapture+SettingsDialog, снят toUpperCase). ✓
- Часть 3 (убрать оверлей) → Task 6 (lib.rs/tauri.conf/vite/overlay.html). ✓
- Тесты (stepOpacity, hotkeyFromEvent, useWindowControls opacity, useSettings.bumpOpacity) → Task 1/2/4/3. ✓
- Вне рамок (множественные хоткеи, глобальные opacity-хоткеи) — не реализуется. ✓

**Согласованность типов:** `stepOpacity(current, dir: 1|-1, step)` (Task 1) ↔ вызов в `bumpOpacity` (Task 3). `onOpacityStep: (dir: 1|-1) => void` (Task 4) ↔ `bumpOpacity: (dir: 1|-1) => void` (Task 3) — типы совпадают, проброс прямой. `hotkeyFromEvent(e): string | null` (Task 2) ↔ использование в `HotkeyCapture` (Task 5). `SettingsApi` пополнен `bumpOpacity`.

**Плейсхолдеров нет** — весь код приведён построчно; pre-commit-совместимость учтена.
