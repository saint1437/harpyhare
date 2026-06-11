# Окно HTML-превью для ответов Claude — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ` ```html `-блоки в ответах Claude сворачиваются в чип и открываются живым рендером в отдельном floating-окне над HUD (спека: `docs/superpowers/specs/2026-06-11-html-preview-design.md`).

**Architecture:** Второе Tauri-окно (label `preview`) грузит тот же Vite-бандл с `?window=preview`; `main.tsx` по этому параметру рендерит `PreviewApp` (шапка + `<iframe sandbox="allow-scripts" srcdoc>`). Rust-команда `show_html_preview` хранит HTML в state и создаёт/переиспользует окно; позиция над HUD считается чистой функцией `preview.rs::preview_rect`. Автооткрытие — обёртка над `appendAssistantMessage` в `App.tsx`, гейт — новое поле настроек `auto_preview_html`.

**Tech Stack:** Tauri 2 (WebviewWindowBuilder, capabilities), React 19, react-markdown v10 (override `pre`), vitest + renderHook, cargo test.

**Важно для порядка коммитов:** pre-commit гоняет `knip` — экспорт без потребителя валит коммит (использование в `*.test.ts` считается). Поэтому каждый ipc-экспорт коммитится в одном срезе со своим потребителем. Rust-проверки в хук не входят — гонять руками (`export PATH="$HOME/.cargo/bin:$PATH"`).

---

### Task 1: `extractHtmlBlocks` — извлечение ```html-блоков (lib)

**Files:**
- Create: `src/lib/html-blocks.ts`
- Test: `src/lib/html-blocks.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
// src/lib/html-blocks.test.ts
import { describe, expect, it } from "vitest";
import { extractHtmlBlocks } from "./html-blocks";

describe("extractHtmlBlocks", () => {
  it("извлекает одиночный закрытый блок", () => {
    const md = "Вот карточка:\n```html\n<p>привет</p>\n```\nготово";
    expect(extractHtmlBlocks(md)).toEqual(["<p>привет</p>"]);
  });

  it("извлекает несколько блоков по порядку", () => {
    const md = "```html\n<a>1</a>\n```\nтекст\n```html\n<b>2</b>\n<i>3</i>\n```";
    expect(extractHtmlBlocks(md)).toEqual(["<a>1</a>", "<b>2</b>\n<i>3</i>"]);
  });

  it("незакрытый fence не извлекается (стрим)", () => {
    expect(extractHtmlBlocks("```html\n<p>обрыв")).toEqual([]);
  });

  it("язык регистронезависим", () => {
    expect(extractHtmlBlocks("```HTML\n<b>x</b>\n```")).toEqual(["<b>x</b>"]);
  });

  it("другие языки игнорируются", () => {
    expect(extractHtmlBlocks("```js\nconst a = 1;\n```")).toEqual([]);
  });

  it("пустой и пробельный блоки не извлекаются", () => {
    expect(extractHtmlBlocks("```html\n```")).toEqual([]);
    expect(extractHtmlBlocks("```html\n   \n```")).toEqual([]);
  });

  it("текст без блоков — пустой массив", () => {
    expect(extractHtmlBlocks("обычный ответ про <html> без fence")).toEqual([]);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/lib/html-blocks.test.ts`
Expected: FAIL — `Cannot find module './html-blocks'` (или равнозначная ошибка резолва).

- [ ] **Step 3: Минимальная реализация**

```ts
// src/lib/html-blocks.ts
/**
 * Закрытые fenced-блоки ```html из markdown-текста (язык регистронезависимо).
 * Незакрытый fence (стрим ещё идёт) и пустые блоки не извлекаются —
 * автооткрытие превью работает только по финальному непустому HTML.
 */
export function extractHtmlBlocks(markdown: string): string[] {
  const re = /^```html[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gim;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const code = (m[1] ?? "").replace(/\r?\n$/, "");
    if (code.trim() !== "") blocks.push(code);
  }
  return blocks;
}
```

(`^` под флагом `m` требует, чтобы открывающий и закрывающий fence стояли в начале строки; захваченная группа включает завершающий `\n` перед закрывающим fence — срезаем его `replace`.)

- [ ] **Step 4: Убедиться, что тесты зелёные**

Run: `npx vitest run src/lib/html-blocks.test.ts`
Expected: PASS, 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/html-blocks.ts src/lib/html-blocks.test.ts
git commit -m "feat(lib): extractHtmlBlocks — извлечение \`\`\`html-блоков из markdown"
```

---

### Task 2: Поле `auto_preview_html` в контракте Settings (Rust + TS + UI)

**Files:**
- Modify: `src-tauri/src/settings.rs` (struct, Default, тесты)
- Modify: `src/ipc/types.ts` (interface + DEFAULT_SETTINGS)
- Modify: `src/components/SettingsDialog.tsx` (Switch)

- [ ] **Step 1: Расширить Rust-тесты (падающие)**

В `src-tauri/src/settings.rs`, в тесте `defaults_match_spec` добавить строку:

```rust
        assert!(s.auto_preview_html);
```

В тесте `save_load_roundtrip_with_600_perms` после `s.auto_send = true;` добавить:

```rust
        s.auto_preview_html = false;
```

и после `assert!(loaded.auto_send);`:

```rust
        assert!(!loaded.auto_preview_html);
```

Новый тест (рядом с `load_missing_file_gives_defaults`):

```rust
    #[test]
    fn load_missing_auto_preview_html_defaults_true() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert!(s.auto_preview_html); // старый settings.json без поля → true
    }
```

- [ ] **Step 2: Убедиться, что cargo-тесты падают (ошибка компиляции — поля нет)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib settings`
Expected: FAIL — `no field 'auto_preview_html' on type ...`.

- [ ] **Step 3: Добавить поле в struct и Default**

В `Settings` после `pub move_step: u32,`:

```rust
    pub auto_preview_html: bool,
```

В `impl Default` после `move_step: 20,`:

```rust
            auto_preview_html: true,
```

(Контейнерный `#[serde(default)]` уже на struct — старые json без поля получат `true` из Default.)

- [ ] **Step 4: Прогнать cargo-тесты**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib settings`
Expected: PASS (все тесты модуля, включая новый).

- [ ] **Step 5: Зеркало в TS**

`src/ipc/types.ts` — в `interface Settings` после `move_step: number;`:

```ts
  auto_preview_html: boolean;
```

В `DEFAULT_SETTINGS` после `move_step: 20,`:

```ts
  auto_preview_html: true,
```

- [ ] **Step 6: Switch в SettingsDialog**

`src/components/SettingsDialog.tsx` — после существующего `<label>` с `draft.auto_send` (строки 125–133) вставить:

```tsx
          <label className="flex items-center gap-2.5 text-[12.5px]">
            <Switch
              checked={draft.auto_preview_html}
              onCheckedChange={(v) => {
                set("auto_preview_html", v);
              }}
            />
            Автопревью HTML из ответа
          </label>
```

- [ ] **Step 7: Проверки**

Run: `npm run typecheck && npx vitest run && cargo clippy --manifest-path src-tauri/Cargo.toml --lib`
Expected: всё зелёное, clippy без warnings.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/settings.rs src/ipc/types.ts src/components/SettingsDialog.tsx
git commit -m "feat: поле auto_preview_html в Settings (9-е поле контракта)"
```

---

### Task 3: `preview.rs` — геометрия окна превью (Rust, чистая функция)

**Files:**
- Create: `src-tauri/src/preview.rs`
- Modify: `src-tauri/src/lib.rs:1-8` (объявление модуля)

- [ ] **Step 1: Создать модуль с падающими тестами**

```rust
// src-tauri/src/preview.rs
//! Геометрия окна HTML-превью. Чистая математика, всё в физических пикселях
//! (вызывающий код переводит логические размеры через scale_factor монитора).

/// Прямоугольник окна превью над HUD: x/ширина наследуются от main-окна,
/// y = верх HUD − зазор − высота, с клампом по верхней границе монитора
/// (если места над HUD мало, превью прижимается к верху и может перекрыть HUD).
/// Спека упоминала monitor_size — для клампа по верху он не нужен (YAGNI).
pub fn preview_rect(
    main_pos: (i32, i32),
    main_size: (u32, u32),
    monitor_pos: (i32, i32),
    preview_h: u32,
    gap: u32,
) -> (i32, i32, u32, u32) {
    let x = main_pos.0;
    let w = main_size.0;
    let y = (main_pos.1 - gap as i32 - preview_h as i32).max(monitor_pos.1);
    (x, y, w, preview_h)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sits_above_hud_with_gap() {
        let (x, y, w, h) = preview_rect((100, 800), (760, 290), (0, 0), 480, 12);
        assert_eq!((x, w, h), (100, 760, 480));
        assert_eq!(y, 800 - 12 - 480);
    }

    #[test]
    fn clamps_to_monitor_top_when_no_room() {
        let (_, y, _, _) = preview_rect((100, 200), (760, 290), (0, 0), 480, 12);
        assert_eq!(y, 0);
    }

    #[test]
    fn clamp_respects_negative_monitor_origin() {
        // монитор выше/левее основного: origin отрицательный
        let (_, y, _, _) = preview_rect((-1000, -300), (760, 290), (-1920, -500), 480, 12);
        assert_eq!(y, -500); // -300-12-480 = -792 < -500 → кламп
    }
}
```

В `src-tauri/src/lib.rs` к списку модулей (после `pub mod llm;`):

```rust
pub mod preview;
```

- [ ] **Step 2: Прогнать тесты**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib preview`
Expected: PASS, 3 passed. (Функция и тесты пишутся одним файлом — «падающую» фазу заменяет ревью кейсов: три теста покрывают обычное размещение, кламп и отрицательный origin.)

- [ ] **Step 3: Clippy + commit**

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml --lib`
Expected: без warnings.

```bash
git add src-tauri/src/preview.rs src-tauri/src/lib.rs
git commit -m "feat(rust): preview_rect — геометрия окна превью над HUD"
```

---

### Task 4: Rust-команды `show_html_preview` / `get_preview_html` + capability окна

**Files:**
- Modify: `src-tauri/src/lib.rs` (App state, две команды, generate_handler)
- Create: `src-tauri/capabilities/preview.json`

- [ ] **Step 1: State + константы**

В struct `App` (после `pub resize_gen: AtomicU64,`):

```rust
    pub preview_html: Mutex<String>,
```

В `app.manage(App { ... })` (после `resize_gen: AtomicU64::new(0),`):

```rust
                preview_html: Mutex::new(String::new()),
```

Рядом с командами (перед `show_html_preview`):

```rust
/// Логические размеры окна превью; в физические переводятся через scale_factor.
const PREVIEW_LOGICAL_HEIGHT: f64 = 480.0;
const PREVIEW_GAP: f64 = 12.0;
```

- [ ] **Step 2: Команды**

Добавить в `lib.rs` (рядом с `move_window_by`):

```rust
/// Показывает HTML в синглтон-окне превью (label "preview"): создаёт окно над HUD
/// или заменяет содержимое уже открытого событием preview-html. focus=true — клик
/// по чипу (окно фокусируется), false — автооткрытие (фокус остаётся у HUD).
#[tauri::command]
fn show_html_preview(app: AppHandle, html: String, focus: bool) -> Result<(), String> {
    if html.trim().is_empty() {
        return Ok(());
    }
    *app.state::<App>().preview_html.lock().unwrap() = html.clone();

    if let Some(w) = app.get_webview_window("preview") {
        app.emit_to("preview", "preview-html", html)
            .map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
        if focus {
            let _ = w.set_focus();
        }
        return Ok(());
    }

    let main = app.get_webview_window("main").ok_or("нет окна main")?;
    let scale = main.scale_factor().unwrap_or(2.0);
    let pos = main.outer_position().map_err(|e| e.to_string())?;
    let size = main.outer_size().map_err(|e| e.to_string())?;
    let monitor_pos = main
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| (m.position().x, m.position().y))
        .unwrap_or((0, 0));
    let (x, y, w, h) = preview::preview_rect(
        (pos.x, pos.y),
        (size.width, size.height),
        monitor_pos,
        (PREVIEW_LOGICAL_HEIGHT * scale) as u32,
        (PREVIEW_GAP * scale) as u32,
    );

    // Создаём скрытым, позиционируем физическими px, затем показываем — без скачка.
    let win = tauri::WebviewWindowBuilder::new(
        &app,
        "preview",
        tauri::WebviewUrl::App("index.html?window=preview".into()),
    )
    .title("Превью")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .content_protected(true)
    .resizable(true)
    .min_inner_size(360.0, 240.0)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;
    win.set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    win.set_size(tauri::PhysicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    if focus {
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn get_preview_html(app: AppHandle) -> String {
    app.state::<App>().preview_html.lock().unwrap().clone()
}
```

В `generate_handler![...]` после `capture_available,`:

```rust
            show_html_preview,
            get_preview_html,
```

- [ ] **Step 3: Capability окна preview**

```json
// src-tauri/capabilities/preview.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "preview",
  "description": "Минимальные права окна HTML-превью",
  "windows": ["preview"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-start-dragging"
  ]
}
```

(`allow-close` — для ✕/Esc из JS, `allow-start-dragging` — drag фреймлесс-окна за шапку.)

- [ ] **Step 4: Проверки**

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml --lib && cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: clippy чистый, тесты зелёные.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/capabilities/preview.json
git commit -m "feat(rust): команды show_html_preview/get_preview_html + capability окна preview"
```

---

### Task 5: Окно превью на фронте — ipc, `usePreviewHtml`, `PreviewApp`, роутинг

**Files:**
- Modify: `src/ipc/types.ts` (EventMap)
- Modify: `src/ipc/commands.ts` (getPreviewHtml, closePreviewWindow)
- Create: `src/hooks/usePreviewHtml.ts`
- Test: `src/hooks/usePreviewHtml.test.ts`
- Create: `src/PreviewApp.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Событие в EventMap**

`src/ipc/types.ts`, в `interface EventMap` после `"llm-error": ...;`:

```ts
  /** Замена содержимого уже открытого окна превью (эмитится только окну preview). */
  "preview-html": string;
```

- [ ] **Step 2: ipc-команды**

В конец `src/ipc/commands.ts`:

```ts
/** Демо-контент превью для браузера (вне Tauri) — визуальная итерация по ?window=preview. */
const DEMO_PREVIEW_HTML = `<!doctype html>
<html><body style="font-family: system-ui; padding: 24px">
<h2>Демо превью</h2>
<p>В Tauri здесь рендерится HTML из ответа Claude.</p>
<button onclick="this.textContent='живой JS!'">Нажми меня</button>
</body></html>`;

/** Текущий HTML окна превью (пустая строка, если ещё ничего не показывали). */
export async function getPreviewHtml(): Promise<string> {
  if (!isTauri()) return DEMO_PREVIEW_HTML;
  return invoke<string>("get_preview_html");
}

/** Закрывает текущее окно — для ✕/Esc внутри окна превью. */
export async function closePreviewWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}
```

(Динамический import оставляет `@tauri-apps/api/window` вне бандла браузерного пути; ipc — единственный слой с импортами `@tauri-apps`.)

- [ ] **Step 3: Падающий тест хука**

```ts
// src/hooks/usePreviewHtml.test.ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPreviewHtml = vi.fn(() => Promise.resolve("<p>старт</p>"));
let previewHandler: ((html: string) => void) | null = null;
const offPreview = vi.fn();

vi.mock("@/ipc/commands", () => ({
  getPreviewHtml: () => getPreviewHtml(),
}));
vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: (p: string) => void) => {
    if (name === "preview-html") previewHandler = handler;
    return offPreview;
  },
}));

import { usePreviewHtml } from "./usePreviewHtml";

beforeEach(() => {
  getPreviewHtml.mockClear();
  offPreview.mockClear();
  previewHandler = null;
});

describe("usePreviewHtml", () => {
  it("на маунте забирает текущий HTML", async () => {
    const { result } = renderHook(() => usePreviewHtml());
    await waitFor(() => {
      expect(result.current).toBe("<p>старт</p>");
    });
  });

  it("обновляется по событию preview-html", async () => {
    const { result } = renderHook(() => usePreviewHtml());
    await waitFor(() => {
      expect(result.current).toBe("<p>старт</p>");
    });
    act(() => {
      previewHandler?.("<p>замена</p>");
    });
    expect(result.current).toBe("<p>замена</p>");
  });

  it("отписывается на unmount", () => {
    const { unmount } = renderHook(() => usePreviewHtml());
    unmount();
    expect(offPreview).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Убедиться, что тест падает**

Run: `npx vitest run src/hooks/usePreviewHtml.test.ts`
Expected: FAIL — `Cannot find module './usePreviewHtml'`.

- [ ] **Step 5: Хук**

```ts
// src/hooks/usePreviewHtml.ts
import { useEffect, useState } from "react";
import { getPreviewHtml } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";

/** HTML текущего превью: начальная загрузка + живые замены по preview-html. */
export function usePreviewHtml(): string {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let live = true;
    void getPreviewHtml().then((h) => {
      if (live) setHtml(h);
    });
    const off = onEvent("preview-html", setHtml);
    return () => {
      live = false;
      off();
    };
  }, []);

  return html;
}
```

- [ ] **Step 6: Прогнать тесты хука**

Run: `npx vitest run src/hooks/usePreviewHtml.test.ts`
Expected: PASS, 3 passed.

- [ ] **Step 7: PreviewApp**

```tsx
// src/PreviewApp.tsx
import { X } from "lucide-react";
import { useEffect } from "react";
import { usePreviewHtml } from "@/hooks/usePreviewHtml";
import { closePreviewWindow } from "@/ipc/commands";

/** Окно HTML-превью (label "preview"): шапка с drag-зоной + sandbox-iframe.
 *  JS внутри HTML выполняется, но без allow-same-origin iframe изолирован
 *  от приложения и его IPC. */
export default function PreviewApp() {
  const html = usePreviewHtml();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closePreviewWindow();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="app-shell flex h-screen flex-col gap-2 overflow-hidden rounded-[22px] p-3">
      <header data-tauri-drag-region className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] tracking-wider text-primary uppercase">
          Превью
        </span>
        <span
          className="h-px flex-1 bg-gradient-to-r from-primary/40 via-border to-transparent"
          aria-hidden
        />
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(html)}
          className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Копировать код
        </button>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => void closePreviewWindow()}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </header>
      {html === "" ? (
        <div className="grid flex-1 place-items-center">
          <span className="text-[13px] text-muted-foreground">Нет содержимого</span>
        </div>
      ) : (
        <iframe
          sandbox="allow-scripts"
          srcDoc={html}
          title="HTML превью"
          className="min-h-0 flex-1 rounded-[12px] border-0 bg-white"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Роутинг в main.tsx**

Заменить содержимое `src/main.tsx` на:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import PreviewApp from "./PreviewApp";
import "./index.css";

// Окно превью грузит тот же бандл с ?window=preview (так его создаёт Rust).
const isPreview = new URLSearchParams(window.location.search).get("window") === "preview";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Корневой элемент #root не найден");
createRoot(rootElement).render(<StrictMode>{isPreview ? <PreviewApp /> : <App />}</StrictMode>);
```

- [ ] **Step 9: Проверки + визуальная проверка в браузере**

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное.

Run: `npm run dev` → открыть `http://localhost:1420/?window=preview`
Expected: тёмное окно «Превью» с белым iframe, кнопка «Нажми меня» меняет текст (живой JS в sandbox). Остановить dev-сервер.

- [ ] **Step 10: Commit**

```bash
git add src/ipc/types.ts src/ipc/commands.ts src/hooks/usePreviewHtml.ts src/hooks/usePreviewHtml.test.ts src/PreviewApp.tsx src/main.tsx
git commit -m "feat: окно превью — PreviewApp, usePreviewHtml, роутинг ?window=preview"
```

---

### Task 6: Чип html-блока в ленте + открытие превью по клику

**Files:**
- Modify: `src/ipc/commands.ts` (showHtmlPreview)
- Create: `src/components/HtmlBlockChip.tsx`
- Modify: `src/components/AnswerPanel.tsx` (override `pre`, проп `onOpenPreview`)
- Modify: `src/App.tsx` (колбэк открытия с ошибкой в строку ошибок)

- [ ] **Step 1: ipc-команда**

В конец `src/ipc/commands.ts`:

```ts
/** Показывает HTML в окне превью (создаёт или переиспользует). focus — отдать ли окну фокус. */
export async function showHtmlPreview(html: string, focus: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("show_html_preview", { html, focus });
}
```

- [ ] **Step 2: Чип**

```tsx
// src/components/HtmlBlockChip.tsx
import { ExternalLink } from "lucide-react";

export interface HtmlBlockChipProps {
  code: string;
  onOpen: () => void;
}

/** Компактный чип вместо простыни ```html-кода: открывает окно превью. */
export function HtmlBlockChip({ code, onOpen }: HtmlBlockChipProps) {
  const lines = code.replace(/\n$/, "").split("\n").length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="my-1.5 flex items-center gap-2 rounded-lg border border-border bg-black/30 px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="text-primary">html</span>
      <span>{lines} строк</span>
      <span className="flex items-center gap-1 text-primary">
        Открыть превью <ExternalLink className="size-3" />
      </span>
    </button>
  );
}
```

- [ ] **Step 3: Override `pre` в AnswerPanel**

В `src/components/AnswerPanel.tsx`:

Импорты: добавить `isValidElement`, `useMemo` к импорту из `react`, `Components` из react-markdown и чип:

```tsx
import { isValidElement, useMemo } from "react";
import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import { HtmlBlockChip } from "@/components/HtmlBlockChip";
```

В `AnswerPanelProps` добавить:

```tsx
  /** Открыть HTML-блок в окне превью (ошибки обрабатывает владелец). */
  onOpenPreview: (code: string) => void;
```

Фабрика рендера `pre` (после `markdownComponents`):

```tsx
/** ```html-блок → чип превью; остальные языки — обычный <pre>. */
function makePre(onOpenPreview: (code: string) => void) {
  return function PreBlock({ children }: { children?: ReactNode }) {
    const code = isValidElement<{ className?: string; children?: ReactNode }>(children)
      ? children
      : null;
    const text = code?.props.children;
    if (code && /\blanguage-html\b/i.test(code.props.className ?? "") && typeof text === "string") {
      return (
        <HtmlBlockChip
          code={text}
          onOpen={() => {
            onOpenPreview(text);
          }}
        />
      );
    }
    return <pre>{children}</pre>;
  };
}
```

`Assistant` принимает components:

```tsx
function Assistant({ text, components }: { text: string; components: Components }) {
  return (
    <div className="prose-answer text-[13.5px] leading-relaxed text-foreground/90">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}
```

В `AnswerPanel` — принять проп, собрать components и передать в оба вызова `Assistant`:

```tsx
export function AnswerPanel({
  messages,
  partial,
  streaming,
  expanded,
  onToggle,
  onCopy,
  onOpenPreview,
}: AnswerPanelProps) {
  const components = useMemo<Components>(
    () => ({ ...markdownComponents, pre: makePre(onOpenPreview) }),
    [onOpenPreview],
  );
```

…и ниже `<Assistant key={i} text={m.text} components={components} />` и `<Assistant text={partial} components={components} />`.

- [ ] **Step 4: Колбэк в App**

В `src/App.tsx`:

Импорт: добавить `showHtmlPreview` в список из `@/ipc/commands`.

Колбэк (рядом с `onRetry`):

```tsx
  const openPreview = useCallback((code: string) => {
    showHtmlPreview(code, true).catch((e: unknown) => {
      setSttError(`Превью: ${String(e)}`);
    });
  }, []);
```

Пропс в JSX `<AnswerPanel ...>`:

```tsx
        onOpenPreview={openPreview}
```

- [ ] **Step 5: Проверки + визуальная проверка**

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное.

Run: `npm run dev` → в браузере вставить в композер любой текст; в демо-режиме ответа нет — проверка чипа будет в ручной приёмке Task 8 (в браузере достаточно, что сборка живая и ничего не упало).

- [ ] **Step 6: Commit**

```bash
git add src/ipc/commands.ts src/components/HtmlBlockChip.tsx src/components/AnswerPanel.tsx src/App.tsx
git commit -m "feat(ui): чип \`\`\`html-блока в ленте + открытие окна превью"
```

---

### Task 7: Автооткрытие превью по завершении ответа активного чата

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Обернуть колбэк завершения стрима**

Сейчас в `App.tsx`: хуки объявлены в порядке `useSettings → useRecorder → useChats → useClaudeStream(chats.appendAssistantMessage)`, а ref'ы (`settingsRef`, `chatsRef`, `streamRef`) — ниже. Обёртке нужны ref'ы и `setSttError` ДО `useClaudeStream`, поэтому переупорядочить верх компонента так (полная замена фрагмента от `const { settings, ... }` до `const error = ...` включительно):

```tsx
  const { settings, save, bumpOpacity } = useSettings();
  const state = useRecorder();
  const chats = useChats();

  const [sttError, setSttError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [permissionOk, setPermissionOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);

  // Свежие значения для стабильных колбэков (PTT/транскрипция/подписки).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  // llm-done: дописать ответ в историю; если включено автопревью, чат активен
  // и в ответе есть ```html — показать последний блок (без кражи фокуса у HUD).
  const onAssistantDone = useCallback((chatId: string, text: string) => {
    chatsRef.current.appendAssistantMessage(chatId, text);
    if (!settingsRef.current.auto_preview_html) return;
    if (chatId !== chatsRef.current.activeId) return;
    const blocks = extractHtmlBlocks(text);
    const last = blocks[blocks.length - 1];
    if (last !== undefined) {
      showHtmlPreview(last, false).catch((e: unknown) => {
        setSttError(`Превью: ${String(e)}`);
      });
    }
  }, []);

  const stream = useClaudeStream(onAssistantDone);
  const streamRef = useRef(stream);
  streamRef.current = stream;

  const active = chats.active;
  const activeId = chats.activeId;
  const activeStreaming = !!stream.streaming[activeId];

  const error = sttError ?? stream.error[activeId] ?? null;
```

Импорт: добавить `import { extractHtmlBlocks } from "@/lib/html-blocks";`.

(Старые строки `const stream = useClaudeStream(chats.appendAssistantMessage);`, прежний блок ref'ов и прежние объявления `active/activeId/activeStreaming` удалить — они входят в заменённый фрагмент.)

- [ ] **Step 2: Проверки**

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: автооткрытие превью после ответа активного чата (гейт auto_preview_html)"
```

---

### Task 8: CLAUDE.md + ручная приёмка + финальные проверки

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Обновить CLAUDE.md**

В разделе «The Rust ⇄ frontend contract»: заменить `Settings` (8 fields) на (9 fields); в перечень событий добавить `preview-html` (адресное, только окну `preview`).

В разделе «Window chrome» добавить предложение:

```
Второе окно `preview` (HTML-превью ответов) создаётся на лету командой `show_html_preview`, грузит тот же бандл с `?window=preview` (роутинг в `main.tsx`) и имеет свой минимальный набор прав в `src-tauri/capabilities/preview.json`; контент рендерится в `<iframe sandbox="allow-scripts">` без `allow-same-origin`.
```

- [ ] **Step 2: Полный прогон проверок**

Run:
```bash
npm run lint && npm run format:check && npm run typecheck && npm run knip && npx vitest run
cargo test --manifest-path src-tauri/Cargo.toml --lib && cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```
Expected: всё зелёное.

- [ ] **Step 3: Ручная приёмка в Tauri**

Run: `npm run tauri dev`, затем по чек-листу:
1. Спросить Claude «сделай простую HTML-страницу с кнопкой и анимацией» → в ленте вместо кода появляется чип `html · N строк · Открыть превью ↗`.
2. По завершении ответа окно превью открывается само над HUD; фокус (мигающий курсор композера) остаётся у HUD.
3. В превью кнопка кликается, анимация идёт (живой JS); «Копировать код» кладёт HTML в буфер; drag за шапку и resize работают; Esc и ✕ закрывают.
4. Клик по чипу снова открывает окно (с фокусом); второй ответ с html заменяет содержимое уже открытого окна.
5. В настройках выключить «Автопревью HTML из ответа» → новое окно само не открывается, чип работает; настройка переживает перезапуск.
6. HUD у верхнего края экрана → превью не уезжает за край (кламп).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — окно preview, событие preview-html, 9 полей Settings"
```
