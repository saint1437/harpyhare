# Глобальный хоткей скрытия/показа окна — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Глобальный настраиваемый хоткей (дефолт `Cmd+Shift+H`) скрывает окно itech с экрана и по повторному нажатию показывает его снова с фокусом (спека: `docs/superpowers/specs/2026-06-11-toggle-window-hotkey-design.md`).

**Architecture:** Новое 10-е поле `Settings.toggle_hotkey`; в `hotkey.rs` — `register_toggle`/`unregister_toggle` по образцу PTT (обработчик деферится); в `lib.rs` — `on_toggle_visibility` (hide ↔ show+focus) + регистрация в `setup` и перерегистрация в `set_settings`. Конфигурация — захват комбо в `SettingsDialog` (компонент `HotkeyCapture`). Скрывается только окно.

**Tech Stack:** Tauri 2 (`tauri-plugin-global-shortcut`, WebviewWindow hide/show), React 19, cargo test, vitest.

**Порядок коммитов:** Task 1 добавляет поле контракта (сохраняется, но без поведения) — cargo+фронт зелёные. Task 2 добавляет регистрацию/поведение — cargo зелёный. Task 3 — доки. Rust-проверки гонять руками (`export PATH="$HOME/.cargo/bin:$PATH"`).

---

### Task 1: Поле `toggle_hotkey` в контракте Settings (Rust + TS + UI)

**Files:**
- Modify: `src-tauri/src/settings.rs` (struct, Default, тесты)
- Modify: `src/ipc/types.ts` (interface + DEFAULT_SETTINGS)
- Modify: `src/components/SettingsDialog.tsx` (HotkeyCapture + нормализация)

- [ ] **Step 1: Расширить Rust-тесты (падающие)**

В `src-tauri/src/settings.rs`, в тесте `defaults_match_spec` добавить:

```rust
        assert_eq!(s.toggle_hotkey, "Cmd+Shift+H");
```

В тесте `save_load_roundtrip_with_600_perms` после `s.auto_preview_html = false;` добавить:

```rust
        s.toggle_hotkey = "F10".into();
```

и после `assert!(!loaded.auto_preview_html);`:

```rust
        assert_eq!(loaded.toggle_hotkey, "F10");
```

Новый тест (рядом с `load_missing_auto_preview_html_defaults_true`):

```rust
    #[test]
    fn load_missing_toggle_hotkey_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.toggle_hotkey, "Cmd+Shift+H"); // старый json без поля → дефолт
    }
```

- [ ] **Step 2: Убедиться, что cargo-тесты падают (поля нет)**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test --manifest-path src-tauri/Cargo.toml --lib settings`
Expected: FAIL — `no field 'toggle_hotkey' on type ...`.

- [ ] **Step 3: Добавить поле в struct и Default**

В `Settings` после `pub auto_preview_html: bool,`:

```rust
    pub toggle_hotkey: String,
```

В `impl Default` после `auto_preview_html: true,`:

```rust
            toggle_hotkey: "Cmd+Shift+H".into(),
```

(Контейнерный `#[serde(default)]` уже на struct — старые json без поля получат дефолт. `clamp()` строку не трогает — менять не нужно.)

- [ ] **Step 4: Прогнать cargo-тесты**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test --manifest-path src-tauri/Cargo.toml --lib settings`
Expected: PASS (все тесты модуля, включая новый).

- [ ] **Step 5: Зеркало в TS**

`src/ipc/types.ts` — в `interface Settings` после `auto_preview_html: boolean;`:

```ts
  toggle_hotkey: string;
```

В `DEFAULT_SETTINGS` после `auto_preview_html: true,`:

```ts
  toggle_hotkey: "Cmd+Shift+H",
```

- [ ] **Step 6: Поле захвата в SettingsDialog**

`src/components/SettingsDialog.tsx` — найти поле PTT-клавиши:

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

и добавить **сразу после** него:

```tsx
          <Field label="Скрыть/показать окно">
            <HotkeyCapture
              value={draft.toggle_hotkey}
              onChange={(hk) => {
                set("toggle_hotkey", hk);
              }}
            />
          </Field>
```

Затем найти обработчик сохранения:

```tsx
  const save = () => {
    onSave({
      ...draft,
      hotkey: draft.hotkey.trim() || "V",
    });
  };
```

и заменить на:

```tsx
  const save = () => {
    onSave({
      ...draft,
      hotkey: draft.hotkey.trim() || "V",
      toggle_hotkey: draft.toggle_hotkey.trim() || "Cmd+Shift+H",
    });
  };
```

- [ ] **Step 7: Проверки**

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное. (Значение TS-дефолта гарантируется tsc — поле обязательно — и зеркалит Rust-дефолт из cargo-теста; отдельный vitest на константу не добавляем, как и для `auto_preview_html`.)

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo clippy --manifest-path src-tauri/Cargo.toml --lib`
Expected: без warnings.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/settings.rs src/ipc/types.ts src/components/SettingsDialog.tsx
git commit -m "feat: поле toggle_hotkey в Settings (10-е поле контракта)"
```

---

### Task 2: Rust — регистрация toggle-хоткея + `on_toggle_visibility`

**Files:**
- Modify: `src-tauri/src/hotkey.rs` (`register_toggle`/`unregister_toggle`)
- Modify: `src-tauri/src/lib.rs` (`on_toggle_visibility`, setup, set_settings)

- [ ] **Step 1: Функции регистрации в `hotkey.rs`**

В `src-tauri/src/hotkey.rs`, после `unregister_ptt` (перед `register_esc`), добавить:

```rust
/// Регистрирует глобальный хоткей скрытия/показа окна: Pressed -> [`crate::on_toggle_visibility`].
/// Обработчик деферится (см. [`defer`]) — однократное действие на нажатие.
pub fn register_toggle(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut =
        parse_hotkey(hotkey).ok_or_else(|| format!("Не удалось разобрать хоткей: {hotkey:?}"))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                defer(app, crate::on_toggle_visibility);
            }
        })
        .map_err(|e| e.to_string())
}

/// Снимает регистрацию хоткея скрытия/показа. Ошибки глотаем (как `unregister_ptt`).
pub fn unregister_toggle(app: &AppHandle, hotkey: &str) {
    if let Some(shortcut) = parse_hotkey(hotkey) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}
```

- [ ] **Step 2: `on_toggle_visibility` в `lib.rs`**

В `src-tauri/src/lib.rs`, после функции `on_cancel` (рядом с другими `pub fn on_*`), добавить:

```rust
/// Тоггл видимости главного окна по глобальному хоткею. Деферится из обработчика
/// шортката (инвариант hotkey.rs), поэтому выполняется уже после освобождения
/// мьютекса реестра плагина.
pub fn on_toggle_visibility(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(true) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}
```

- [ ] **Step 3: Регистрация в `setup`**

В `lib.rs`, в `setup`, найти:

```rust
            let hotkey = settings.hotkey.clone();
```

и добавить **после** неё:

```rust
            let toggle_hotkey = settings.toggle_hotkey.clone();
```

Затем найти блок регистрации PTT:

```rust
            if let Err(e) = hotkey::register_ptt(handle, &hotkey) {
                eprintln!("не удалось зарегистрировать PTT-хоткей {hotkey:?}: {e}");
            }
```

и добавить **сразу после** него:

```rust
            if let Err(e) = hotkey::register_toggle(handle, &toggle_hotkey) {
                eprintln!("не удалось зарегистрировать toggle-хоткей {toggle_hotkey:?}: {e}");
            }
```

- [ ] **Step 4: Перерегистрация в `set_settings`**

В `lib.rs`, в `set_settings`, найти блок PTT:

```rust
    if old.hotkey != new_settings.hotkey {
        hotkey::register_ptt(&app, &new_settings.hotkey)?;
        hotkey::unregister_ptt(&app, &old.hotkey);
    }
```

и добавить **сразу после** него:

```rust
    if old.toggle_hotkey != new_settings.toggle_hotkey {
        hotkey::register_toggle(&app, &new_settings.toggle_hotkey)?;
        hotkey::unregister_toggle(&app, &old.toggle_hotkey);
    }
```

- [ ] **Step 5: Проверки**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo clippy --manifest-path src-tauri/Cargo.toml --lib && cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: компиляция без ошибок; clippy без warnings; тесты зелёные.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/hotkey.rs src-tauri/src/lib.rs
git commit -m "feat(rust): глобальный toggle-хоткей скрытия/показа окна"
```

---

### Task 3: CLAUDE.md + проверки + ручная приёмка

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Обновить CLAUDE.md**

(а) В разделе «The Rust ⇄ frontend contract», найти:

```
- `Settings` (9 fields) is defined identically in `src-tauri/src/settings.rs` and `src/ipc/types.ts`.
```

заменить на:

```
- `Settings` (10 fields) is defined identically in `src-tauri/src/settings.rs` and `src/ipc/types.ts`.
```

(б) В разделе «Rust backend», в пункте про `hotkey.rs`, найти:

```
- `hotkey.rs` — push-to-talk registration; `parse_hotkey` is the only unit-tested function here.
```

заменить на:

```
- `hotkey.rs` — push-to-talk registration + глобальный toggle-хоткей скрытия/показа окна (`register_toggle` → `on_toggle_visibility`: `hide` ↔ `show`+`set_focus`); `parse_hotkey` is the only unit-tested function here. Обработчики деферятся (`defer`) — инвариант реестра плагина.
```

- [ ] **Step 2: Полный прогон проверок**

Run:
```bash
npm run lint && npm run format:check && npm run typecheck && npm run knip && npx vitest run
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml --lib && cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```
Expected: всё зелёное. (Если `format:check` ругается на `CLAUDE.md` — `npx prettier --write CLAUDE.md`.)

- [ ] **Step 3: Ручная приёмка в Tauri**

Run: `npm run tauri dev`, затем по чек-листу:
1. Нажать `Cmd+Shift+H` → окно исчезает с экрана; повторное нажатие → окно появляется и в фокусе (поверх).
2. Сработать хоткей, когда окно НЕ в фокусе (кликнуть в другое приложение) → скрытие/показ всё равно работают (глобальный шорткат).
3. Иконка в Dock остаётся при скрытом окне; клик по Dock тоже возвращает окно.
4. В настройках сменить «Скрыть/показать окно» на другой комбо (захват) → сохранить → новый хоткей работает, старый — нет; без перезапуска.
5. PTT (запись) при скрытом окне продолжает работать; невалидный/занятый toggle-хоткей при сохранении даёт ошибку в строке ошибок, прежнее поведение цело.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — toggle-хоткей окна, 10 полей Settings"
```
