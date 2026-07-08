# Opacity-хоткеи, захват хоткея записи, удаление оверлея — дизайн

**Дата:** 2026-06-11
**Статус:** утверждён, готов к плану реализации

## Задача

Три независимые доработки:

1. **Управление прозрачностью с клавиатуры** — `Cmd+Shift+=` увеличивает, `Cmd+Shift+-` уменьшает `window_opacity`.
2. **Удобное задание хоткея записи** — захват сочетания клавиш (нажал комбо → записалось), вместо ручного ввода строки.
3. **Убрать отдельное мини-окно «запись»** — оно мешает; внутри-HUD индикатор остаётся.

## Решения (зафиксированы в брейншторме)

| Вопрос | Решение |
|---|---|
| Хоткей записи | Захват комбо (один хоткей, задаётся нажатием) |
| Где работают opacity-хоткеи | Когда HUD в фокусе (frontend keydown, как ⌘+стрелки) |
| Шаг opacity | 0.1, clamp [0.2, 1.0] |
| Персист opacity | В settings.json, с дебаунсом ~400 мс |

## Текущее состояние (для контекста)

- `window_opacity` (settings, 0.2–1.0), применяется `applyOpacity(root, v)` → CSS-переменная `--app-opacity`. Слайдер в `SettingsDialog` (step 0.05).
- `useWindowControls(moveStep, onSend)` — document-keydown: ⌘+стрелки → `move_window_by`, ⌘+Enter → `onSend`.
- Хоткей записи: `settings.hotkey` (default `F9`/`V`), текстовый `Input` в `SettingsDialog`; на сохранении `draft.hotkey.trim().toUpperCase()`. Парсер `hotkey::parse_hotkey` (Rust) уже понимает одиночные клавиши, F-клавиши и комбо (`Cmd+R`), регистронезависимо.
- Оверлей: окно `overlay` в `tauri.conf.json` (`app.windows`), файл `overlay.html`, вход `overlay` в `vite.config.ts` (`rollupOptions.input`), show/hide в `emit_state` (`lib.rs`). Внутри-HUD статус «Запись…» — в `StatusBar` по событию `state-changed` (это НЕ оверлей).

## Часть 1 — Opacity через Cmd+Shift+=/−

**Поведение:** при фокусе HUD `Cmd+Shift+=` → +0.1, `Cmd+Shift+-` → −0.1 к `window_opacity`; clamp [0.2, 1.0]; мгновенно применить; персист в settings.json с дебаунсом.

**Реализация:**
- `lib/window-controls.ts`: чистая функция `stepOpacity(current: number, dir: 1 | -1, step: number): number` — возвращает `clamp(current + dir*step, 0.2, 1.0)`. Под юнит-тест.
- `useSettings`: метод `bumpOpacity(dir: 1 | -1)` — вычисляет новое значение через `stepOpacity` (step `0.1`), оптимистично обновляет `settings.window_opacity` в state, вызывает `applyOpacity(document.documentElement, v)`, и персистит с дебаунсом ~400 мс (через существующий `save`/`set_settings`). Дебаунс — чтобы удержание клавиш не спамило IPC.
- `useWindowControls`: добавить параметр-колбэк `onOpacityStep: (dir: 1 | -1) => void`; в `onKey` ветка `if (e.metaKey && e.shiftKey)`: `code === "Equal"` → `e.preventDefault(); onOpacityStep(1)`, `code === "Minus"` → `e.preventDefault(); onOpacityStep(-1)`. (Хук не зависит от настроек напрямую — только колбэк.)
- `App.tsx`: передать `onOpacityStep={() => settings.bumpOpacity(dir)}` (через стабильный колбэк).

**Физика клавиш:** `+` = `Shift+=` (`e.code === "Equal"`), `−` = `e.code === "Minus"`; оба под Shift → ловим `metaKey && shiftKey && (Equal|Minus)`.

## Часть 2 — Захват комбо для хоткея записи

**Поведение:** в `SettingsDialog` поле «Push-to-talk клавиша» — кнопка-захват: показывает текущий бинд; клик → режим «Нажмите клавиши…»; следующий keydown с не-модификаторной основной клавишей записывает комбо; `Esc` отменяет захват (бинд не меняется).

**Реализация:**
- `lib/hotkey-capture.ts` (новый): чистая функция `hotkeyFromEvent(e: { metaKey; ctrlKey; altKey; shiftKey; code: string }): string | null`.
  - Модификаторы в фиксированном порядке: `Cmd` (metaKey), `Ctrl` (ctrlKey), `Alt` (altKey), `Shift` (shiftKey).
  - Основная клавиша из `e.code`: `KeyA…KeyZ` → `A…Z`; `F1…F24` → как есть; `Digit0…Digit9` → `0…9`. Иные коды → не основная клавиша.
  - Если основной клавиши нет (нажаты только модификаторы) или код не распознан → `null`.
  - Результат — строка вида `"Cmd+Shift+R"`, `"F9"`, `"V"` (формат, который понимает `parse_hotkey`).
  - Под юнит-тесты: одиночная клавиша, F-клавиша, комбо с несколькими модификаторами, только-модификаторы→null, нераспознанный код→null.
- `SettingsDialog`: компонент-кнопка захвата. Состояние `capturing: boolean`. В режиме захвата вешает `keydown`-листенер (`preventDefault` + `stopPropagation`, чтобы не сработали window-controls/opacity), на не-null результат `hotkeyFromEvent` — пишет в `draft.hotkey` и выходит из режима; `Escape` — выход без изменения.
- Снять `.toUpperCase()` в обработчике сохранения (`save` в `SettingsDialog`) — чтобы вид комбо в UI не коверкался; на регистрацию не влияет (`parse_hotkey` регистронезависим). Сохранение/регистрация — существующим путём (`set_settings` → `register_ptt`).
- Один хоткей (как и раньше); множественные биндинги — вне рамок.

## Часть 3 — Убрать оверлей-окно «запись»

- `tauri.conf.json`: удалить объект окна `overlay` из `app.windows`.
- `lib.rs` `emit_state`: удалить блок `get_webview_window("overlay")` show/hide; оставить `let _ = app.emit("state-changed", s);`.
- `vite.config.ts`: убрать вход `overlay` из `build.rollupOptions.input` (остаётся только `index.html`; при единственном входе можно упростить до дефолта).
- Удалить файл `overlay.html`.
- Внутри-HUD индикатор «Запись…» (`StatusBar` по `state-changed`) — **не трогать**.

## Тестирование

- `stepOpacity` — clamp и шаг (юнит-тест в `lib/window-controls.test.ts`).
- `hotkeyFromEvent` — комбо/F-клавиши/цифры/только-модификаторы→null/нераспознанное→null (новый `lib/hotkey-capture.test.ts`).
- `useWindowControls` — ветка opacity-степа вызывает `onOpacityStep` с верным dir (обновить тест, если есть; иначе добавить).
- `useSettings` — `bumpOpacity` обновляет state + применяет + персистит (дебаунс) (обновить/добавить тест).
- Часть 3 — без юнит-тестов; ручная проверка: при записи нет отдельного окна; статус в HUD присутствует; сборка проходит без `overlay.html`.

## Вне рамок (YAGNI)

- Множественные хоткеи записи (список) — только один.
- Глобальные (системные) opacity-хоткеи — только при фокусе HUD.
- Изменение слайдера прозрачности в настройках (остаётся, шаг 0.05).
- Кастомизация шага opacity / дебаунса в UI.

## Критерий готовности

- `Cmd+Shift+=`/`-` при фокусе HUD меняют прозрачность шагом 0.1 в пределах [0.2, 1.0], видно сразу, переживает перезапуск.
- В настройках можно задать хоткей записи нажатием комбо (включая `Cmd+Shift+R`); сохраняется и работает как PTT.
- При записи нет отдельного мини-окна; индикатор в HUD есть.
- `lint`/`typecheck`/`knip`/`format`/vitest/cargo — зелёные.
