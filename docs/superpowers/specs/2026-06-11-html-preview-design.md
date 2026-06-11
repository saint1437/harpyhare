# Окно HTML-превью для ответов Claude — дизайн

**Дата:** 2026-06-11
**Статус:** утверждён, готов к плану реализации

## Задача

Когда Claude присылает в ответе HTML (fenced-блок ` ```html ` в markdown), показать его отрендеренным прямо в приложении: отдельное floating-окно «браузера» над HUD. Движок — системный WKWebView (тот же, что рендерит само приложение); встраивание Chromium/V8 отвергнуто как оверкилл (+100 МБ, отдельный процесс, нулевой выигрыш для рендера HTML/CSS/JS-демок).

## Решения (зафиксированы в брейншторме)

| Вопрос | Решение |
|---|---|
| Что считается «HTML-ответом» | Закрытый fenced-блок ` ```html ` в markdown-ответе ассистента |
| Где показывать | Отдельное frameless-окно **над HUD** (та же ширина, зазор 12px) |
| Сколько окон | Одно, переиспользуемое (синглтон); новое превью заменяет содержимое |
| Когда открывать | Автоматически по завершении стрима активного чата + клик по чипу; автооткрытие отключается настройкой `auto_preview_html` |
| JS внутри HTML | Выполняется всегда: `<iframe sandbox="allow-scripts" srcdoc=…>` **без** `allow-same-origin` — изоляция от приложения/IPC на уровне движка, ручная санитизация не нужна |
| Реализация окна | Тот же Vite-бандл (`?window=preview`), не отдельный HTML-вход |

## Текущее состояние (для контекста)

- Ответ ассистента рендерится в `AnswerPanel.tsx` через `react-markdown` (+`remark-gfm`); кастомный рендер уже есть для `a` (внешние ссылки → `openExternal`).
- Окно одно — `main` (frameless, transparent, alwaysOnTop, visibleOnAllWorkspaces, contentProtected). Capabilities `default.json` — только для `main`.
- Манипуляции окнами — через Rust-команды (`move_window_by`, `set_window_height`); JS-путь молча не работает без capability.
- `Settings` — 8 полей, зеркально в `settings.rs` и `src/ipc/types.ts`.
- `useClaudeStream(appendAssistantMessage)` — на `llm-done` вызывает колбэк с `(chatId, text)`.
- Вход один: `index.html` → `main.tsx` → `App`.

## Поведение (UX)

- Каждый закрытый ` ```html `-блок (язык регистронезависимо) в сообщении ассистента рендерится в ленте **чипом** вместо простыни кода: `html · N строк · Открыть превью ↗`. Прочие языки — как сейчас. Во время стрима незакрытый fence тоже отображается чипом (react-markdown парсит его как код-блок); клик откроет текущий срез кода.
- **Автооткрытие:** когда стрим завершился (`llm-done` → `appendAssistantMessage`), чат активен и в финальном тексте есть html-блоки — окно превью открывается с **последним** блоком. Гейт: `settings.auto_preview_html` (по умолчанию `true`). Для фоновых (неактивных) чатов автооткрытия нет.
- **Фокус:** при автооткрытии и замене содержимого окно показывается **без** кражи фокуса (HUD остаётся в фокусе); при клике по чипу — show + focus.
- **Окно:** frameless в стиле HUD, alwaysOnTop, visibleOnAllWorkspaces, contentProtected, resizable. Ширина = ширине HUD, высота 480 (логических px), позиция — над HUD с зазором 12px, кламп по верхней границе видимой области монитора (если места мало — окно прижимается к верху и может перекрыть HUD, это допустимо). Позиция вычисляется при создании; за HUD окно не следует, пользователь может его перетащить.
- **Шапка окна:** «Превью» + drag-зона (`data-tauri-drag-region`) + «Копировать код» (текущий HTML в буфер через `navigator.clipboard`) + ✕. `Esc` (при фокусе в превью) тоже закрывает. Закрытое окно уничтожается; следующий показ создаёт его заново над текущей позицией HUD.
- **Контент:** iframe с белым фоном страницы (дефолт HTML), `sandbox="allow-scripts"`. Пустое состояние (окно открыто без HTML) — заглушка «Нет содержимого».

## Frontend

- **`src/lib/html-blocks.ts`** (новый, чистый): `extractHtmlBlocks(markdown: string): string[]` — закрытые fenced-блоки с инфо-строкой `html` (регистронезависимо). Незакрытый fence не извлекается (важно для автооткрытия — оно работает только по финальному тексту). Юнит-тесты.
- **`src/components/HtmlBlockChip.tsx`** (новый): презентационный чип (язык, число строк, «Открыть превью ↗»), `onOpen` колбэк.
- **`AnswerPanel.tsx`**: override `pre` в `markdownComponents` — если дочерний `code` имеет `language-html`, рендерить `HtmlBlockChip` с `onOpen={() => void showHtmlPreview(code)}`; иначе обычный `<pre>`.
- **`src/PreviewApp.tsx`** (новый): шапка + iframe. Данные — через новый хук **`src/hooks/usePreviewHtml.ts`**: на маунте `getPreviewHtml()`, подписка на `preview-html` через `onEvent` (паттерн `live`-флага как у остальных). `Esc` → закрыть окно. Вне Tauri — встроенный демо-HTML (визуальная итерация в браузере по URL `?window=preview`).
- **`main.tsx`**: `new URLSearchParams(location.search).get("window") === "preview"` → рендер `PreviewApp` вместо `App`.
- **`src/ipc/`**:
  - `commands.ts`: `showHtmlPreview(html: string, focus: boolean): Promise<void>` (invoke `show_html_preview`), `getPreviewHtml(): Promise<string>` (invoke `get_preview_html`), `closePreviewWindow(): Promise<void>` — закрытие текущего окна через `getCurrentWindow().close()` (ipc — единственный слой с импортом `@tauri-apps`). Все — no-op/заглушки вне Tauri.
  - `types.ts`: `EventMap` + `"preview-html": string`.
- **`App.tsx`**: колбэк, передаваемый в `useClaudeStream`, оборачивает `chats.appendAssistantMessage`: после аппенда — если `settingsRef.current.auto_preview_html`, `chatId === activeId` и `extractHtmlBlocks(text)` непуст → `showHtmlPreview(последний блок)` (вариант «без фокуса»; различение фокуса — аргументом команды `focus: bool`).

## Rust

- **`preview.rs`** (новый, чистый, юнит-тесты): `preview_rect(main_pos, main_size, monitor_pos, monitor_size, preview_h, gap) -> (x, y, w, h)` — все аргументы и результат в **физических** пикселях (вызывающий код переводит логические 480/12 через `scale_factor` монитора); `x`/`w` от HUD, `y = main.y − gap − h`, кламп `y ≥ monitor.y`.
- **`lib.rs`**:
  - Состояние: `preview_html: Mutex<String>` в `App`.
  - `#[tauri::command] show_html_preview(app, html: String, focus: bool) -> Result<(), String>`: сохранить HTML в state; если окно `preview` живо — `emit_to("preview", "preview-html", html)` + `show()` (+ `set_focus()` при `focus`); иначе создать `WebviewWindowBuilder` (label `preview`, URL `index.html?window=preview`, transparent, no decorations, alwaysOnTop, visibleOnAllWorkspaces, contentProtected, resizable, minWidth 360 / minHeight 240) с позицией/размером из `preview_rect` (монитор — текущий монитор main-окна; фолбэк при отсутствии — позиция по умолчанию от Tauri). Ошибки — `Err(String)`.
  - `#[tauri::command] get_preview_html(app) -> String` — из state.
  - Обе команды в `generate_handler!`.
- **`src-tauri/capabilities/preview.json`** (новый): `windows: ["preview"]`, permissions: `core:default`, `core:window:allow-close` (✕/Esc из JS), `core:window:allow-start-dragging` (drag за шапку).
- **`settings.rs`**: поле `auto_preview_html: bool`, serde-default `true` (старые settings.json без поля читаются как `true`). Зеркало в `types.ts`; чекбокс «Автопревью HTML» в `SettingsDialog` рядом с auto_send. Обновить CLAUDE.md: «Settings (8 fields)» → 9 и упомянуть окно `preview`.

## Поток данных

1. `llm-done` → `useClaudeStream` → обёртка в `App` → `appendAssistantMessage` + `extractHtmlBlocks` → `showHtmlPreview(html, false)`.
2. Клик по чипу в `AnswerPanel` → `showHtmlPreview(code, true)`.
3. Rust: state + (создать окно | `preview-html` event) → `PreviewApp` (`usePreviewHtml`) → `<iframe sandbox="allow-scripts" srcdoc>`.
4. `chats.json` не меняется: чипы выводятся из текста сообщения, HTML превью не персистится.

## Обработка ошибок

- `show_html_preview` возвращает `Result<(), String>`; в `App` ошибка идёт в существующую строку ошибок (как `sttError`), по клику чипа — тоже.
- Пустой `html` — команда no-op (Ok).
- `get_preview_html` при пустом state → пустая строка → заглушка в `PreviewApp`.

## Тестирование

- **vitest** `src/lib/html-blocks.test.ts`: один блок; несколько (порядок); незакрытый fence → не извлекается; `HTML`/`Html` регистр; другой язык игнорируется; пустой блок; текст без блоков.
- **vitest** `src/hooks/usePreviewHtml.test.ts`: маунт → `getPreviewHtml`; событие `preview-html` обновляет state; отписка (паттерн `live`); `vi.mock("@/ipc/...")`.
- **cargo** `preview.rs`: позиция над HUD; кламп по верху монитора; наследование x/w.
- Ручная приёмка: ответ с ```html → чип; автооткрытие окна над HUD без кражи фокуса; JS-демка живая; «Копировать код»; drag/resize/Esc/✕; выключение `auto_preview_html` гасит автооткрытие, чип работает; второй ответ заменяет содержимое открытого окна.

## Вне рамок (YAGNI)

- Несколько окон превью одновременно.
- Превью других языков (svg, markdown и т.п.) и «весь ответ — HTML» без fence.
- Слежение окна превью за перемещением HUD.
- Тумблер JS в шапке (JS всегда включён) и сетевые ограничения внутри iframe.
- Персист HTML превью и позиции окна между запусками.

## Критерий готовности

- ```html-блок в ответе → чип в ленте; клик открывает окно превью над HUD с живым рендером (JS работает, кнопки кликаются).
- По завершении ответа активного чата окно открывается само; `auto_preview_html=false` отключает это; фокус у HUD не отнимается.
- Окно одно: новый ответ/клик заменяет содержимое; ✕/Esc закрывают; drag за шапку и resize работают.
- Код из превью не имеет доступа к приложению (sandbox без `allow-same-origin`).
- `lint`/`typecheck`/`knip`/`format`/vitest/cargo — зелёные.
