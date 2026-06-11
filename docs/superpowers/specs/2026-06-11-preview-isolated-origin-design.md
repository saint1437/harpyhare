# Превью на отдельном origin (кастомный протокол) — дизайн

**Дата:** 2026-06-11
**Статус:** утверждён, готов к плану реализации

## Задача

HTML-превью ответов Claude рендерится в `<iframe sandbox="allow-scripts" srcDoc={html}>`. Без `allow-same-origin` iframe получает опаковый origin, и **любое обращение к `localStorage` бросает `SecurityError`** — сгенерированный код (например змейка, сохраняющая рекорд в LocalStorage) падает на старте, кнопки не работают. Добавить `allow-same-origin` к `srcDoc` нельзя: `srcDoc` наследует origin приложения (`tauri://localhost`), и тогда код превью сможет вызвать `invoke('get_settings')` и украсть API-ключи.

Решение: отдавать превью с **отдельного origin** через кастомный URI-протокол `preview://`. Тогда `localStorage`/`sessionStorage`/`cookies`/`IndexedDB` работают (origin превью — своя песочница), а cross-origin-политика + отсутствие capability на этот URL изолируют превью от приложения и ключей.

## Решения (зафиксированы в брейншторме)

| Вопрос | Решение |
|---|---|
| Как дать превью рабочий `localStorage` | Кастомная схема `preview://` (отдельный origin), iframe через `src` + `sandbox="allow-scripts allow-same-origin"` |
| Альтернативы | `allow-same-origin` на `srcDoc` — отклонено (наследует origin приложения → кража ключей). Локальный HTTP-сервер — отклонено (порт/жизненный цикл/firewall, тяжелее) |
| Сеть в превью | Разрешена (без жёсткого CSP): CDN-скрипты, шрифты, картинки, fetch — для совместимости с реальными генерациями. Риск низкий: у превью нет доступа к ключам/приложению |
| Изоляция хранилища между превью | Все превью делят один origin → общий неймспейс `localStorage`. Принимаем (YAGNI); per-preview изоляция — вне рамок |
| Окно/раскладка | Без изменений: панель справа, расширение окна `set_window_width` |

## Текущее состояние (для контекста)

- `src/components/PreviewPanel.tsx`: `<iframe sandbox="allow-scripts" srcDoc={html} title="HTML превью" className="min-h-0 flex-1 rounded-[12px] border-0 bg-white" />`; заглушка «Нет содержимого» при `html===""`. Props `{ html, onClose }`.
- `App.tsx`: `previewHtml`/`previewOpen` state; `openPreview(code)` ставит оба; чип и `onAssistantDone` (гейт `auto_preview_html`) зовут `openPreview`.
- `lib.rs`: `tauri::Builder::default().plugin(...).plugin(...).setup(...).invoke_handler(generate_handler![...])`. `App`-struct БЕЗ `preview_html` (удалён в прошлой фиче). `macos-private-api` включён. `withGlobalTauri: true`, `csp: null` в `tauri.conf.json`.
- ipc: `src/ipc/commands.ts` — `invoke` из `@tauri-apps/api/core`, каждая команда no-op вне Tauri (`isTauri()`).

## Архитектура

### Rust

- **Состояние:** вернуть в `App` поле `pub preview_html: Mutex<String>` (+ инициализация `Mutex::new(String::new())` в `app.manage`).
- **Команда:** `#[tauri::command] fn set_preview_html(app, html: String)` — кладёт `html` в `App.preview_html`. Регистрируется в `generate_handler!`.
- **Протокол:** на билдере `.register_uri_scheme_protocol("preview", …)` — берёт текущий `preview_html` из state приложения и возвращает `http::Response` с телом-HTML и заголовком `Content-Type: text/html; charset=utf-8`. Путь/квери игнорируются (нужны только для cache-busting на стороне фронта). Доступ к `AppHandle`/state внутри хендлера — по сигнатуре установленной версии Tauri (в Tauri 2 хендлер получает контекст с `app_handle()`); конкретное связывание фиксирует план реализации, design-решение — «хендлер читает `App.preview_html` и отдаёт его как `text/html`».
- **Чистая функция под тест:** формирование ответа из строки HTML вынести в маленькую функцию `preview_response_body(html: &str) -> (тело, content_type)` (или аналог), чтобы покрыть юнит-тестом без живого webview.

### Frontend

- **`PreviewPanel`:** переключить с `srcDoc` на `src`.
  - Локальный счётчик-нонс (`useRef`/`useState`), инкремент при каждом изменении `html`.
  - На изменение `html`: `await setPreviewHtml(html)` (новая ipc-обёртка), затем `setSrc(\`preview://localhost/?v=${nonce}\`)`.
  - `<iframe sandbox="allow-scripts allow-same-origin" src={src} title="HTML превью" className="… bg-white" />`.
  - Вне Tauri (`!isTauri()`): фолбэк на прежний `srcDoc={html}` (с `allow-scripts`) — чтобы `vite preview`/браузерный мок продолжал показывать демо без бэкенда.
  - Пустой `html` → заглушка «Нет содержимого» (как сейчас).
- **ipc:** `setPreviewHtml(html: string): Promise<void>` → `invoke("set_preview_html", { html })`; no-op вне Tauri.

## Поток данных

1. Чип/автооткрытие → `openPreview(code)` → React-state `previewHtml`/`previewOpen=true`.
2. `PreviewPanel` (html изменился) → `setPreviewHtml(html)` → Rust кладёт в `Mutex<String>` → панель ставит `iframe.src = preview://localhost/?v=<nonce++>`.
3. WKWebView запрашивает `preview://…` → хендлер отдаёт сохранённый HTML (`text/html`) → iframe рендерит на origin `preview://localhost`.
4. Внутри iframe `localStorage`/сеть работают; `window.parent` (origin `tauri://localhost`), его `__TAURI_INTERNALS__` и `localStorage` недоступны (cross-origin) — IPC в iframe не инжектится (нет capability на `preview://`).
5. `chats.json` и окно/раскладка не затрагиваются.

## Изоляция и безопасность (суть)

- Origin превью (`preview://localhost`) ≠ origin приложения (`tauri://localhost`) → SOP блокирует доступ к окну приложения, его IPC-мосту и хранилищу.
- Ни одна capability в `src-tauri/capabilities/` не указывает на `preview://`-URL → Tauri не инжектит IPC в iframe. `sandbox` без `allow-popups`/`allow-top-navigation`/`allow-same-origin`-к-приложению — слой defense-in-depth.
- Сеть разрешена осознанно (нет жёсткого CSP в ответе протокола): у превью нет доступа к ключам/приложению.
- **Контроль-точка приёмки:** в iframe `window.__TAURI_INTERNALS__` и `window.parent.__TAURI_INTERNALS__` недоступны/бросают; `invoke('get_settings')` из превью невозможен.

## Обработка ошибок и edge-cases

- `set_preview_html` — `Result<(), String>`; ошибку панель роняет в существующую строку ошибок приложения (паттерн `openPreview`).
- Пустой HTML: панель показывает заглушку «Нет содержимого» и НЕ ставит `src`, пока `html===""` (как сейчас); хендлер протокола при этом защитно отдаёт пустое тело `200`, если запрос всё же придёт при пустом state.
- Нонс обязателен: повторное открытие того же HTML без смены `src` не перезагрузило бы iframe — инкремент-нонс решает.
- Гонка «set_preview_html → src»: фронт ставит `src` только после резолва `setPreviewHtml`, поэтому к моменту запроса протокола state уже обновлён.

## Тестирование

- **vitest** (`PreviewPanel`): при изменении `html` вызывается `setPreviewHtml(html)` и `src` получает `preview://localhost/?v=<n>` с растущим нонсом (мок `@/ipc/commands`); вне Tauri — фолбэк на `srcDoc`. (Если для теста удобнее — выделить чистый помощник формирования `src` из нонса.)
- **cargo:** юнит на `preview_response_body` (или аналог) — корректный `Content-Type` и тело из строки HTML.
- **Ручная приёмка:** змейка с `localStorage` запускается и сохраняет рекорд между открытиями; `__TAURI_INTERNALS__` в iframe недоступен (через devtools/тестовый сниппет); превью с CDN (Tailwind) грузится; обычное превью без `localStorage` работает как раньше; чип/автооткрытие/✕/расширение окна — без регрессий.

## Вне рамок (YAGNI)

- Изоляция `localStorage` между разными превью (уникальный origin/неймспейс на превью).
- Жёсткий CSP/ограничение сети в превью.
- Возврат отдельного окна превью, пресеты, мультипанели.
- Очистка/сброс хранилища превью из UI.

## Критерий готовности

- Превью грузится с origin `preview://localhost` (iframe через `src`, `allow-scripts allow-same-origin`); `localStorage` и сеть работают — змейка запускается и сохраняет рекорд.
- Превью не имеет доступа к приложению и ключам: `__TAURI_INTERNALS__`/`window.parent` недоступны, `invoke('get_settings')` невозможен.
- Чип, автооткрытие (гейт `auto_preview_html`), ✕, расширение окна вправо — работают как раньше; браузерный мок (`vite preview`) показывает демо.
- `lint`/`typecheck`/`knip`/`format`/vitest/cargo/clippy — зелёные.
