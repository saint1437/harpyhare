# Индикатор «Думает…» при ожидании ответа — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На фазе ожидания ответа Claude (стрим идёт, текста ещё нет) показывать в ленте анимированный «Думает… {N}с» со счётчиком; при первом токене он сменяется стримящимся ответом (спека: `docs/superpowers/specs/2026-06-11-thinking-indicator-design.md`).

**Architecture:** Новый презентационный компонент `ThinkingIndicator` с внутренним секундным таймером (`setInterval`), и одна условная вставка в `AnswerPanel` (`streaming && !partial`). Чисто фронт: без Rust/IPC/изменений `llm.rs`.

**Tech Stack:** React 19, Tailwind (`animate-pulse`), vitest + @testing-library/react (fake timers).

**Объём:** одна задача, один коммит — фича маленькая и связная.

---

### Task 1: `ThinkingIndicator` + вставка в `AnswerPanel`

**Files:**
- Create: `src/components/ThinkingIndicator.tsx`
- Test: `src/components/ThinkingIndicator.test.tsx`
- Modify: `src/components/AnswerPanel.tsx` (импорт + условный рендер)
- Test: `src/components/AnswerPanel.test.tsx` (новый, минимальный)

- [ ] **Step 1: Падающий тест таймера**

```tsx
// src/components/ThinkingIndicator.test.tsx
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingIndicator } from "./ThinkingIndicator";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ThinkingIndicator", () => {
  it("показывает «Думает… 0с» на старте и растит счётчик каждую секунду", () => {
    const { getByText } = render(<ThinkingIndicator />);
    expect(getByText("Думает… 0с")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getByText("Думает… 2с")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/components/ThinkingIndicator.test.tsx`
Expected: FAIL — `Cannot find module './ThinkingIndicator'`.

- [ ] **Step 3: Реализовать компонент**

```tsx
// src/components/ThinkingIndicator.tsx
import { useEffect, useState } from "react";

/** Индикатор фазы ожидания ответа («Думает… {N}с»). Внутренний таймер тикает
 *  раз в секунду с момента маунта (≈ момент отправки запроса). */
export function ThinkingIndicator() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);

  return (
    <div
      className="flex items-center gap-2 text-[13px] text-muted-foreground"
      aria-live="polite"
    >
      <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
      <span>Думает… {seconds}с</span>
    </div>
  );
}
```

(Текст использует символ многоточия `…` (U+2026) — ровно как в тесте.)

- [ ] **Step 4: Убедиться, что тест проходит**

Run: `npx vitest run src/components/ThinkingIndicator.test.tsx`
Expected: PASS, 1 passed.

- [ ] **Step 5: Вставить индикатор в `AnswerPanel`**

В `src/components/AnswerPanel.tsx` добавить импорт (рядом с импортом `HtmlBlockChip`):

```tsx
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
```

В скролл-зоне, внутри фрагмента после рендера `partial`, добавить строку индикатора. Найти:

```tsx
            {partial !== null && partial !== "" && (
              <Assistant text={partial} components={components} />
            )}
          </>
```

и заменить на:

```tsx
            {partial !== null && partial !== "" && (
              <Assistant text={partial} components={components} />
            )}
            {streaming && (partial === null || partial === "") && <ThinkingIndicator />}
          </>
```

(`streaming` — уже существующий проп `AnswerPanel`. Во время стрима `messages` содержит реплику пользователя, поэтому `empty===false` и этот фрагмент рендерится.)

- [ ] **Step 6: Минимальный тест `AnswerPanel`**

```tsx
// src/components/AnswerPanel.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnswerPanel } from "./AnswerPanel";
import type { ChatMessage } from "@/lib/chats";

const userMsg: ChatMessage = { role: "user", text: "напиши тетрис", images: [] };

describe("AnswerPanel — индикатор ожидания", () => {
  it("показывает «Думает…», пока стрим без текста", () => {
    const { getByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        partial=""
        streaming={true}
        onCopy={() => undefined}
        onOpenPreview={() => undefined}
      />,
    );
    expect(getByText(/Думает…/)).toBeTruthy();
  });

  it("не показывает индикатор, когда пошёл текст ответа", () => {
    const { queryByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        partial="Привет"
        streaming={true}
        onCopy={() => undefined}
        onOpenPreview={() => undefined}
      />,
    );
    expect(queryByText(/Думает…/)).toBeNull();
  });

  it("не показывает индикатор без стрима", () => {
    const { queryByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        partial={null}
        streaming={false}
        onCopy={() => undefined}
        onOpenPreview={() => undefined}
      />,
    );
    expect(queryByText(/Думает…/)).toBeNull();
  });
});
```

- [ ] **Step 7: Прогнать тесты и общие проверки**

Run: `npx vitest run src/components/ThinkingIndicator.test.tsx src/components/AnswerPanel.test.tsx`
Expected: PASS (1 + 3 = 4 passed).

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное.

- [ ] **Step 8: Браузерный смоук**

Run: `(npm run dev &) ; sleep 4; curl -s "http://localhost:1420/" | head -3; pkill -f vite`
Expected: vite отдаёт страницу. Не оставляй dev-сервер запущенным.

- [ ] **Step 9: Commit**

```bash
git add src/components/ThinkingIndicator.tsx src/components/ThinkingIndicator.test.tsx src/components/AnswerPanel.tsx src/components/AnswerPanel.test.tsx
git commit -m "feat(ui): индикатор «Думает… Nс» на фазе ожидания ответа"
```

---

### Ручная приёмка (выполняет пользователь после мержа/сборки)

- Отправить «напиши тетрис одним HTML-файлом» → сразу видно «Думает… Nс», счётчик растёт раз в секунду.
- Как пошёл текст — индикатор исчез, дальше стримится ответ.
- «Стоп» во время ожидания убирает индикатор; ошибка/отмена тоже убирает; ошибка показывается в строке ошибок.
- Обычный быстрый ответ: индикатор мелькает кратко (это норм).
