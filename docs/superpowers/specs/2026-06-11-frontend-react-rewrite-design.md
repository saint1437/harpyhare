# Дизайн: переписывание frontend на React 19 + shadcn/ui

Дата: 2026-06-11
Статус: утверждён пользователем (детали — в этом документе)

## Цель

Переписать frontend Tauri-приложения itech с vanilla TS на современный стек (React 19 + shadcn/ui), хорошо структурировать код по слоям и полностью сменить дизайн на тёмную графит-оксблад тему в духе Raycast/Linear. Бэкенд на Rust не меняется — контракт команд/событий/настроек матчится 1:1.

## Требования (зафиксированы с пользователем)

- **Стек:** React 19 + Vite + TypeScript (strict) + Tailwind v4 + shadcn/ui + lucide-react.
- **Стили:** Tailwind (на нём же построен shadcn/ui).
- **Дизайн:** near-black графитовый фон + приглушённый оксблад/оксфорд красный акцент (refined/editorial), плотная структура Raycast/Linear, моноширинный шрифт для мета-данных.
- **Тесты:** чистая логика (vitest) + ключевые хуки (mocked IPC). Без хрупких компонентных DOM-тестов.
- **Бэкенд не трогаем:** zero Rust changes.

## Зафиксированный контракт бэкенда (frontend обязан матчить 1:1)

**Команды** (`invoke`, аргументы приходят camelCase):
- `send_to_claude({ text: string, images: ImagePayload[] })`
- `cancel_stream()`
- `retry_transcription()`
- `get_settings() -> Settings`
- `set_settings({ newSettings: Settings })`
- `move_window_by({ dx: number, dy: number })`
- `set_ptt_suspended({ suspended: boolean })`
- `open_audio_permission_settings()`
- `capture_available() -> boolean`
- `open_external({ url: string })`

**События** (`listen`):
- `state-changed` — payload `"idle" | "recording" | "transcribing"`
- `transcript-ready` — payload `string` (распознанный текст)
- `stt-error` — payload `string`
- `llm-delta` — payload `string` (кусок ответа)
- `llm-done` — без payload
- `llm-error` — payload `string`

**Settings** (8 полей): `anthropic_api_key`, `groq_api_key`, `model`, `system_prompt`, `hotkey`, `auto_send: boolean`, `window_opacity: number`, `move_step: number`. Модели в селекте: `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`.

**ImagePayload:** `{ media_type: string, data: string }` (base64 без dataURL-префикса).

## Стек и инструменты

| Слой | Выбор |
|---|---|
| Фреймворк | **React 19** |
| Сборка | **Vite 6** + TypeScript strict |
| Стили | **Tailwind v4** (CSS-first `@theme`, oklch-переменные) |
| Компоненты | **shadcn/ui** (стиль new-york), копируются в `src/components/ui/` |
| Иконки | **lucide-react** |
| Markdown | **react-markdown** + **remark-gfm** (таблицы/GFM, как в текущем `marked`) — заменяет `marked`+`dompurify` |
| IPC | `@tauri-apps/api` (остаётся) |

`react-markdown` рендерит без `dangerouslySetInnerHTML` → XSS-поверхность убирается; перехват ссылок (`open_external`) делается чистым кастомным компонентом `<a>` вместо делегирования кликов.

**Удаляются:** `marked`, `dompurify`. **Добавляются:** `react`, `react-dom`, `@vitejs/plugin-react`, `tailwindcss@4`, `@tailwindcss/vite`, `react-markdown`, `remark-gfm`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@testing-library/react`, `@testing-library/dom` (dev).

## Архитектура (слои)

Главный принцип: **только слой `ipc/` знает про Tauri**. Всё остальное (хуки, компоненты) зависит от типизированного интерфейса, который легко мокать.

```
src/
├── main.tsx                 # React root
├── App.tsx                  # композиция хуков + компонентов (тонкий)
├── index.css                # Tailwind @import + @theme (токены графит/оксблад)
├── ipc/
│   ├── types.ts             # Settings, RecorderState, ImagePayload, payload-типы
│   ├── commands.ts          # типизированные invoke-обёртки (10 команд)
│   ├── events.ts            # типизированные listen-хелперы (6 событий)
│   └── env.ts               # isTauri(); в браузере команды/события — no-op/мок
├── lib/
│   ├── composer.ts          # ЧИСТАЯ логика вложений (перенос, тесты уже есть)
│   ├── composer.test.ts
│   ├── window-controls.ts   # moveDelta / applyOpacity (перенос, тесты есть)
│   ├── window-controls.test.ts
│   └── utils.ts             # cn() (clsx+tailwind-merge) для shadcn
├── hooks/
│   ├── useSettings.ts       # get/set настроек, применение прозрачности
│   ├── useRecorder.ts       # подписка на state-changed
│   ├── useTranscription.ts  # transcript-ready + авто-send
│   ├── useClaudeStream.ts   # llm-delta/done/error, rAF-коалессинг
│   ├── useAttachments.ts    # paste/downscale/limit вложений
│   ├── useWindowControls.ts # Cmd+стрелки → move_window_by
│   ├── usePttSuspend.ts     # set_ptt_suspended при фокусе в полях
│   └── *.test.ts            # тесты ключевых хуков (mocked ipc)
└── components/
    ├── ui/                  # shadcn-примитивы (Button, Textarea, Dialog, Select,
    │                        #   Switch, Slider, Input, ScrollArea, Badge, Tooltip)
    ├── StatusBar.tsx        # орб состояния + текст + шестерёнка
    ├── PermissionBanner.tsx
    ├── Composer.tsx         # textarea + чипы + кнопки действий
    ├── AttachmentChip.tsx
    ├── AnswerPanel.tsx      # react-markdown + кнопка «Копировать»
    ├── SettingsDialog.tsx
    └── HotkeyHints.tsx
```

### Слой ipc

- `commands.ts`: каждая команда — функция с типами, внутри `invoke`. В браузере (`!isTauri()`) — резолвятся безопасными заглушками (`get_settings` → дефолты, `capture_available` → true, мутации — no-op).
- `events.ts`: хелпер `onEvent(name, cb)` поверх `listen`, возвращает функцию отписки; типы payload выводятся по имени события. В браузере — no-op (возвращает пустую отписку).
- Это позволяет хукам и компонентам не знать о Tauri и тестироваться с подменённым модулем `ipc`.

### Слой hooks (по слайсу контракта)

- `useSettings()` → `{ settings, save, loading }`. На маунте грузит `get_settings`, применяет `applyOpacity`. `save(next)` шлёт `set_settings`, перечитывает, реприменяет прозрачность; при ошибке откатывает прозрачность к сохранённому значению.
- `useRecorder()` → `{ state }` (`idle|recording|transcribing`). Подписка на `state-changed`. Семантика «не затирать ошибку idle-статусом» решается в `StatusBar` (см. ниже), не здесь.
- `useTranscription(onText)` — подписка на `transcript-ready`; вызывает колбэк (он кладёт текст в composer и, если `auto_send`, шлёт).
- `useClaudeStream()` → `{ answer, streaming, error, send, stop }`. `send(text, images)` сбрасывает буфер, шлёт `send_to_claude`, подписки на `llm-delta` (накопление + rAF-коалессинг), `llm-done` (финальный рендер + streaming=false), `llm-error` (streaming=false + ошибка). `stop()` → `cancel_stream` + streaming=false.
- `useAttachments()` → `{ attachments, addFromPaste, remove, clear }`. Использует `lib/composer.ts` (лимит 5, даунскейл >5МБ в JPEG q0.85). Гонка двух paste защищена (лимит-чек после await).
- `useWindowControls(moveStep)` — глобальный keydown: Cmd+стрелки → `move_window_by`; Cmd+Enter обрабатывается на уровне App (для send).
- `usePttSuspend(refs)` — focusin/focusout на полях ввода → `set_ptt_suspended(true/false)`.

### Слой components

- Построены на shadcn-примитивах. Никаких прямых `invoke` — только пропсы/колбэки от хуков.
- `StatusBar` держит логику «stt-error не затирается idle»: текущее состояние ошибки приоритетнее перехода в idle до следующей записи/отправки.
- `AnswerPanel` рендерит `react-markdown` с кастомным `<a>` (в Tauri — `open_external`, иначе `preventDefault`), кастомным `code`/`pre` (стиль), скроллом до низа при стриме.

## Поток данных

```
PTT/события Rust ──▶ ipc/events ──▶ хуки (state) ──▶ компоненты (render)
Composer «Отправить»/⌘⏎ ──▶ useClaudeStream.send ──▶ ipc/commands ──▶ Rust
llm-delta ──▶ useClaudeStream (накопление+rAF) ──▶ AnswerPanel
ссылка в ответе ──▶ AnswerPanel <a> ──▶ open_external
```

Поведение идентично текущему (отревьюенному): запись→распознавание→clipboard+поле; stt-error виден до следующего действия + retryable-эвристика (`/перегружен|соединение|VPN|интернет|оборван/i`); llm-error останавливает стрим; новая отправка отменяет предыдущий стрим (бэкенд); Cmd+V — скриншоты; Cmd+стрелки — перемещение; V-suspend при фокусе.

## Дизайн-токены (графит + оксблад)

CSS-переменные в `index.css` через Tailwind v4 `@theme` (oklch). Ориентировочные значения:

| Токен | Значение | Назначение |
|---|---|---|
| `--background` | `#0A0A0B` | канвас окна (с `var(--app-opacity)`) |
| `--card` | `#121214` | приподнятые панели (composer, answer) |
| `--border` | `rgba(255,255,255,.07)` | hairline-линии |
| `--foreground` | `#EDEDED` | основной текст |
| `--muted-foreground` | `#8A8A92` | вторичный текст, плейсхолдеры |
| `--primary` (accent) | `#9B1C2E` (оксблад) | кнопка Отправить, акценты, маркеры |
| `--primary-hover` | `#B5233A` | ховер/актив |
| `--recording` | `#E23B4E` | орб записи (чуть ярче акцента) |
| `--ring` | оксблад @ ~40% | фокус-кольца |

- Окно Tauri `transparent: true` → `html,body` прозрачные, фон рисует корневой контейнер `.app` через `rgb(... / var(--app-opacity))`; прозрачность управляется слайдером настроек (как сейчас).
- Шрифты: `font-mono` (SF Mono / системный mono) для статуса, таймера, kbd-подсказок; clean sans для тела; markdown-заголовки — sans (плотный технический стиль).
- Орб состояния: серый (idle), оксблад-пульс (recording), чуть ярче/частое дыхание (transcribing), красный (error). Скейлится с `prefers-reduced-motion`.
- Overlay-окно (`overlay.html`) перекрашивается в ту же палитру (чёрный фон + красный орб + «Запись»), остаётся отдельным мини-окном без React.

## Обработка ошибок

| Ситуация | Поведение (без изменений) |
|---|---|
| Нет права записи | `capture_available()=false` → `PermissionBanner` + кнопка в системные настройки |
| stt-error | статус «error» с текстом, виден до следующей записи/отправки; `retry` при retryable-эвристике |
| llm-error | стоп стрима + ошибка в статусе; повтор = снова «Отправить» |
| Тишина / неверный ключ / нет VPN | приходят как stt-error, отображаются |
| Ошибка сохранения настроек | сообщение в статусе + откат прозрачности к сохранённому |
| Ссылка в ответе | `open_external` (только http/https), иначе погашена |

## Тестирование

- **vitest, чистая логика:** переносим существующие тесты `composer.test.ts` (extract/limit/downscale/payload) и `window-controls.test.ts` (moveDelta/applyOpacity) — без изменений логики.
- **vitest, хуки:** `renderHook` (@testing-library/react) с подменённым модулем `ipc` (vi.mock). Покрываем: `useClaudeStream` (накопление дельт, done, error, stop→cancel), `useAttachments` (лимит 5, даунскейл-ветка, удаление), `useSettings` (load→applyOpacity, save→reapply, ошибка→откат). Без рендера полноценного DOM-дерева.
- **jsdom** окружение остаётся.
- **Ручная приёмка** (как раньше): браузерный мок-режим (`!isTauri()`) рендерит UI с демо-данными для визуальной проверки без бэкенда; финальная проверка — в собранном `.app` по чеклисту.

## Миграция и очистка

- `index.html`: `<body>` → `<div id="root">` + `<script type="module" src="/src/main.tsx">`. Vite multi-page input сохраняет `overlay.html`.
- Удаляются: `src/main.ts`, `src/styles.css`, `src/markdown.ts`; зависимости `marked`, `dompurify`.
- `src/composer.ts` и `src/window-controls.ts` переезжают в `src/lib/` без изменения логики (тесты едут с ними).
- `tsconfig.json`: `jsx: react-jsx`, типы для vitest/testing-library.
- `vite.config.ts`: `@vitejs/plugin-react` + `@tailwindcss/vite`, multi-page (`main`, `overlay`), алиас `@` → `src`.
- `components.json` (shadcn) с конфигом new-york + путями.
- README: обновить раздел про стек/тесты.

## Вне скоупа

- Любые изменения Rust-бэкенда.
- История диалога с Claude (multi-turn), микрофон, Keychain, стриминговое распознавание — как и раньше.
- Новые фичи: задача — паритет поведения + новый стек/дизайн, без добавления функциональности.
