# Глобальный хоткей скрытия/показа окна — дизайн

**Дата:** 2026-06-11
**Статус:** утверждён, готов к плану реализации

## Задача

Добавить глобальный хоткей, по которому окно itech полностью исчезает с экрана (`hide`), а по повторному нажатию — снова появляется (`show` + фокус). Хоткей должен срабатывать, даже когда окно скрыто/не в фокусе → это глобальный шорткат (`tauri-plugin-global-shortcut`), а не frontend-keydown. Хоткей настраивается в настройках (захват комбо, как у PTT).

## Решения (зафиксированы в брейншторме)

| Вопрос | Решение |
|---|---|
| Хоткей | Настраиваемый: новое поле `Settings.toggle_hotkey`, дефолт `"Cmd+Shift+H"`, захват комбо тем же `HotkeyCapture`, что и PTT |
| Объём скрытия | Только окно (`window.hide()`); иконка в Dock и запись в ⌘Tab остаются. Activation policy не меняем |
| Показ | `window.show()` + `set_focus()` (окно поднимается поверх, как HUD) |
| Источник события | Глобальный Rust-шорткат (работает при скрытом/нефокусном окне); фронт только настраивает |
| Реестр шортката | Обработчик деферится через `defer()` — соблюдаем инвариант «никакой синхронной работы в обработчике глобального шортката» |

## Текущее состояние (для контекста)

- `hotkey.rs`: `parse_hotkey` (чистая, протестирована), `register_ptt`/`unregister_ptt`, `register_esc`/`unregister_esc`. **Инвариант:** обработчик шортката вызывается под мьютексом реестра плагина → любая работа в нём (особенно register/unregister) уезжает в `defer(app, fn)` (spawn на async-рантайм). `defer` принимает `fn(&AppHandle)`.
- `lib.rs`: в `setup` после загрузки настроек — `register_ptt(handle, &settings.hotkey)`. Команда `set_settings` при `old.hotkey != new.hotkey` делает `register_ptt(new)` + `unregister_ptt(old)` и возвращает ошибку регистрации в UI. `on_ptt_pressed`/`on_ptt_released`/`on_cancel` — `pub fn(&AppHandle)`.
- `settings.rs`: 9 полей (включая `auto_preview_html`), `#[serde(default)]`, есть тесты `defaults_match_spec` / `save_load_roundtrip_with_600_perms` / `load_missing_*_defaults_*`.
- `SettingsDialog.tsx`: поле «Push-to-talk клавиша» использует `HotkeyCapture` (`value`/`onChange`). На сохранении `hotkey: draft.hotkey.trim() || "V"`.
- `types.ts`: `Settings` (9 полей) + `DEFAULT_SETTINGS`. `capabilities/default.json` грантит `core:window:allow-show`/`allow-hide` (для JS; Rust-вызовам не требуется).
- Окно одно — `main` (превью теперь встроенная панель, отдельных окон нет).

## Архитектура

### Rust

- **`hotkey.rs`:**
  - `register_toggle(app: &AppHandle, hotkey: &str) -> Result<(), String>`: `parse_hotkey` → `on_shortcut`; обработчик `if event.state == ShortcutState::Pressed { defer(app, crate::on_toggle_visibility) }`. (Только Pressed — действие однократное на нажатие, в отличие от PTT с press/release.)
  - `unregister_toggle(app: &AppHandle, hotkey: &str)`: `parse_hotkey` → `unregister`, ошибки глотаем (как `unregister_ptt`).
- **`lib.rs`:**
  - `pub fn on_toggle_visibility(app: &AppHandle)`: `get_webview_window("main")`; если `w.is_visible().unwrap_or(true)` → `w.hide()`, иначе → `w.show()` + `w.set_focus()`. Ошибки операций глотаем (`let _ =`).
  - В `setup` после `register_ptt`: `register_toggle(handle, &toggle_hotkey)` (лог ошибки через `eprintln!`, как PTT).
  - В `set_settings`: при `old.toggle_hotkey != new_settings.toggle_hotkey` — `register_toggle(&app, &new)?` + `unregister_toggle(&app, &old)` (тот же порядок и обработка ошибки, что у PTT-ветки).
- `set_ptt_suspended` — без изменений (toggle-комбо не конфликтует с печатью, suspend не нужен).

### Settings

- **`settings.rs`:** поле `pub toggle_hotkey: String`, дефолт `"Cmd+Shift+H"` (serde-default через существующий `#[serde(default)]` на struct + `impl Default`). Старые `settings.json` без поля читаются с дефолтом. Расширить тесты `defaults_match_spec`, `save_load_roundtrip_with_600_perms`, добавить `load_missing_toggle_hotkey_defaults`.
- **`types.ts`:** `toggle_hotkey: string` в `Settings` (после `auto_preview_html`) + `DEFAULT_SETTINGS` (`"Cmd+Shift+H"`).

### Frontend

- **`SettingsDialog.tsx`:** ещё один `Field` «Скрыть/показать окно» с `HotkeyCapture` (`value={draft.toggle_hotkey}`, `onChange={(hk) => set("toggle_hotkey", hk)}`). На сохранении — нормализация `toggle_hotkey: draft.toggle_hotkey.trim() || "Cmd+Shift+H"` (по образцу `hotkey`). Никакого frontend-keydown.

## Поток данных

1. Настройки сохраняются → `set_settings` → при смене `toggle_hotkey` перерегистрирует глобальный шорткат.
2. Нажатие toggle-комбо (в т.ч. при скрытом/нефокусном окне) → плагин зовёт обработчик → `defer` → `on_toggle_visibility` → `hide` или `show`+`set_focus`.
3. PTT-шорткат при скрытом окне продолжает работать независимо (не трогаем).
4. `chats.json`/окно/раскладка не затрагиваются.

## Обработка ошибок и edge-cases

- Невалидный/непарсящийся `toggle_hotkey`: `register_toggle` вернёт `Err` → в `set_settings` уходит в UI-строку ошибок (как PTT); прежняя регистрация снимается только если новая удалась (тот же порядок, что у PTT).
- Занятый системой/другим приложением комбо: регистрация может не сработать — пользователь меняет хоткей в настройках (мотивация конфигурируемости).
- `is_visible()` ошибка → фолбэк `true` (считаем видимым → прячем); безопасно.
- Бесконечная защита от «потерять окно»: скрытие только оконное, иконка в Dock остаётся → клик по Dock тоже показывает окно.

## Тестирование

- **cargo (`settings.rs`):** `toggle_hotkey` в `defaults_match_spec` (== `"Cmd+Shift+H"`); в roundtrip установить/прочитать другое значение; новый `load_missing_toggle_hotkey_defaults` (старый json без поля → дефолт). `parse_hotkey` уже покрывает разбор комбо.
- **vitest:** `DEFAULT_SETTINGS.toggle_hotkey === "Cmd+Shift+H"` (в существующих тестах настроек/типов, где проверяется контракт; если отдельного теста нет — добавить минимальный).
- Регистрация/`on_toggle_visibility` — glue, юнит-тестами не покрывается (как `register_ptt`); проверяется ручной приёмкой.
- **Ручная приёмка:** дефолтный комбо скрывает окно (исчезает с экрана), повторное — показывает с фокусом; работает при нефокусном окне; смена хоткея в настройках применяется без перезапуска; клик по Dock тоже возвращает окно; запись (PTT) при скрытом окне работает.

## Вне рамок (YAGNI)

- Скрытие иконки из Dock / activation policy Accessory (отклонено в брейншторме).
- Анимация исчезновения/появления.
- Отдельный индикатор/трей-меню.
- Валидация «обязателен модификатор» в захвате toggle-хоткея (дефолт — комбо; пользователь отвечает за свой выбор, как и с PTT).
- Запоминание позиции/состояния скрытия между запусками (окно и так помнит позицию).

## Критерий готовности

- Нажатие настроенного комбо скрывает окно с экрана; повторное — показывает с фокусом; срабатывает при скрытом/нефокусном окне.
- Хоткей настраивается в настройках захватом комбо (дефолт `Cmd+Shift+H`), сохраняется и перерегистрируется без перезапуска; невалидный — ошибка в UI, прежнее поведение цело.
- Иконка в Dock остаётся (окно восстановимо и кликом по Dock).
- `Settings` — 10 полей, зеркально Rust ↔ TS; CLAUDE.md обновлён.
- `lint`/`typecheck`/`knip`/`format`/vitest/cargo/clippy — зелёные.
