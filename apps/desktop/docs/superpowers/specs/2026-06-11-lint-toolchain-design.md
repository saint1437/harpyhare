# Линт-тулчейн: ESLint + Prettier + Knip + Husky (строгий TS) — дизайн

**Дата:** 2026-06-11
**Статус:** утверждён, готов к плану реализации

## Задача

В проекте нет линтера, форматтера, проверки мёртвого кода и git-хуков. Нужно:
- **ESLint** (строгий, type-aware) + **Prettier** (с сортировкой Tailwind-классов) + **Knip** (мёртвый код/зависимости) + **Husky** + **lint-staged**.
- Всё это запускается на `git commit` (pre-commit), плюс на коммите гоняется проверка типов.
- TypeScript строгий: **нельзя обходить правила TS** (запрет суппрессий и небезопасных приведений).

## Решения (зафиксированы в брейншторме)

| Вопрос | Решение |
|---|---|
| Что значит «build на коммит» | **Typecheck** (`tsc -b`) на pre-commit, НЕ полный `vite build` (быстрее; полный билд — в CI/pre-push при желании) |
| Уровень строгости TS | **Максимальный**: бан суппрессий, `any`, non-null `!`, небезопасных `as`; доп. tsconfig-флаги |
| Rust в pre-commit | Вне scope (список — JS-инструменты). Опционально добавить `cargo fmt`/`clippy` позже |
| Knip | Блокирует коммит; baseline приведён к чистому отчёту |

## Замеренный объём правок существующего кода (для зелёного baseline)

- non-null `!` в `src`: **2** (включая `canvas.getContext("2d")!`).
- реальных type-assertions `as`: **~5–6** (`as string`, `as Settings`, `as Partial<Chat>`, `as Record<string, unknown>`, `as DataTransferItem`); остальные `as` — импорты-алиасы/namespace, не трогаются.
- `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`: **0**.
- явный `any`: **0**.
- `noUncheckedIndexedAccess`: **12** ошибок.

Итого ~20 точечных правок.

## Инструменты и версии

Под текущий стек (ESLint 9, TS ~5.6, Tailwind v4, Vite 6, Vitest 4, npm):

- **ESLint 9** — flat config `eslint.config.js`.
- **typescript-eslint v8** — пресеты `strictTypeChecked` + `stylisticTypeChecked`, type-aware через `parserOptions.projectService: true`.
- **eslint-plugin-react** (+ `react/jsx-runtime`), **eslint-plugin-react-hooks**, **eslint-plugin-react-refresh** (vite HMR), **eslint-plugin-import** (порядок/группировка импортов).
- **Prettier 3** — `prettier.config.js`, плагин **prettier-plugin-tailwindcss** (сортировка классов). **eslint-config-prettier** — гасит форматные правила ESLint (линт и формат раздельны).
- **Knip** — `knip.json`.
- **Husky 9** + **lint-staged**.

## Строгость TypeScript

### tsconfig.json (добавить к существующим strict-флагам)
- `noUncheckedIndexedAccess` — индексный доступ возвращает `T | undefined`.
- `noImplicitReturns`.
- `noImplicitOverride`.
- `noPropertyAccessFromIndexSignature`.
- **НЕ включаем** `exactOptionalPropertyTypes` (сильный конфликт с React-пропсами; отдельно при желании).

`tsconfig.node.json` (`include`) расширить, чтобы покрыть `vite.config.ts` **и** `vitest.config.ts` (сейчас только `vite.config.ts`).

### ESLint — запрет обхода правил
- `@typescript-eslint/ban-ts-comment`: `@ts-ignore`/`@ts-nocheck` — запрещены; `@ts-expect-error` — только с `description` (`ts-expect-error: "allow-with-description"`).
- `@typescript-eslint/no-explicit-any`: error.
- `@typescript-eslint/no-non-null-assertion`: error (бан `!`).
- `@typescript-eslint/no-unnecessary-type-assertion`: error.
- Семья `no-unsafe-*` (assignment/member-access/call/argument/return) — из `strictTypeChecked` (ловит «отмывание» типов через `any`).
- **Глухой бан любого `as` не ставится** — легитимные `as const`, namespace-импорты и необходимые DOM-приведения остаются; баним именно небезопасные/избыточные приведения.

### Baseline-правки
Привести `src/**` к зелёному `tsc -b` и `eslint`:
- 2× `!` → явные guard'ы / проверки (например, `const ctx = canvas.getContext("2d"); if (!ctx) return; ...`).
- 12× `noUncheckedIndexedAccess` — добавить проверки/`?.`/ранние возвраты там, где индексный доступ теперь `| undefined`.
- ~5 `as` — ревизия: убрать избыточные, оставить безопасные.

## Pre-commit пайплайн

`Husky` `pre-commit` хук вызывает по порядку (любой провал → коммит блокируется):

1. **lint-staged** (только застейдженные файлы — быстро):
   - `*.{ts,tsx}` → `eslint --fix --max-warnings 0` затем `prettier --write`.
   - `*.{json,css,md}` → `prettier --write`.
2. **`tsc -b`** — typecheck всего проекта (выбор вместо полного билда).
3. **`knip`** — проверка мёртвого кода/зависимостей по всему проекту.

### npm-скрипты (для ручного запуска и будущего CI)
```
"lint":       "eslint .",
"lint:fix":   "eslint . --fix",
"format":     "prettier --write .",
"format:check":"prettier --check .",
"typecheck":  "tsc -b",
"knip":       "knip"
```
(`build` остаётся `tsc -b && vite build` без изменений.)

## Knip baseline

- `knip.json`: entry — `index.html` → `src/main.tsx` (авто через vite-плагин), vitest-конфиг, `src/test-setup.ts`; project — `src/**`.
- Привести отчёт к чистому: удалить реально мёртвые экспорты; намеренно-публичные (например, неиспользуемые варианты в `src/components/ui/**` из shadcn) — в `ignore`/`ignoreExportsUsedInFile`.
- Knip не анализирует Rust — `src-tauri/**` вне его зоны.

## Покрытие конфиг-файлов и shadcn

- ESLint flat config линтует и `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `prettier.config.js` (с корректным `projectService`/`tsconfigRootDir`).
- `src/components/ui/**` (shadcn-генерат) линтуется; если type-checked правила дают непропорциональный шум — точечно ослабить правила **только** для этого каталога (строгость нашего кода не трогаем).

## Вне рамок (YAGNI)

- Полный `vite build` на каждый коммит (только typecheck).
- Rust-хуки (`cargo fmt`/`clippy`) — опционально позже.
- CI-пайплайн (скрипты готовы к нему, но сам workflow не настраиваем).
- `exactOptionalPropertyTypes`.
- commitlint / conventional-commits проверка сообщений.

## Критерий готовности

- `npm run lint`, `npm run typecheck`, `npm run knip`, `npm run format:check` — все зелёные на текущем коде.
- `git commit` запускает pre-commit; намеренная ошибка (any/`!`/мёртвый экспорт/несформатированный файл) блокирует коммит.
- `cargo test`/`vitest` по-прежнему зелёные (правки baseline не ломают поведение).
