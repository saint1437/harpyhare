# Compact UI + Tab Rail + Resize Hotkeys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Хоткеи Cmd+Shift+стрелки меняют размер окна (с персистом), табы становятся вертикальной рейкой цифр слева, UI уплотняется (окно 960×680, поле промпта 1 строка с аворостом, однострочная шапка).

**Architecture:** Нативный NSEvent-монитор поглощает Cmd/Ctrl+Shift+стрелки и эмитит событие `resize-key`; фронт владеет базовым размером окна (`Settings.window_width/height`), применяет шаг и клампы, зовёт Rust-команду `set_window_size` (обобщение `set_window_width`: твин ширины+высоты) и дебаунс-персистит. Ширина чат-колонки деривируется от `window_width`; превью-панель добавляет свою ширину поверх базы.

**Tech Stack:** Tauri 2 (Rust: objc2_app_kit NSEvent monitor, serde settings), React 19 + Tailwind v4, vitest + @testing-library/react, cargo test.

**Спека:** `apps/desktop/docs/superpowers/specs/2026-07-21-compact-ui-tab-rail-resize-hotkeys-design.md`

## Global Constraints

- Все пути в плане — абсолютные. Фронт-команды запускать из `/Users/mark/i.tech/apps/desktop`.
- **PATH для npm/npx/git commit:** `export PATH="/opt/homebrew/bin:$PATH"` — дефолтный шелл даёт node v16, на нём падает pre-commit (nx). Для cargo: `export PATH="$HOME/.cargo/bin:$PATH"`.
- **Комментарии в коде запрещены полностью** (правило CLAUDE.md). Магические значения → именованные константы.
- **Контракт Rust ⇄ фронт меняется синхронно в одном коммите** (команды, события, поля Settings).
- Клампы размера окна: ширина **880–1600**, высота **520–1100**; дефолт **960×680**; шаг — существующий `Settings.move_step` (дефолт 20). Значения обязаны совпадать в `settings.rs` и `lib/window-size.ts`.
- Полярность хоткеев: ← уже, → шире, ↑ ниже, ↓ выше (верхний край окна фиксирован, рост вниз).
- Коммиты: `feat(desktop): …` / `docs(desktop): …` на русском + трейлер `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Pre-commit сам гоняет lint-staged → tsc -b → knip; если он падает — чинить, не обходить.

---

### Task 1: Settings — поля window_width/window_height (Rust + types.ts)

**Files:**
- Modify: `/Users/mark/i.tech/apps/desktop/src-tauri/src/settings.rs`
- Modify: `/Users/mark/i.tech/apps/desktop/src/ipc/types.ts`

**Interfaces:**
- Produces: `Settings.window_width: f64` (дефолт 960.0, кламп 880–1600), `Settings.window_height: f64` (дефолт 680.0, кламп 520–1100) — идентично в Rust и TS (`window_width: number`, `window_height: number` в `DEFAULT_SETTINGS`: 960/680). Их читают Task 2 (синк геометрии) и Task 3 (bumpWindowSize).

- [ ] **Step 1: Написать падающие Rust-тесты**

В `settings.rs`, в `mod tests`, добавить (рядом с `clamp_limits_chat_font_size`):

```rust
    #[test]
    fn clamp_limits_window_size() {
        let mut s = Settings::default();
        s.window_width = 100.0;
        s.window_height = 100.0;
        s.clamp();
        assert_eq!(s.window_width, 880.0);
        assert_eq!(s.window_height, 520.0);
        s.window_width = 5000.0;
        s.window_height = 5000.0;
        s.clamp();
        assert_eq!(s.window_width, 1600.0);
        assert_eq!(s.window_height, 1100.0);
        s.window_width = f64::NAN;
        s.window_height = f64::NAN;
        s.clamp();
        assert_eq!(s.window_width, 960.0);
        assert_eq!(s.window_height, 680.0);
    }

    #[test]
    fn load_missing_window_size_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.window_width, 960.0);
        assert_eq!(s.window_height, 680.0);
    }
```

И в существующий `defaults_match_spec` дописать две строки:

```rust
        assert_eq!(s.window_width, 960.0);
        assert_eq!(s.window_height, 680.0);
```

- [ ] **Step 2: Убедиться, что тесты падают (нет полей — не компилируется)**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test --manifest-path /Users/mark/i.tech/apps/desktop/src-tauri/Cargo.toml --lib settings`
Expected: ошибка компиляции `no field window_width`.

- [ ] **Step 3: Добавить поля, дефолты, клампы**

В `settings.rs` к константам (после `DEFAULT_TELEPROMPTER_FONT_SIZE`):

```rust
const DEFAULT_WINDOW_WIDTH: f64 = 960.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 680.0;
```

К клампам (после `TELEPROMPTER_FONT_SIZE_MAX`):

```rust
const WINDOW_WIDTH_MIN: f64 = 880.0;
const WINDOW_WIDTH_MAX: f64 = 1600.0;
const WINDOW_HEIGHT_MIN: f64 = 520.0;
const WINDOW_HEIGHT_MAX: f64 = 1100.0;
```

В struct `Settings` (после `teleprompter_resume`):

```rust
    pub window_width: f64,
    pub window_height: f64,
```

В `Default::default()` (после `teleprompter_resume: true,`):

```rust
            window_width: DEFAULT_WINDOW_WIDTH,
            window_height: DEFAULT_WINDOW_HEIGHT,
```

В `clamp()` (в конец метода, по образцу `chat_font_size`):

```rust
        if !self.window_width.is_finite() {
            self.window_width = DEFAULT_WINDOW_WIDTH;
        }
        self.window_width = self.window_width.clamp(WINDOW_WIDTH_MIN, WINDOW_WIDTH_MAX);
        if !self.window_height.is_finite() {
            self.window_height = DEFAULT_WINDOW_HEIGHT;
        }
        self.window_height = self.window_height.clamp(WINDOW_HEIGHT_MIN, WINDOW_HEIGHT_MAX);
```

- [ ] **Step 4: Прогнать Rust-тесты**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test --manifest-path /Users/mark/i.tech/apps/desktop/src-tauri/Cargo.toml --lib settings`
Expected: все тесты settings PASS (включая 2 новых).

- [ ] **Step 5: Синхронизировать types.ts**

В `/Users/mark/i.tech/apps/desktop/src/ipc/types.ts` в `interface Settings` (после `teleprompter_resume: boolean;`):

```ts
  window_width: number;
  window_height: number;
```

В `DEFAULT_SETTINGS` (после `teleprompter_resume: true,`):

```ts
  window_width: 960,
  window_height: 680,
```

- [ ] **Step 6: Typecheck фронта**

Run: `cd /Users/mark/i.tech/apps/desktop && export PATH="/opt/homebrew/bin:$PATH" && npm run typecheck`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
cd /Users/mark/i.tech && export PATH="/opt/homebrew/bin:$PATH" && git add apps/desktop/src-tauri/src/settings.rs apps/desktop/src/ipc/types.ts && git commit -m "feat(desktop): настройки размера окна window_width/window_height

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Команда set_window_size + синк геометрии окна с настройками

**Files:**
- Modify: `/Users/mark/i.tech/apps/desktop/src-tauri/src/lib.rs` (константы твина ~50–53, setup_app ~176–194, ResizeTween/set_window_width/run_resize_tween ~910–999, generate_handler ~160)
- Modify: `/Users/mark/i.tech/apps/desktop/src-tauri/tauri.conf.json` (окно 960×680)
- Modify: `/Users/mark/i.tech/apps/desktop/src/ipc/commands.ts` (setWindowWidth → setWindowSize)
- Modify: `/Users/mark/i.tech/apps/desktop/src/App.tsx` (константы, usePreviewPanel, useWindowFrameSync, ширина колонки)

**Interfaces:**
- Consumes: `Settings.window_width/window_height` (Task 1).
- Produces: Rust-команда `set_window_size(width: f64, height: f64)` (регистрация вместо `set_window_width`); фронт-обёртка `setWindowSize(width: number, height: number): Promise<void>` в `ipc/commands.ts`. Хук `useWindowFrameSync` в App.tsx — единственное место, зовущее `setWindowSize`. Task 3 полагается на то, что смена `settings.window_width/height` в состоянии `useSettings` автоматически применяется к окну этим эффектом.
- Поведенческое изменение: ранний выход `set_window_size` — только по эпсилону размеров (без проверки `x`): вызов с тем же размером — полный no-op, окно больше не перецентрируется при запуске.

- [ ] **Step 1: tauri.conf.json — новый дефолт окна**

В `/Users/mark/i.tech/apps/desktop/src-tauri/tauri.conf.json` заменить `"width": 1140,` → `"width": 960,` и `"height": 860,` → `"height": 680,`.

- [ ] **Step 2: Rust — переименовать команду и растянуть твин на высоту**

В `lib.rs`:

Константы: `RESIZE_WIDTH_EPSILON_LOGICAL_PX` переименовать в `RESIZE_EPSILON_LOGICAL_PX`; строку `const FALLBACK_WINDOW_HEIGHT_LOGICAL_PX: f64 = 640.0;` удалить.

Заменить блок `ResizeTween` + `set_window_width` + `run_resize_tween` (строки ~910–984) на:

```rust
struct ResizeTween {
    from_width: f64,
    to_width: f64,
    from_height: f64,
    to_height: f64,
    from_x: i32,
    to_x: i32,
    y: i32,
}

#[tauri::command]
fn set_window_size(app: AppHandle, width: f64, height: f64) {
    let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let scale = w.scale_factor().unwrap_or(1.0);
    let from_width = w.outer_size().map(|s| s.width as f64 / scale).unwrap_or(width);
    let from_height = w.outer_size().map(|s| s.height as f64 / scale).unwrap_or(height);
    let from_pos = w.outer_position().unwrap_or(tauri::PhysicalPosition::new(0, 0));

    if (from_width - width).abs() < RESIZE_EPSILON_LOGICAL_PX
        && (from_height - height).abs() < RESIZE_EPSILON_LOGICAL_PX
    {
        return;
    }

    let my_gen = app
        .state::<App>()
        .resize_gen
        .fetch_add(1, Ordering::SeqCst)
        + 1;
    let tween = ResizeTween {
        from_width,
        to_width: width,
        from_height,
        to_height: height,
        from_x: from_pos.x,
        to_x: centered_target_x(&w, width, scale),
        y: from_pos.y,
    };
    std::thread::spawn(move || run_resize_tween(app, w, tween, my_gen));
}
```

`run_resize_tween` заменить на:

```rust
fn run_resize_tween(app: AppHandle, w: tauri::WebviewWindow, tween: ResizeTween, my_gen: u64) {
    for i in 1..=RESIZE_TWEEN_STEPS {
        if app.state::<App>().resize_gen.load(Ordering::SeqCst) != my_gen {
            return;
        }
        let eased = ease_out_cubic(f64::from(i) / f64::from(RESIZE_TWEEN_STEPS));
        let cur_w = tween.from_width + (tween.to_width - tween.from_width) * eased;
        let cur_h = tween.from_height + (tween.to_height - tween.from_height) * eased;
        let cur_x = (f64::from(tween.from_x) + f64::from(tween.to_x - tween.from_x) * eased)
            .round() as i32;
        apply_window_frame(&app, &w, cur_x, tween.y, cur_w, cur_h);
        std::thread::sleep(RESIZE_TWEEN_FRAME_INTERVAL);
    }
    if app.state::<App>().resize_gen.load(Ordering::SeqCst) == my_gen {
        apply_window_frame(
            &app,
            &w,
            tween.to_x,
            tween.y,
            tween.to_width,
            tween.to_height,
        );
    }
}
```

В `generate_handler![...]` заменить `set_window_width,` → `set_window_size,`.

- [ ] **Step 3: Rust — применить персистнутый размер на старте**

В `lib.rs` после функции `apply_screen_share_visibility_at_startup` добавить:

```rust
fn apply_window_size_at_startup(app: &AppHandle, settings: &settings::Settings) {
    if let Some(w) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = w.set_size(tauri::LogicalSize::new(
            settings.window_width,
            settings.window_height,
        ));
    }
}
```

И в `setup_app` после строки `apply_screen_share_visibility_at_startup(handle, &settings);` добавить:

```rust
    apply_window_size_at_startup(handle, &settings);
```

- [ ] **Step 4: Rust — компиляция и clippy**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo clippy --manifest-path /Users/mark/i.tech/apps/desktop/src-tauri/Cargo.toml --lib`
Expected: без ошибок и новых warning'ов.

- [ ] **Step 5: Фронт — обёртка setWindowSize**

В `/Users/mark/i.tech/apps/desktop/src/ipc/commands.ts` заменить функцию `setWindowWidth` на:

```ts
export async function setWindowSize(width: number, height: number): Promise<void> {
  await invokeOrNoopInBrowser("set_window_size", { width, height });
}
```

- [ ] **Step 6: App.tsx — синк геометрии из настроек**

В `/Users/mark/i.tech/apps/desktop/src/App.tsx`:

Импорт: `setWindowWidth` → `setWindowSize`.

Константы (строки 60–64) заменить:

```ts
const SHELL_COLUMN_GAP_PX = 12;
const SHELL_PADDING_PX = 16;
const PREVIEW_EXTRA_WIDTH_PX = PREVIEW_PANEL_WIDTH_PX + SHELL_COLUMN_GAP_PX;
```

(`BASE_WINDOW_WIDTH`, `CHAT_COLUMN_WIDTH_PX`, `PREVIEW_OPEN_WINDOW_WIDTH` — удалить.)

В `usePreviewPanel` удалить `useEffect` с `setWindowWidth` (строки 262–264); остальное без изменений.

После `usePreviewPanel` добавить хук:

```ts
function useWindowFrameSync(
  windowWidth: number,
  windowHeight: number,
  previewOpen: boolean,
  ready: boolean,
): void {
  useEffect(() => {
    if (!ready) return;
    void setWindowSize(windowWidth + (previewOpen ? PREVIEW_EXTRA_WIDTH_PX : 0), windowHeight);
  }, [windowWidth, windowHeight, previewOpen, ready]);
}
```

В компоненте `App` после строки с `usePreviewPanel()` добавить:

```ts
  useWindowFrameSync(
    settings.window_width,
    settings.window_height,
    previewOpen,
    !settingsLoading,
  );
  const chatColumnWidth = settings.window_width - SHELL_PADDING_PX * 2;
```

И в разметке заменить `style={{ width: CHAT_COLUMN_WIDTH_PX }}` → `style={{ width: chatColumnWidth }}`.

Гейт `ready: !settingsLoading` обязателен: до загрузки настроек эффект молчит, иначе дефолтные 960×680 затёрли бы персистнутый размер, применённый Rust'ом на старте.

- [ ] **Step 7: Тесты фронта + typecheck**

Run: `cd /Users/mark/i.tech/apps/desktop && export PATH="/opt/homebrew/bin:$PATH" && npm run typecheck && npx vitest run`
Expected: PASS (существующие тесты не трогают setWindowWidth).

- [ ] **Step 8: Живая проверка в Tauri**

Run: `cd /Users/mark/i.tech/apps/desktop && export PATH="/opt/homebrew/bin:$PATH:$HOME/.cargo/bin" && npm run tauri dev`
Проверить: окно 960×680; открытие превью (кнопка «Превью» на HTML-блоке ответа или через demo) центрирует и расширяет окно, закрытие сужает. Закрыть приложение.

- [ ] **Step 9: Commit**

```bash
cd /Users/mark/i.tech && export PATH="/opt/homebrew/bin:$PATH" && git add apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tauri.conf.json apps/desktop/src/ipc/commands.ts apps/desktop/src/App.tsx && git commit -m "feat(desktop): set_window_size и синк геометрии окна с настройками

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Хоткеи Cmd+Shift+стрелки — изменение размера end-to-end

**Files:**
- Create: `/Users/mark/i.tech/apps/desktop/src/lib/window-size.ts`
- Create: `/Users/mark/i.tech/apps/desktop/src/lib/window-size.test.ts`
- Modify: `/Users/mark/i.tech/apps/desktop/src-tauri/src/lib.rs` (монитор ~332–368, константы событий ~40)
- Modify: `/Users/mark/i.tech/apps/desktop/src/ipc/types.ts` (EventMap)
- Modify: `/Users/mark/i.tech/apps/desktop/src/hooks/useSettings.ts` (+bumpWindowSize)
- Modify: `/Users/mark/i.tech/apps/desktop/src/hooks/useSettings.test.ts`
- Modify: `/Users/mark/i.tech/apps/desktop/src/hooks/useWindowControls.ts` (+resize-key: событие и JS-фолбэк)
- Modify: `/Users/mark/i.tech/apps/desktop/src/hooks/useWindowControls.test.ts`
- Modify: `/Users/mark/i.tech/apps/desktop/src/App.tsx` (проброс bumpWindowSize)
- Modify: `/Users/mark/i.tech/apps/desktop/src/components/HotkeyHints.tsx` (новая подсказка)

**Interfaces:**
- Consumes: `Settings.window_width/window_height` (Task 1); `useWindowFrameSync` (Task 2) — bump меняет состояние настроек, окно применяется автоматически.
- Produces:
  - `lib/window-size.ts`: `type WindowDimension = "width" | "height"`; `stepWindowSize(size: {width: number; height: number}, dim: WindowDimension, dir: 1 | -1, step: number): {width: number; height: number}`; `resizeKeyFromCode(code: string): {dim: WindowDimension; dir: 1 | -1} | null`; константы `WINDOW_WIDTH_MIN_PX = 880`, `WINDOW_WIDTH_MAX_PX = 1600`, `WINDOW_HEIGHT_MIN_PX = 520`, `WINDOW_HEIGHT_MAX_PX = 1100`.
  - Событие `resize-key: { dim: "width" | "height"; dir: 1 | -1 }` в `EventMap` (эмитит Rust-монитор).
  - `SettingsApi.bumpWindowSize(dim: WindowDimension, dir: 1 | -1): void`.
  - `useWindowControls(moveStep, onSend, onOpacityStep, onResizeKey)` — 4-й параметр `(dim: WindowDimension, dir: 1 | -1) => void`.

- [ ] **Step 1: Падающие тесты lib/window-size**

Создать `/Users/mark/i.tech/apps/desktop/src/lib/window-size.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  resizeKeyFromCode,
  stepWindowSize,
  WINDOW_HEIGHT_MAX_PX,
  WINDOW_WIDTH_MIN_PX,
} from "./window-size";

describe("stepWindowSize", () => {
  it("шагает ширину, не трогая высоту", () => {
    expect(stepWindowSize({ width: 960, height: 680 }, "width", 1, 20)).toEqual({
      width: 980,
      height: 680,
    });
  });

  it("шагает высоту вниз", () => {
    expect(stepWindowSize({ width: 960, height: 680 }, "height", -1, 20)).toEqual({
      width: 960,
      height: 660,
    });
  });

  it("клампит по минимуму ширины", () => {
    expect(stepWindowSize({ width: 890, height: 680 }, "width", -1, 40).width).toBe(
      WINDOW_WIDTH_MIN_PX,
    );
  });

  it("клампит по максимуму высоты", () => {
    expect(stepWindowSize({ width: 960, height: 1090 }, "height", 1, 40).height).toBe(
      WINDOW_HEIGHT_MAX_PX,
    );
  });
});

describe("resizeKeyFromCode", () => {
  it.each([
    ["ArrowLeft", { dim: "width", dir: -1 }],
    ["ArrowRight", { dim: "width", dir: 1 }],
    ["ArrowUp", { dim: "height", dir: -1 }],
    ["ArrowDown", { dim: "height", dir: 1 }],
  ])("%s → %j", (code, expected) => {
    expect(resizeKeyFromCode(code)).toEqual(expected);
  });

  it("прочие коды → null", () => {
    expect(resizeKeyFromCode("Equal")).toBeNull();
  });
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `cd /Users/mark/i.tech/apps/desktop && export PATH="/opt/homebrew/bin:$PATH" && npx vitest run src/lib/window-size.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать lib/window-size.ts**

```ts
export const WINDOW_WIDTH_MIN_PX = 880;
export const WINDOW_WIDTH_MAX_PX = 1600;
export const WINDOW_HEIGHT_MIN_PX = 520;
export const WINDOW_HEIGHT_MAX_PX = 1100;

export type WindowDimension = "width" | "height";

export interface WindowSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function stepWindowSize(
  size: WindowSize,
  dim: WindowDimension,
  dir: 1 | -1,
  step: number,
): WindowSize {
  if (dim === "width") {
    return {
      ...size,
      width: clamp(size.width + dir * step, WINDOW_WIDTH_MIN_PX, WINDOW_WIDTH_MAX_PX),
    };
  }
  return {
    ...size,
    height: clamp(size.height + dir * step, WINDOW_HEIGHT_MIN_PX, WINDOW_HEIGHT_MAX_PX),
  };
}

export function resizeKeyFromCode(
  code: string,
): { dim: WindowDimension; dir: 1 | -1 } | null {
  switch (code) {
    case "ArrowLeft":
      return { dim: "width", dir: -1 };
    case "ArrowRight":
      return { dim: "width", dir: 1 };
    case "ArrowUp":
      return { dim: "height", dir: -1 };
    case "ArrowDown":
      return { dim: "height", dir: 1 };
    default:
      return null;
  }
}
```

Run: `npx vitest run src/lib/window-size.test.ts` → PASS.

- [ ] **Step 4: Rust — событие resize-key из монитора**

В `lib.rs` к константам событий (после `EVENT_TOGGLE_TELEPROMPTER`):

```rust
const EVENT_RESIZE_KEY: &str = "resize-key";
const RESIZE_DIM_WIDTH: &str = "width";
const RESIZE_DIM_HEIGHT: &str = "height";
```

Перед `install_move_keys_monitor` добавить:

```rust
#[derive(Clone, serde::Serialize)]
struct ResizeKeyPayload {
    dim: &'static str,
    dir: i32,
}

fn emit_resize_key(app: &AppHandle, dx: i32, dy: i32) {
    let (dim, dir) = if dx != 0 {
        (RESIZE_DIM_WIDTH, dx)
    } else {
        (RESIZE_DIM_HEIGHT, dy)
    };
    let _ = app.emit(EVENT_RESIZE_KEY, ResizeKeyPayload { dim, dir });
}
```

В блоке монитора после `let (dx, dy) = match event.keyCode() { ... };` вставить перед чтением `move_step`:

```rust
            if flags.contains(NSEventModifierFlags::Shift) {
                emit_resize_key(&app, dx, dy);
                return std::ptr::null_mut();
            }
```

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo clippy --manifest-path /Users/mark/i.tech/apps/desktop/src-tauri/Cargo.toml --lib` → чисто.

- [ ] **Step 5: EventMap**

В `/Users/mark/i.tech/apps/desktop/src/ipc/types.ts` в `EventMap` (после `"toggle-teleprompter": null;`):

```ts
  "resize-key": { dim: "width" | "height"; dir: 1 | -1 };
```

- [ ] **Step 6: Падающий тест bumpWindowSize**

В `/Users/mark/i.tech/apps/desktop/src/hooks/useSettings.test.ts` добавить в `describe("useSettings", ...)`:

```ts
  it("bumpWindowSize шагает ширину и персистит с дебаунсом", async () => {
    vi.useFakeTimers();
    getSettings.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    setSettings.mockClear();
    act(() => {
      result.current.bumpWindowSize("width", 1);
    });
    expect(result.current.settings.window_width).toBe(980);
    expect(result.current.settings.window_height).toBe(680);
    expect(setSettings).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings.mock.calls[0]?.[0]?.window_width).toBe(980);
    vi.useRealTimers();
  });

  it("bumpWindowSize клампит по минимуму ширины", async () => {
    getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, window_width: 880 });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    act(() => {
      result.current.bumpWindowSize("width", -1);
    });
    expect(result.current.settings.window_width).toBe(880);
  });
```

Run: `npx vitest run src/hooks/useSettings.test.ts` → FAIL (`bumpWindowSize` не существует).

- [ ] **Step 7: Реализовать bumpWindowSize в useSettings**

В `/Users/mark/i.tech/apps/desktop/src/hooks/useSettings.ts`:

Импорт: `import { stepWindowSize, type WindowDimension } from "@/lib/window-size";`

Константа (рядом с `OPACITY_PERSIST_DEBOUNCE_MS`):

```ts
const WINDOW_SIZE_PERSIST_DEBOUNCE_MS = 400;
```

В `SettingsApi` (после `bumpOpacity`):

```ts
  bumpWindowSize: (dim: WindowDimension, dir: 1 | -1) => void;
```

После `useBumpOpacity` добавить (тот же паттерн):

```ts
function useBumpWindowSize(
  setSettings: Dispatch<SetStateAction<Settings>>,
): (dim: WindowDimension, dir: 1 | -1) => void {
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(persistTimer.current);
    },
    [],
  );

  return useCallback(
    (dim, dir) => {
      setSettings((prev) => {
        const next = stepWindowSize(
          { width: prev.window_width, height: prev.window_height },
          dim,
          dir,
          prev.move_step,
        );
        const updated = { ...prev, window_width: next.width, window_height: next.height };
        clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
          void ipcSet(updated);
        }, WINDOW_SIZE_PERSIST_DEBOUNCE_MS);
        return updated;
      });
    },
    [setSettings],
  );
}
```

В `useSettings`: `const bumpWindowSize = useBumpWindowSize(setSettings);` и добавить в возвращаемый объект.

Run: `npx vitest run src/hooks/useSettings.test.ts` → PASS.

- [ ] **Step 8: Падающие тесты useWindowControls**

Переписать `/Users/mark/i.tech/apps/desktop/src/hooks/useWindowControls.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventMap } from "@/ipc/types";

const listeners = new Map<string, (payload: unknown) => void>();

vi.mock("@/ipc/commands", () => ({
  moveWindowBy: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: (payload: unknown) => void) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  },
}));

import { moveWindowBy } from "@/ipc/commands";
import { useWindowControls } from "./useWindowControls";

afterEach(() => {
  vi.clearAllMocks();
  listeners.clear();
});

function keydown(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
}

function renderControls(onResizeKey = vi.fn(), onOpacityStep = vi.fn()) {
  renderHook(() => {
    useWindowControls(20, vi.fn(), onOpacityStep, onResizeKey);
  });
  return { onResizeKey, onOpacityStep };
}

describe("useWindowControls — opacity", () => {
  it("Cmd+Shift+Equal → onOpacityStep(1)", () => {
    const { onOpacityStep } = renderControls();
    keydown({ metaKey: true, shiftKey: true, code: "Equal" });
    expect(onOpacityStep).toHaveBeenCalledWith(1);
  });
  it("Cmd+Shift+Minus → onOpacityStep(-1)", () => {
    const { onOpacityStep } = renderControls();
    keydown({ metaKey: true, shiftKey: true, code: "Minus" });
    expect(onOpacityStep).toHaveBeenCalledWith(-1);
  });
  it("без Shift не триггерит opacity", () => {
    const { onOpacityStep } = renderControls();
    keydown({ metaKey: true, code: "Equal" });
    expect(onOpacityStep).not.toHaveBeenCalled();
  });
});

describe("useWindowControls — resize", () => {
  it("Cmd+Shift+ArrowLeft → onResizeKey('width', -1), окно не двигается", () => {
    const { onResizeKey } = renderControls();
    keydown({ metaKey: true, shiftKey: true, code: "ArrowLeft" });
    expect(onResizeKey).toHaveBeenCalledWith("width", -1);
    expect(moveWindowBy).not.toHaveBeenCalled();
  });
  it("Cmd+Shift+ArrowDown → onResizeKey('height', 1)", () => {
    const { onResizeKey } = renderControls();
    keydown({ metaKey: true, shiftKey: true, code: "ArrowDown" });
    expect(onResizeKey).toHaveBeenCalledWith("height", 1);
  });
  it("Cmd+ArrowLeft без Shift двигает окно, а не ресайзит", () => {
    const { onResizeKey } = renderControls();
    keydown({ metaKey: true, code: "ArrowLeft" });
    expect(onResizeKey).not.toHaveBeenCalled();
    expect(moveWindowBy).toHaveBeenCalledWith(-20, 0);
  });
  it("событие resize-key от нативного монитора → onResizeKey", () => {
    const { onResizeKey } = renderControls();
    const payload: EventMap["resize-key"] = { dim: "height", dir: -1 };
    listeners.get("resize-key")?.(payload);
    expect(onResizeKey).toHaveBeenCalledWith("height", -1);
  });
});
```

Run: `npx vitest run src/hooks/useWindowControls.test.ts` → FAIL (сигнатура из 3 аргументов, resize нет).

- [ ] **Step 9: Реализовать useWindowControls**

Заменить `/Users/mark/i.tech/apps/desktop/src/hooks/useWindowControls.ts` на:

```ts
import { useEffect } from "react";
import { moveWindowBy } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { moveDelta } from "@/lib/window-controls";
import { resizeKeyFromCode, type WindowDimension } from "@/lib/window-size";

const KEYDOWN_EVENT = "keydown";
const OPACITY_UP_CODE = "Equal";
const OPACITY_DOWN_CODE = "Minus";
const SEND_CODE = "Enter";

type ResizeKeyHandler = (dim: WindowDimension, dir: 1 | -1) => void;

function opacityStepFromEvent(e: KeyboardEvent): 1 | -1 | null {
  if (!(e.metaKey && e.shiftKey)) return null;
  if (e.code === OPACITY_UP_CODE) return 1;
  if (e.code === OPACITY_DOWN_CODE) return -1;
  return null;
}

function resizeKeyFromEvent(e: KeyboardEvent): { dim: WindowDimension; dir: 1 | -1 } | null {
  if (!((e.metaKey || e.ctrlKey) && e.shiftKey)) return null;
  return resizeKeyFromCode(e.code);
}

export function useWindowControls(
  moveStep: number,
  onSend: () => void,
  onOpacityStep: (dir: 1 | -1) => void,
  onResizeKey: ResizeKeyHandler,
): void {
  useEffect(
    () =>
      onEvent("resize-key", ({ dim, dir }) => {
        onResizeKey(dim, dir);
      }),
    [onResizeKey],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const opacityDir = opacityStepFromEvent(e);
      if (opacityDir !== null) {
        e.preventDefault();
        onOpacityStep(opacityDir);
        return;
      }
      const resizeKey = resizeKeyFromEvent(e);
      if (resizeKey) {
        e.preventDefault();
        onResizeKey(resizeKey.dim, resizeKey.dir);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.code === SEND_CODE) {
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
    document.addEventListener(KEYDOWN_EVENT, onKey);
    return () => {
      document.removeEventListener(KEYDOWN_EVENT, onKey);
    };
  }, [moveStep, onSend, onOpacityStep, onResizeKey]);
}
```

(JS-keydown-ветка — браузерный мок; в Tauri монитор поглощает стрелки до WKWebView, доходит только событие `resize-key`.)

Run: `npx vitest run src/hooks/useWindowControls.test.ts` → PASS.

- [ ] **Step 10: App.tsx — проброс + подсказка**

В `App.tsx` заменить вызов:

```ts
  useWindowControls(settings.move_step, doSend, bumpOpacity, bumpWindowSize);
```

и в деструктуризации `useSettings()` добавить `bumpWindowSize`:

```ts
  const { settings, loading: settingsLoading, save, reload, bumpOpacity, bumpWindowSize } =
    useSettings();
```

В `/Users/mark/i.tech/apps/desktop/src/components/HotkeyHints.tsx` в `STATIC_HINTS` добавить последним элементом:

```ts
  ["⌘⇧←→↑↓", "размер"],
```

- [ ] **Step 11: Все тесты + typecheck**

Run: `cd /Users/mark/i.tech/apps/desktop && export PATH="/opt/homebrew/bin:$PATH" && npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 12: Живой смоук хоткеев**

Run: `npm run tauri dev` (с PATH как выше). Проверить: Cmd+Shift+← / → меняют ширину, ↑ / ↓ — высоту (верхний край на месте); Cmd+стрелки без Shift — двигают окно как раньше; после ресайза и перезапуска размер восстановился; при открытом превью ресайз ширины работает от базы. Закрыть.

- [ ] **Step 13: Commit**

```bash
cd /Users/mark/i.tech && export PATH="/opt/homebrew/bin:$PATH" && git add -A apps/desktop/src apps/desktop/src-tauri/src/lib.rs && git commit -m "feat(desktop): хоткеи Cmd+Shift+стрелки — изменение размера окна с персистом

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Вертикальная рейка номерных табов слева

**Files:**
- Create: `/Users/mark/i.tech/apps/desktop/src/components/TabRail.tsx`
- Delete: `/Users/mark/i.tech/apps/desktop/src/components/ChatTabs.tsx`
- Modify: `/Users/mark/i.tech/apps/desktop/src/components/StatusBar.tsx` (одна строка, без tabs)
- Modify: `/Users/mark/i.tech/apps/desktop/src/hooks/useChats.ts` (удалить renameChat)
- Modify: `/Users/mark/i.tech/apps/desktop/src/hooks/useChats.test.ts` (удалить rename-тесты)
- Modify: `/Users/mark/i.tech/apps/desktop/src/App.tsx` (layout: рейка + колонка; AppHeader без chats/stream)

**Interfaces:**
- Consumes: `chatColumnWidth` (Task 2), `useWindowDrag`, `CHAT_LIMIT` из `@/lib/chats`.
- Produces: `TabRail({ chats, activeId, streaming, onSelect, onRemove, onNew })`, экспорт `TAB_RAIL_WIDTH_PX = 28` (используется в деривации `chatColumnWidth`). `ChatsApi` БЕЗ `renameChat`. `StatusBarProps` БЕЗ `tabs`.
- UX-уточнение против спеки: × по ховеру показывает только **активный** таб (клик по нему закрывает); у неактивных клик выбирает чат — иначе чат нельзя выбрать мышью. Закрыть неактивный: выбрать → ховер → ×.

- [ ] **Step 1: Удалить renameChat из useChats + тесты**

В `useChats.ts`: удалить callback `renameChat` (строки 192–199), его строку в `interface ChatsApi` (141) и в возвращаемом объекте (324).

В `useChats.test.ts`: удалить оба it-блока про rename (строки ~87–115: «renameChat меняет заголовок…» и «renameChat игнорирует пустое имя»).

Run: `npx vitest run src/hooks/useChats.test.ts` → PASS. (`npm run typecheck` пока упадёт — ChatTabs ещё зовёт onRename; чинится следующими шагами.)

- [ ] **Step 2: Создать TabRail.tsx**

```tsx
import { Plus, X } from "lucide-react";
import { useWindowDrag } from "@/hooks/useWindowDrag";
import { CHAT_LIMIT, type Chat } from "@/lib/chats";
import { cn } from "@/lib/utils";

export const TAB_RAIL_WIDTH_PX = 28;

export interface TabRailProps {
  chats: Chat[];
  activeId: string;
  streaming: Record<string, boolean>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onNew: () => void;
}

export function TabRail({ chats, activeId, streaming, onSelect, onRemove, onNew }: TabRailProps) {
  const onDragMouseDown = useWindowDrag();
  return (
    <nav
      aria-label="Чаты"
      className="flex shrink-0 flex-col items-center gap-1"
      style={{ width: TAB_RAIL_WIDTH_PX }}
      onMouseDown={onDragMouseDown}
    >
      {chats.map((c, i) => (
        <TabRailItem
          key={c.id}
          number={i + 1}
          title={c.title}
          isActive={c.id === activeId}
          isStreaming={!!streaming[c.id]}
          closable={chats.length > 1}
          onSelect={() => {
            onSelect(c.id);
          }}
          onRemove={() => {
            onRemove(c.id);
          }}
        />
      ))}
      <NewChatButton disabled={chats.length >= CHAT_LIMIT} onClick={onNew} />
    </nav>
  );
}

interface TabRailItemProps {
  number: number;
  title: string;
  isActive: boolean;
  isStreaming: boolean;
  closable: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function TabRailItem({
  number,
  title,
  isActive,
  isStreaming,
  closable,
  onSelect,
  onRemove,
}: TabRailItemProps) {
  const closeOnClick = isActive && closable;
  return (
    <button
      type="button"
      onClick={closeOnClick ? onRemove : onSelect}
      title={title || `Чат ${String(number)}`}
      aria-label={closeOnClick ? `Закрыть чат ${String(number)}` : `Чат ${String(number)}`}
      className={cn(
        "group relative grid size-7 shrink-0 place-items-center rounded-md font-mono text-[11px] transition-colors",
        isActive
          ? "bg-white/10 text-foreground"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
      )}
    >
      <span className={cn(closeOnClick && "group-hover:hidden")}>{number}</span>
      {closeOnClick && <X className="hidden size-3 group-hover:block" />}
      {isStreaming && (
        <span
          className="absolute -top-0.5 -right-0.5 size-1.5 animate-pulse rounded-full bg-primary"
          aria-hidden
        />
      )}
    </button>
  );
}

function NewChatButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Новый чат"
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Plus className="size-3.5" />
    </button>
  );
}
```

- [ ] **Step 3: Удалить ChatTabs.tsx**

```bash
rm /Users/mark/i.tech/apps/desktop/src/components/ChatTabs.tsx
```

- [ ] **Step 4: StatusBar — одна строка без tabs**

В `StatusBar.tsx`: из `StatusBarProps` удалить `tabs: ReactNode;` (и импорт `ReactNode`, если больше не нужен — он нужен для `WindowButton`, оставить). Из деструктуризации пропсов убрать `tabs`.

Заменить весь `return` компонента `StatusBar` на:

```tsx
  return (
    <header className="flex min-h-7 items-center gap-2" onMouseDown={onDragMouseDown}>
      <WindowButtons toggleHotkey={toggleHotkey} onClose={onClose} onHide={onHide} />
      <span
        className={cn("size-2.5 shrink-0 rounded-full", statusDotClass(state, showError))}
        aria-hidden
      />
      <span
        title={showError ? (error ?? undefined) : undefined}
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[11.5px]",
          showError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {showError ? error : statusTextFor(state, hotkey)}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        {update && <UpdateBadge update={update} />}
        <SettingsButton onClick={onOpenSettings} />
      </div>
    </header>
  );
```

- [ ] **Step 5: App.tsx — рейка в layout**

Импорты: `ChatTabs` → `TabRail, TAB_RAIL_WIDTH_PX` из `@/components/TabRail`.

`chatColumnWidth` (Task 2) заменить на:

```ts
  const chatColumnWidth =
    settings.window_width - SHELL_PADDING_PX * 2 - TAB_RAIL_WIDTH_PX - SHELL_COLUMN_GAP_PX;
```

В `AppHeader`: удалить пропсы `chats`/`stream` из `AppHeaderProps` и деструктуризации, удалить `tabs={<ChatTabs …/>}` из JSX `StatusBar`.

В разметке `App` перед `<div className="flex shrink-0 flex-col gap-3" …>` вставить:

```tsx
      <TabRail
        chats={chats.chats}
        activeId={chats.activeId}
        streaming={stream.streaming}
        onSelect={chats.selectChat}
        onRemove={(id) => {
          stream.stop(id);
          chats.removeChat(id);
        }}
        onNew={chats.newChat}
      />
```

И убрать `chats={chats} stream={stream}` из вызова `<AppHeader …/>`.

- [ ] **Step 6: Тесты + typecheck + lint**

Run: `cd /Users/mark/i.tech/apps/desktop && export PATH="/opt/homebrew/bin:$PATH" && npm run typecheck && npm run lint && npx vitest run`
Expected: PASS, ноль ссылок на ChatTabs/renameChat (проверить: `grep -rn "ChatTabs\|renameChat\|onRename" src/` → пусто).

- [ ] **Step 7: Визуальная проверка в браузерном моке**

Run: `npm run dev` → открыть localhost. Проверить: рейка слева с «1», `+` под ней; создание до 6 чатов; клик по неактивному — выбор; ховер активного — ×, клик — закрытие; при одном чате × нет; шапка — одна строка.

- [ ] **Step 8: Commit**

```bash
cd /Users/mark/i.tech && export PATH="/opt/homebrew/bin:$PATH" && git add -A apps/desktop/src && git commit -m "feat(desktop): вертикальная рейка номерных табов слева, однострочная шапка

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Уплотнение — композер, шелл

**Files:**
- Modify: `/Users/mark/i.tech/apps/desktop/src/components/Composer.tsx`
- Modify: `/Users/mark/i.tech/apps/desktop/src/App.tsx` (p-3/gap-2.5 + константы отступов)

**Interfaces:**
- Consumes: константы `SHELL_PADDING_PX`/`SHELL_COLUMN_GAP_PX` (Task 2) — меняются значения 16→12 и 12→10 синхронно с классами `p-3`/`gap-2.5`.
- Produces: только визуальные изменения, публичные пропсы `Composer` не меняются.

- [ ] **Step 1: Composer — компактное поле и контролы**

В `Composer.tsx`:

Константы (заменить блок 51–52):

```ts
const CONTROL_HEIGHT_CLASS = "h-7";
const CONTROL_WIDTH_CLASS = "w-[112px]";
const CONTROL_TEXT_CLASS = "text-[11px]";
const SELECT_TRIGGER_CLASS = `${CONTROL_HEIGHT_CLASS} ${CONTROL_WIDTH_CLASS} ${CONTROL_TEXT_CLASS}`;
const ICON_BUTTON_CLASS = "size-7 p-0";
const SEND_BUTTON_CLASS = `${CONTROL_HEIGHT_CLASS} ${CONTROL_WIDTH_CLASS} ${CONTROL_TEXT_CLASS}`;
```

Импорт иконок: `import { Eraser, NotebookText } from "lucide-react";`

В `PromptField` заменить `className` Textarea:

```
className="max-h-40 min-h-9 resize-none border-0 bg-transparent py-1.5 shadow-none focus-visible:ring-0"
```

В `ComposerControls` заменить кнопки «Очистить» и «Контекст» на иконки:

```tsx
      <Button
        variant="ghost"
        size="sm"
        className={ICON_BUTTON_CLASS}
        disabled={props.disabled}
        onClick={props.onClear}
        title="Очистить черновик"
        aria-label="Очистить черновик"
      >
        <Eraser className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`relative ${ICON_BUTTON_CLASS}`}
        disabled={props.disabled}
        onClick={props.onOpenContext}
        title="Контекст чата"
        aria-label="Контекст чата"
      >
        <NotebookText className="size-3.5" />
        {props.hasContext && (
          <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" aria-hidden />
        )}
      </Button>
```

Кнопку «Повторить»: `className={CONTROL_WIDTH_CLASS}` → `className={`${CONTROL_HEIGHT_CLASS} ${CONTROL_TEXT_CLASS} px-2`}`.

Кнопки «Стоп»/«Отправить» заменить на взаимоисключающие:

```tsx
      {props.streaming ? (
        <Button
          variant="destructive"
          size="sm"
          className={SEND_BUTTON_CLASS}
          onClick={props.onStop}
        >
          Стоп
        </Button>
      ) : (
        <Button
          size="sm"
          className={SEND_BUTTON_CLASS}
          onClick={props.onSend}
          disabled={props.disabled}
        >
          Отправить
        </Button>
      )}
```

Корневой `<section className="flex flex-col gap-2.5">` → `gap-2`.

- [ ] **Step 2: App.tsx — отступы шелла**

Константы: `SHELL_COLUMN_GAP_PX = 12` → `10`; `SHELL_PADDING_PX = 16` → `12`.

Классы корневого div: `gap-3 … p-4` → `gap-2.5 … p-3`. Класс чат-колонки: `gap-3` → `gap-2.5`.

- [ ] **Step 3: Тесты + typecheck + lint**

Run: `cd /Users/mark/i.tech/apps/desktop && export PATH="/opt/homebrew/bin:$PATH" && npm run typecheck && npm run lint && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Визуальная проверка**

Run: `npm run dev`. Проверить: поле ввода — одна строка, растёт при наборе до ~6 строк, дальше скролл; ряд контролов h-7 умещается без переноса при дефолтной ширине; иконки «ластик»/«блокнот» с тултипами; точка на блокноте при заполненном контексте (открыть диалог, сохранить текст); при стриме (в моке — после отправки) вместо «Отправить» — «Стоп».

Затем `npm run tauri dev`: проверить компоновку при минимальной ширине (Cmd+Shift+← до упора 880) — контролы не переполняют ряд.

- [ ] **Step 5: Commit**

```bash
cd /Users/mark/i.tech && export PATH="/opt/homebrew/bin:$PATH" && git add apps/desktop/src/components/Composer.tsx apps/desktop/src/App.tsx && git commit -m "feat(desktop): уплотнение UI — однострочный композер, компактные контролы и отступы

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: CLAUDE.md + финальная верификация

**Files:**
- Modify: `/Users/mark/i.tech/apps/desktop/CLAUDE.md`

**Interfaces:** нет — документация и полный прогон.

- [ ] **Step 1: Обновить CLAUDE.md (apps/desktop)**

Точечные правки:

1. Раздел «The Rust ⇄ frontend contract», список событий: после `toggle-teleprompter` добавить `resize-key`.
2. Там же, `Settings (19 fields)` → `Settings (21 fields)`; в конец абзаца о Settings добавить предложение:
   «`Settings.window_width`/`window_height` — базовый логический размер окна (дефолт 960×680, клампы 880–1600×520–1100 в `settings.clamp` и `lib/window-size.ts` — менять синхронно); применяется на старте (`apply_window_size_at_startup`) и при каждом изменении через `useWindowFrameSync` в App.tsx.»
3. Инвариант «Window manipulation goes through Rust commands»: заменить упоминания `set_window_width` на `set_window_size` (команда принимает ширину и высоту, твинит обе, верхний край фиксирован; ранний выход — по эпсилону размеров, поэтому вызов с тем же размером не перецентрирует окно).
4. Инвариант «Cmd/Ctrl+стрелки двигают окно…» дополнить: «С Shift те же стрелки меняют размер: монитор поглощает keyDown и эмитит `resize-key {dim, dir}`; фронт (`useWindowControls` → `useSettings.bumpWindowSize`) шагает `Settings.window_width/height` на `move_step` с клампами из `lib/window-size.ts`, окно применяет `useWindowFrameSync`, персист — дебаунсом (как opacity). Полярность: ←/↑ меньше, →/↓ больше.»
5. Инвариант «**Window height is static.**» заменить на: «**Window height меняется только пользователем.** Высота задаётся `Settings.window_height` (хоткеи Cmd+Shift+↑/↓); UI-логика высоту не трогает. Ширина — та же база плюс превью-панель: окно = `window_width` + `PREVIEW_EXTRA_WIDTH_PX` при открытом превью.»
6. Инвариант про чат-колонку: заменить «фиксированной ширины (`CHAT_COLUMN_WIDTH_PX` в App.tsx)» на «деривированной ширины (`window_width − отступы − TAB_RAIL_WIDTH_PX − gap` в App.tsx), меняется только дискретно по хоткею — во время твина превью колонка стабильна, инвариант отсутствия релэйаута сохраняется».
7. Упоминание табов в описании UI (раздел про StatusBar/драг): «`useWindowDrag` вешает `onMouseDown` на шапку (StatusBar) и футер (HotkeyHints)» дополнить «и на рейку табов (`TabRail` — вертикальные номерные табы слева; × по ховеру только на активном табе; переименование чатов удалено, поле `title` живёт в данных для совместимости chats.json)».

- [ ] **Step 2: Полная верификация**

```bash
cd /Users/mark/i.tech/apps/desktop && export PATH="/opt/homebrew/bin:$PATH:$HOME/.cargo/bin" \
  && npm run typecheck && npm run lint && npx vitest run && npm run knip \
  && cargo test --manifest-path src-tauri/Cargo.toml --lib \
  && cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```
Expected: всё зелёное.

- [ ] **Step 3: Ручной приёмочный прогон (tauri dev)**

`npm run tauri dev`, чек-лист:
- окно 960×680, рейка слева, шапка одной строкой, поле ввода в одну строку;
- Cmd+Shift+стрелки: все 4 направления, клампы по упорам, плавный твин;
- перезапуск приложения → размер восстановлен;
- Cmd+стрелки (движение), Cmd+Shift+«+/−» (прозрачность) — не сломаны;
- превью: открытие/закрытие центрирует и расширяет/сужает; ресайз при открытом превью;
- PTT-запись и отправка сообщения работают (регресс IPC не внесён).

- [ ] **Step 4: Commit**

```bash
cd /Users/mark/i.tech && export PATH="/opt/homebrew/bin:$PATH" && git add apps/desktop/CLAUDE.md && git commit -m "docs(desktop): CLAUDE.md — геометрия окна, хоткеи размера, рейка табов

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
