# Линт-тулчейн (ESLint + Prettier + Knip + Husky) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять строгий линт-тулчейн (ESLint type-aware + Prettier с сортировкой Tailwind-классов + Knip + Husky/lint-staged), запускающийся на pre-commit вместе с typecheck, и привести существующий код к зелёному baseline без обхода правил TS.

**Architecture:** Раздельные линт и формат (ESLint + Prettier, склеены через `eslint-config-prettier`). Pre-commit: `lint-staged` (eslint --fix + prettier на застейдженных) → `tsc -b` (typecheck всего) → `knip` (мёртвый код). Строгость TS усилена флагами tsconfig и ESLint-запретами суппрессий/`any`/non-null/`unsafe`.

**Tech Stack:** ESLint 9 (flat config), typescript-eslint v8, Prettier 3 + prettier-plugin-tailwindcss, Knip 5, Husky 9, lint-staged 15. npm. TS ~5.6, Tailwind v4, Vite 6, Vitest 4, React 19.

**Порядок задач важен:** install → Prettier baseline (большой механический реформат раньше всего) → tsconfig + детерминированные TS-фиксы → ESLint + baseline-фиксы → Knip → Husky/pre-commit → финальная проверка + доки.

**Замечание про итеративность:** задачи 4 (ESLint) и 5 (Knip) частично исследовательские — точный список находок проявляется только после запуска инструмента. Для них шаги дают конкретные команды и правила разрешения находок по категориям, а не построчный код каждого фикса (это природа внедрения линтера, а не плейсхолдер). Детерминированные TS-фиксы (задача 3) даны построчно.

---

## Файловая структура

**Создаётся:**
- `eslint.config.js` — flat config ESLint (type-aware, react, hooks, refresh, import-x, строгие запреты).
- `prettier.config.js` — Prettier + plugin tailwindcss.
- `.prettierignore` — что не форматировать.
- `knip.json` — конфиг Knip.
- `.husky/pre-commit` — хук.
- `.lintstagedrc.json` — конфиг lint-staged.

**Модифицируется:**
- `package.json` — devDependencies, npm-скрипты, `prepare` для husky.
- `tsconfig.json` — строгие флаги.
- `tsconfig.node.json` — добавить `vitest.config.ts` в `include`.
- `src/main.tsx`, `src/hooks/useChats.ts`, `src/components/SettingsDialog.tsx`, `src/hooks/useChats.test.ts`, `src/lib/chats.test.ts`, `src/test-setup.ts` — детерминированные strict-фиксы.
- прочие `src/**` — реформат Prettier (механически) + ESLint baseline-фиксы (по находкам).
- `CLAUDE.md` — команды линта/формата/knip.

---

## Task 1: Установка зависимостей

**Files:** Modify `package.json` (+ `package-lock.json`).

- [ ] **Step 1: Установить dev-зависимости**

Run (одной командой; версии — мажоры, npm подберёт совместимые минорные):

```bash
cd /Users/mark/i.tech
npm install -D \
  eslint@^9 \
  typescript-eslint@^8 \
  @eslint/js@^9 \
  eslint-plugin-react@^7 \
  eslint-plugin-react-hooks@^5 \
  eslint-plugin-react-refresh@^0.4 \
  eslint-plugin-import-x@^4 \
  eslint-import-resolver-typescript@^3 \
  prettier@^3 \
  prettier-plugin-tailwindcss@^0.6 \
  eslint-config-prettier@^10 \
  knip@^5 \
  husky@^9 \
  lint-staged@^15 \
  globals@^15
```

Expected: установка без ошибок; `package.json` `devDependencies` пополнен.

Примечание: используем `eslint-plugin-import-x` (а не `eslint-plugin-import`) — это поддерживаемый форк с нативной поддержкой flat-config и TS-резолвера; функционально покрывает «порядок импортов» из спеки.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: установить eslint/prettier/knip/husky и плагины"
```

---

## Task 2: Prettier — конфиг и реформат всего проекта

**Files:** Create `prettier.config.js`, `.prettierignore`; Modify `package.json` (scripts); reformat `src/**`, configs.

- [ ] **Step 1: Создать `prettier.config.js`**

```js
/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  singleQuote: false,
  semi: true,
  trailingComma: "all",
  plugins: ["prettier-plugin-tailwindcss"],
  // Tailwind v4 использует CSS-first конфиг — указываем входной стиль для сортировки классов.
  tailwindStylesheet: "./src/index.css",
  tailwindFunctions: ["cn", "cva"],
};
```

- [ ] **Step 2: Создать `.prettierignore`**

```
dist
src-tauri/target
src-tauri/gen
package-lock.json
*.md
```

(Markdown игнорируем, чтобы Prettier не перелопатил доки/спеки; код и конфиги форматируются.)

- [ ] **Step 3: Добавить npm-скрипты формата**

В `package.json` `scripts` добавить:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 4: Прогнать форматирование по всему проекту**

Run:

```bash
cd /Users/mark/i.tech && npx prettier --write .
```

Expected: Prettier переформатирует множество файлов (кавычки, ширина строк, сортировка Tailwind-классов в компонентах). Это большой, но механический дифф.

- [ ] **Step 5: Убедиться, что поведение не сломано**

Run:

```bash
npx vitest run 2>&1 | tail -3
npx tsc -b 2>&1 | tail -3 || true
```

Expected: `vitest` — 37 passed (реформат не меняет логику). `tsc -b` может всё ещё проходить (strict-флаги ещё не добавлены) — это нормально; цель шага — убедиться, что Prettier ничего не сломал.

- [ ] **Step 6: Проверка чистоты формата**

Run: `npx prettier --check .`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "style: prettier-конфиг (tailwind-сортировка) + реформат проекта"
```

---

## Task 3: Строгий tsconfig + детерминированные TS-фиксы

**Files:** Modify `tsconfig.json`, `tsconfig.node.json`, `src/main.tsx:6`, `src/hooks/useChats.ts:46,~75-82,~119-125`, `src/components/SettingsDialog.tsx:~125-131`, `src/test-setup.ts:6`, `src/hooks/useChats.test.ts:30,38,52,62`, `src/lib/chats.test.ts:54-56`.

- [ ] **Step 1: Добавить строгие флаги в `tsconfig.json`**

В `compilerOptions` (после `noFallthroughCasesInSwitch`) добавить:

```json
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
```

- [ ] **Step 2: Расширить `tsconfig.node.json` include**

Заменить `"include": ["vite.config.ts"]` на:

```json
  "include": ["vite.config.ts", "vitest.config.ts"]
```

- [ ] **Step 3: Прогнать `tsc -b` — увидеть детерминированные ошибки**

Run: `export PATH="$HOME/.cargo/bin:$PATH"; npx tsc -b 2>&1 | grep 'error TS' | head -30`
Expected: ~13 ошибок в местах ниже (плюс 5 non-null `!` — их `tsc` не ловит, чиним вместе по списку).

- [ ] **Step 4: Фикс `src/main.tsx:6` (non-null `!` на root)**

Заменить:

```tsx
createRoot(document.getElementById("root")!).render(
```

на:

```tsx
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Корневой элемент #root не найден");
createRoot(rootElement).render(
```

(Закрывающую `)` оставить как была.)

- [ ] **Step 5: Фикс `src/hooks/useChats.ts:46` (non-null `!` на 2d-контексте)**

Заменить строку:

```ts
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
```

на:

```ts
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-контекст канваса недоступен");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
```

- [ ] **Step 6: Фикс `src/hooks/useChats.ts` загрузки (`initial[0]` возможно undefined)**

В эффекте загрузки заменить:

```ts
      const restored = deserializeChats(json);
      const initial = restored ?? [createChat(1)];
      setChats(initial);
      setActiveId(initial[0].id);
      loaded.current = true;
```

на:

```ts
      const restored = deserializeChats(json);
      const initial = restored ?? [createChat(1)];
      const first = initial[0];
      if (!first) return; // deserializeChats не возвращает пустой массив — защита для типов
      setChats(initial);
      setActiveId(first.id);
      loaded.current = true;
```

- [ ] **Step 7: Фикс `src/hooks/useChats.ts` removeChat (`neighbor` возможно undefined)**

Заменить:

```ts
          const neighbor = next[Math.min(idx, next.length - 1)];
          return neighbor.id;
```

на:

```ts
          const neighbor = next[Math.min(idx, next.length - 1)];
          return neighbor ? neighbor.id : cur;
```

- [ ] **Step 8: Фикс `src/components/SettingsDialog.tsx` слайдера (`v` возможно undefined)**

Заменить `onValueChange` слайдера прозрачности:

```tsx
              onValueChange={([v]) => {
                set("window_opacity", v);
                applyOpacity(document.documentElement, v);
              }}
```

на:

```tsx
              onValueChange={([v]) => {
                if (v === undefined) return;
                set("window_opacity", v);
                applyOpacity(document.documentElement, v);
              }}
```

- [ ] **Step 9: Фикс `src/test-setup.ts:6` (доступ через index signature)**

Заменить:

```ts
(globalThis as Record<string, unknown>).jest = {
  advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
};
```

на:

```ts
(globalThis as Record<string, unknown>)["jest"] = {
  advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
};
```

- [ ] **Step 10: Фикс `src/hooks/useChats.test.ts` (index-доступ в ассертах)**

Заменить четыре строки (используем `?.` вместо обхода):

- строка 30: `expect(result.current.activeId).toBe(result.current.chats[0].id);`
  → `expect(result.current.activeId).toBe(result.current.chats[0]?.id);`
- строка 38: `expect(result.current.activeId).toBe(result.current.chats[CHAT_LIMIT - 1].id);`
  → `expect(result.current.activeId).toBe(result.current.chats[CHAT_LIMIT - 1]?.id);`
- строка 52: `expect(result.current.active.messages[0].role).toBe("user");`
  → `expect(result.current.active.messages[0]?.role).toBe("user");`
- строка 62: `expect(result.current.active.messages[1].text).toBe("ответ");`
  → `expect(result.current.active.messages[1]?.text).toBe("ответ");`

- [ ] **Step 11: Фикс `src/lib/chats.test.ts:53-56` (non-null `!` + index-доступ)**

Заменить блок:

```ts
    expect(restored).not.toBeNull();
    expect(restored![0].messages[0].text).toBe("вопрос");
    expect(restored![0].draft).toBe("хвост");
    expect(restored![0].draftAttachments).toEqual([]);
```

на:

```ts
    expect(restored).not.toBeNull();
    expect(restored?.[0]?.messages[0]?.text).toBe("вопрос");
    expect(restored?.[0]?.draft).toBe("хвост");
    expect(restored?.[0]?.draftAttachments).toEqual([]);
```

- [ ] **Step 12: Проверить, что `tsc -b` зелёный, тесты проходят**

Run:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
npx tsc -b && echo "TSC OK"
npx vitest run 2>&1 | tail -3
```

Expected: `TSC OK` (ноль ошибок); `vitest` — 37 passed.

- [ ] **Step 13: Commit**

```bash
git add tsconfig.json tsconfig.node.json src
git commit -m "build: строгие tsconfig-флаги + фиксы baseline (non-null/index-access)"
```

---

## Task 4: ESLint flat config + чистый lint-baseline

**Files:** Create `eslint.config.js`; Modify `package.json` (scripts); fix `src/**` по находкам.

- [ ] **Step 1: Создать `eslint.config.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importX from "eslint-plugin-import-x";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "src-tauri", "*.config.js", "vite.config.ts", "vitest.config.ts"] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "import-x": importX,
    },
    settings: {
      react: { version: "detect" },
      "import-x/resolver": { typescript: true },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Запрет обхода правил TS:
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": "allow-with-description" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      // Порядок импортов (авто-фиксится):
      "import-x/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },

  // Конфиг-файлы и JS — без type-aware правил:
  { files: ["**/*.js"], ...tseslint.configs.disableTypeChecked },

  prettier, // отключает форматные правила — формат за Prettier
);
```

Примечание для исполнителя: точные имена flat-экспортов плагинов зависят от версии. Если какой-то импорт упадёт (`reactHooks.configs.recommended.rules` / `react.configs.flat...`), сверься с README установленной версии плагина и поправь обращение (логика правил та же). Не отключай строгость, чтобы «заработало» — чини обращение к конфигу.

- [ ] **Step 2: Добавить npm-скрипты линта**

В `package.json` `scripts`:

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix"
```

- [ ] **Step 3: Авто-фикс + первичный отчёт**

Run:

```bash
cd /Users/mark/i.tech
npx eslint . --fix
npx eslint . 2>&1 | tail -40
```

Expected: часть находок (импорты, мелочи) авто-исправится; останется список ручных. Типичные категории и как чинить **без обхода правил**:
  - `@typescript-eslint/no-unsafe-*` от `JSON.parse(...)` (тип `any`) — в тестах `chats.test.ts`/`useChats.test.ts`: типизировать разбор, напр. `const parsed = JSON.parse(json) as unknown[];` затем сужать, либо `JSON.parse(json) as { messages: {text: string}[]; draft: string }[]` под нужды ассерта. Цель — убрать поток `any`.
  - `@typescript-eslint/no-floating-promises` — добавить `void` или `await` (в проекте уже используется `void` — следовать паттерну).
  - `@typescript-eslint/no-misused-promises` (например, async в обработчике события) — обернуть/`void`.
  - `@typescript-eslint/restrict-template-expressions` — приводить к строке явно.
  - `react-refresh/only-export-components` в `src/components/ui/**` (shadcn экспортирует и компонент, и `*Variants`) — оставлено как `warn` с `allowConstantExport`, не блокирует; если всё же мешает — точечный `// eslint-disable-next-line` НЕ использовать, вместо этого вынести вариант в отдельный файл ИЛИ оставить warn (warn не валит `--max-warnings 0`? — валит; см. Step 4). Для `ui/**` допустимо добавить override-блок, ослабляющий `react-refresh/only-export-components` до `off` ТОЛЬКО для `src/components/ui/**`.

- [ ] **Step 4: Довести до нуля ошибок и предупреждений**

Чинить найденное по правилам выше, пока не будет чисто. Для shadcn-генерата при необходимости добавить в `eslint.config.js` override:

```js
  { files: ["src/components/ui/**"], rules: { "react-refresh/only-export-components": "off" } },
```

(добавлять перед `prettier` в массиве). Не ослаблять строгие TS-правила глобально.

Run (финал): `npx eslint . --max-warnings 0 && echo "ESLINT CLEAN"`
Expected: `ESLINT CLEAN`.

- [ ] **Step 5: Тесты по-прежнему зелёные**

Run: `npx vitest run 2>&1 | tail -3 && npx tsc -b && echo OK`
Expected: 37 passed; `OK`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "build: eslint flat config (строгий, type-aware) + чистый lint-baseline"
```

---

## Task 5: Knip — конфиг и чистый baseline

**Files:** Create `knip.json`; Modify `package.json` (script); возможные правки/ignore по находкам.

- [ ] **Step 1: Создать `knip.json`**

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["src/main.tsx", "vite.config.ts", "vitest.config.ts", "src/test-setup.ts"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": ["src-tauri/**"],
  "ignoreDependencies": ["tw-animate-css"]
}
```

(`tw-animate-css` подключается из CSS `@import`, который knip не парсит как зависимость — заносим в ignore, чтобы не считался unused. Список ignore уточнить по факту в Step 2.)

- [ ] **Step 2: Добавить скрипт и прогнать knip**

В `package.json` `scripts`: `"knip": "knip"`.

Run: `cd /Users/mark/i.tech && npx knip 2>&1 | tail -40`
Expected: отчёт о неиспользуемых файлах/экспортах/зависимостях/типах.

- [ ] **Step 3: Разрешить находки до чистого отчёта**

По каждой находке — осознанное решение:
  - **Реально мёртвый экспорт/файл** (наш код, никем не используется) → удалить.
  - **Намеренно-публичное** (например, не все варианты в `src/components/ui/**` из shadcn, или экспорт, используемый только в типах) → внести точечно в `knip.json` (`ignore` для файлов, или `ignoreExportsUsedInFile`, или перечислить в конфиге shadcn-каталог: `"ignore": ["src/components/ui/**"]` если шум массовый и эти компоненты — внешняя библиотека-вендор).
  - **Ложная unused-зависимость** (подключается через CSS/Tauri/рантайм) → `ignoreDependencies`.
Не подавлять находки про НАШ мёртвый код — его удалять.

Run (финал): `npx knip && echo "KNIP CLEAN"`
Expected: `KNIP CLEAN` (knip выходит с кодом 0, когда находок нет).

- [ ] **Step 4: Тесты/типы зелёные (если что-то удаляли)**

Run: `npx vitest run 2>&1 | tail -3 && npx tsc -b && echo OK`
Expected: 37 passed; `OK`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: knip-конфиг + чистый baseline мёртвого кода"
```

---

## Task 6: Husky + lint-staged + pre-commit

**Files:** Create `.husky/pre-commit`, `.lintstagedrc.json`; Modify `package.json` (`prepare` script).

- [ ] **Step 1: Инициализировать husky**

Run:

```bash
cd /Users/mark/i.tech
npx husky init
```

Expected: создаётся `.husky/pre-commit` (заглушка `npm test`) и в `package.json` добавляется `"prepare": "husky"`. Если `prepare` не добавился — добавить вручную в `scripts`: `"prepare": "husky"`.

- [ ] **Step 2: Создать `.lintstagedrc.json`**

```json
{
  "*.{ts,tsx}": ["eslint --fix --max-warnings 0", "prettier --write"],
  "*.{json,css}": ["prettier --write"]
}
```

(`*.md` намеренно не трогаем — синхронно с `.prettierignore`.)

- [ ] **Step 3: Записать `.husky/pre-commit`**

Полностью заменить содержимое `.husky/pre-commit` на:

```sh
npx lint-staged
npm run typecheck
npm run knip
```

(где `typecheck` — добавляем в Step 4.)

- [ ] **Step 4: Добавить `typecheck` скрипт**

В `package.json` `scripts` добавить `"typecheck": "tsc -b"`.

- [ ] **Step 5: Проверить, что чистый коммит проходит**

Run:

```bash
cd /Users/mark/i.tech
git add -A
git commit -m "build: husky + lint-staged + pre-commit (lint-staged → tsc → knip)"
```

Expected: pre-commit отрабатывает (lint-staged по застейдженным, tsc, knip — всё зелёное), коммит создаётся.

- [ ] **Step 6: Проверить, что «плохой» код блокирует коммит**

Создать временный файл с нарушением и попытаться закоммитить:

```bash
cd /Users/mark/i.tech
printf 'export const bad = (x: any) => x;\n' > src/__bad_tmp.ts
git add src/__bad_tmp.ts
git commit -m "test: должен упасть" ; echo "EXIT=$?"
```

Expected: коммит **отклонён** (eslint ловит `no-explicit-any` через lint-staged, `EXIT` ≠ 0).

- [ ] **Step 7: Убрать временный файл**

```bash
git restore --staged src/__bad_tmp.ts
rm src/__bad_tmp.ts
```

Expected: рабочее дерево чистое; временный файл не закоммичен.

---

## Task 7: Финальная проверка + документация

**Files:** Modify `CLAUDE.md`.

- [ ] **Step 1: Полный прогон всех проверок**

Run:

```bash
cd /Users/mark/i.tech
export PATH="$HOME/.cargo/bin:$PATH"
npm run lint --silent && echo "LINT OK"
npm run typecheck && echo "TSC OK"
npm run knip && echo "KNIP OK"
npm run format:check && echo "FMT OK"
npx vitest run 2>&1 | tail -3
cargo test --manifest-path src-tauri/Cargo.toml --lib 2>&1 | grep 'test result'
```

Expected: `LINT OK`, `TSC OK`, `KNIP OK`, `FMT OK`; vitest 37 passed; cargo 51 passed.

- [ ] **Step 2: Обновить раздел Commands в `CLAUDE.md`**

В `CLAUDE.md` в блок `## Commands` (после секции Frontend tests) добавить:

```
# Lint / format / dead-code (также гоняются на pre-commit через husky+lint-staged)
npm run lint            # eslint (строгий, type-aware) — без обхода правил TS
npm run lint:fix        # eslint --fix
npm run format          # prettier --write (сортирует Tailwind-классы)
npm run format:check    # prettier --check
npm run typecheck       # tsc -b
npm run knip            # неиспользуемые файлы/экспорты/зависимости

# Pre-commit (husky): lint-staged (eslint --fix + prettier на застейдженных) → tsc -b → knip
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: команды линт-тулчейна в CLAUDE.md"
```

---

## Self-review (выполнено при написании плана)

**Покрытие спеки:**
- ESLint строгий type-aware → Task 4. ✓
- Prettier + tailwind-сортировка → Task 2. ✓
- Knip → Task 5. ✓
- Husky + lint-staged, запуск на коммите → Task 6. ✓
- Typecheck («build») на pre-commit → Task 6 (Step 3-4), Task 3 (флаги). ✓
- Строгий TS / запрет обхода (ban-ts-comment, no-explicit-any, no-non-null-assertion, no-unsafe-*, tsconfig-флаги) → Task 3 + Task 4. ✓
- Baseline-фиксы (5 non-null, 12 noUncheckedIndexedAccess, 1 index-signature, ESLint-находки) → Task 3 (детерминированные) + Task 4 (ESLint). ✓
- shadcn `ui/**` обработка → Task 4 (Step 4 override). ✓
- npm-скрипты для CI → Task 2/4/5/6. ✓
- Вне рамок (полный build на коммит, Rust-хуки, CI-workflow, exactOptionalPropertyTypes) — не реализуется. ✓

**Плейсхолдеры:** детерминированные фиксы даны построчно; для ESLint/Knip baseline (исследовательских по природе) даны команды + правила разрешения находок по категориям — это не «add error handling», а конкретный процесс приведения к нулю находок инструмента.

**Согласованность:** имена скриптов (`lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `knip`) едины между Task 2/4/5/6 и используются в `.husky/pre-commit` и CLAUDE.md. Флаги tsconfig (Task 3) согласованы со спекой.
