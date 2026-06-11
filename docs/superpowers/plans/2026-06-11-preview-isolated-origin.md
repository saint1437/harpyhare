# Превью на отдельном origin (кастомный протокол) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HTML-превью грузится с отдельного origin `preview://localhost` (iframe через `src` + `sandbox="allow-scripts allow-same-origin"`), чтобы `localStorage`/сеть работали, оставаясь изолированными от приложения и ключей (спека: `docs/superpowers/specs/2026-06-11-preview-isolated-origin-design.md`).

**Architecture:** Rust регистрирует кастомную URI-схему `preview`, отдающую текущий HTML из `App.preview_html: Mutex<String>` (заполняется командой `set_preview_html`). `PreviewPanel` переключается с `srcDoc` на `src=preview://localhost/?v=<nonce>`. Превью получает tuple-origin → `localStorage` не бросает; cross-origin к `tauri://localhost` + отсутствие capability на `preview://` → нет доступа к IPC/ключам.

**Tech Stack:** Tauri 2.11.2 (`register_uri_scheme_protocol`, `tauri::http`), React 19, vitest, cargo test.

**Ключевое свойство (зачем всё это):** текущий баг — `sandbox="allow-scripts"` без `allow-same-origin` даёт **опаковый** origin, и `localStorage` **бросает** `SecurityError` → скрипт падает. Кастомная схема даёт **tuple-origin** `preview://localhost` → `localStorage` — валидный объект, не бросает. Это и чинит «игра не запускается». Персистентность хранилища между перезапусками — бонус, не критерий.

**Порядок коммитов:** Task 1 (Rust: команда+протокол) — фронт пока на `srcDoc`, ничего не зовёт новую команду (registered-but-unused в Rust — ок). Task 2 (фронт переключается на `src` и зовёт команду). Так каждый коммит зелёный. Rust-проверки гонять руками (`export PATH="$HOME/.cargo/bin:$PATH"`).

---

### Task 1: Rust — протокол `preview://` + команда `set_preview_html` + state

**Files:**
- Create: `src-tauri/src/preview_protocol.rs`
- Modify: `src-tauri/src/lib.rs` (module decl, `App` field + init, команда, регистрация протокола, generate_handler)

- [ ] **Step 1: Чистый помощник ответа + тест (TDD)**

```rust
// src-tauri/src/preview_protocol.rs
//! Ответ кастомной схемы preview:// — текущий HTML превью как text/html.

/// HTTP-ответ для запроса к preview://: тело — переданный HTML, тип — text/html.
pub fn preview_response(html: &str) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .header(
            tauri::http::header::CONTENT_TYPE,
            "text/html; charset=utf-8",
        )
        .body(html.as_bytes().to_vec())
        .expect("валидный http::Response")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn body_is_html_bytes() {
        let r = preview_response("<p>привет</p>");
        assert_eq!(r.body().as_slice(), "<p>привет</p>".as_bytes());
    }

    #[test]
    fn content_type_is_text_html() {
        let r = preview_response("<p>x</p>");
        assert_eq!(
            r.headers().get(tauri::http::header::CONTENT_TYPE).unwrap(),
            "text/html; charset=utf-8"
        );
    }

    #[test]
    fn empty_html_gives_empty_body() {
        let r = preview_response("");
        assert!(r.body().is_empty());
    }
}
```

В `src-tauri/src/lib.rs` добавить объявление модуля. Найти строку:

```rust
pub mod llm;
```

и добавить **после** неё (алфавитный порядок: `preview_protocol` идёт после `llm`, перед `settings`):

```rust
pub mod preview_protocol;
```

- [ ] **Step 2: Прогнать тесты помощника**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test --manifest-path src-tauri/Cargo.toml --lib preview_protocol`
Expected: PASS, 3 passed.

- [ ] **Step 3: Добавить state `preview_html` в `App`**

В объявлении struct `App` (после `pub resize_gen: AtomicU64,`) добавить:

```rust
    pub preview_html: Mutex<String>,
```

В `app.manage(App { ... })` (после `resize_gen: AtomicU64::new(0),`) добавить:

```rust
                preview_html: Mutex::new(String::new()),
```

- [ ] **Step 4: Команда `set_preview_html`**

Добавить в `lib.rs` рядом с `move_window_by` (любое место среди команд):

```rust
/// Сохраняет HTML, который отдаст кастомная схема preview:// при следующем запросе.
#[tauri::command]
fn set_preview_html(app: AppHandle, html: String) {
    *app.state::<App>().preview_html.lock().unwrap() = html;
}
```

В `generate_handler![...]` (после `capture_available,`) добавить:

```rust
            set_preview_html,
```

- [ ] **Step 5: Зарегистрировать протокол на билдере**

В `lib.rs`, в `tauri::Builder::default()`-цепочке, **перед** `.setup(...)` добавить регистрацию схемы:

```rust
        .register_uri_scheme_protocol("preview", |ctx, _request| {
            let html = ctx
                .app_handle()
                .state::<App>()
                .preview_html
                .lock()
                .unwrap()
                .clone();
            preview_protocol::preview_response(&html)
        })
```

ПРИМЕЧАНИЕ по версии API: в Tauri 2.11 синхронный хендлер получает контекст с методом `app_handle()` (как выше). Если компилятор скажет, что первый аргумент — это `&AppHandle` напрямую (более старая сигнатура), замени `ctx.app_handle()` на `ctx` (т.е. `let html = ctx.state::<App>()...`). Первый `cargo build` подтвердит форму за секунды; на функциональность это не влияет.

- [ ] **Step 6: Проверки**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo clippy --manifest-path src-tauri/Cargo.toml --lib && cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: компиляция без ошибок; clippy без warnings; тесты зелёные (включая 3 новых `preview_protocol`). `set_preview_html` пока не зовётся фронтом — это ок (команда зарегистрирована).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/preview_protocol.rs src-tauri/src/lib.rs
git commit -m "feat(rust): кастомная схема preview:// + команда set_preview_html"
```

---

### Task 2: Frontend — `PreviewPanel` на `src=preview://` + ipc `setPreviewHtml`

**Files:**
- Modify: `src/ipc/commands.ts` (добавить `setPreviewHtml`)
- Modify: `src/components/PreviewPanel.tsx` (srcDoc → src + нонс, фолбэк в браузере)
- Test: `src/components/PreviewPanel.test.tsx` (новый)

- [ ] **Step 1: ipc-обёртка**

В конец `src/ipc/commands.ts`:

```ts
/** Кладёт HTML в бэкенд; следующий запрос к схеме preview:// отдаст его. No-op вне Tauri. */
export async function setPreviewHtml(html: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_preview_html", { html });
}
```

- [ ] **Step 2: Падающий тест `PreviewPanel`**

```tsx
// src/components/PreviewPanel.test.tsx
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setPreviewHtml = vi.fn(() => Promise.resolve());
vi.mock("@/ipc/commands", () => ({
  setPreviewHtml: (h: string) => setPreviewHtml(h),
}));
vi.mock("@/ipc/env", () => ({ isTauri: () => true }));

import { PreviewPanel } from "./PreviewPanel";

beforeEach(() => {
  setPreviewHtml.mockClear();
});

describe("PreviewPanel", () => {
  it("шлёт html в set_preview_html и грузит iframe с preview://-src", async () => {
    const { container } = render(<PreviewPanel html="<p>hi</p>" onClose={() => undefined} />);
    await waitFor(() => {
      expect(setPreviewHtml).toHaveBeenCalledWith("<p>hi</p>");
    });
    await waitFor(() => {
      const src = container.querySelector("iframe")?.getAttribute("src");
      expect(src).toMatch(/^preview:\/\/localhost\/\?v=\d+$/);
    });
  });

  it("пустой html — заглушка, без iframe", () => {
    const { container, getByText } = render(<PreviewPanel html="" onClose={() => undefined} />);
    expect(container.querySelector("iframe")).toBeNull();
    getByText("Нет содержимого");
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `npx vitest run src/components/PreviewPanel.test.tsx`
Expected: FAIL (iframe всё ещё `srcDoc`, нет `src=preview://`; `setPreviewHtml` не вызывается).

- [ ] **Step 4: Переписать `PreviewPanel`**

Полностью заменить содержимое `src/components/PreviewPanel.tsx` на:

```tsx
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setPreviewHtml } from "@/ipc/commands";
import { isTauri } from "@/ipc/env";

export interface PreviewPanelProps {
  html: string;
  onClose: () => void;
}

/** Встроенная панель HTML-превью (правая колонка окна). В Tauri контент грузится
 *  с origin preview://localhost (кастомная схема) — localStorage/сеть работают,
 *  но cross-origin к приложению и отсутствие capability изолируют превью от IPC и
 *  ключей. В браузерном моке (вне Tauri) — фолбэк на srcDoc для демо. */
export function PreviewPanel({ html, onClose }: PreviewPanelProps) {
  const [src, setSrc] = useState("");
  const nonce = useRef(0);

  useEffect(() => {
    if (html === "" || !isTauri()) {
      setSrc("");
      return;
    }
    nonce.current += 1;
    const v = nonce.current;
    // Нонс заставляет WKWebView перезагрузить iframe даже при том же HTML.
    void setPreviewHtml(html).then(() => {
      setSrc(`preview://localhost/?v=${v}`);
    });
  }, [html]);

  return (
    <aside className="flex w-[570px] flex-col gap-2">
      <header className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] tracking-wider text-primary uppercase">Превью</span>
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
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </header>
      {html === "" ? (
        <div className="grid flex-1 place-items-center">
          <span className="text-[13px] text-muted-foreground">Нет содержимого</span>
        </div>
      ) : isTauri() ? (
        <iframe
          sandbox="allow-scripts allow-same-origin"
          src={src}
          title="HTML превью"
          className="min-h-0 flex-1 rounded-[12px] border-0 bg-white"
        />
      ) : (
        <iframe
          sandbox="allow-scripts"
          srcDoc={html}
          title="HTML превью"
          className="min-h-0 flex-1 rounded-[12px] border-0 bg-white"
        />
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Прогнать тест и общие проверки**

Run: `npx vitest run src/components/PreviewPanel.test.tsx`
Expected: PASS, 2 passed.

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное.

- [ ] **Step 6: Браузерный смоук (фолбэк srcDoc)**

Run: `(npm run dev &) ; sleep 4; curl -s "http://localhost:1420/" | head -3; pkill -f vite`
Expected: vite отдаёт страницу. Не оставляй dev-сервер запущенным.

- [ ] **Step 7: Commit**

```bash
git add src/ipc/commands.ts src/components/PreviewPanel.tsx src/components/PreviewPanel.test.tsx
git commit -m "feat: превью грузится с origin preview:// (src+нонс), srcDoc-фолбэк в браузере"
```

---

### Task 3: CLAUDE.md + проверки + ручная приёмка (go/no-go)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Обновить CLAUDE.md**

В инварианте «Window chrome:» найти предложение про `PreviewPanel`:

```
HTML-превью ответов рендерится встроенной панелью `PreviewPanel` (правая колонка того же окна) в `<iframe sandbox="allow-scripts">` без `allow-same-origin`; открытие расширяет окно вправо командой `set_window_width` (тот же твин, что был у высоты, + кламп `x` по краю монитора через `window_geom`).
```

заменить на:

```
HTML-превью ответов рендерится встроенной панелью `PreviewPanel` (правая колонка того же окна). Контент грузится с отдельного origin `preview://localhost` (кастомная схема `register_uri_scheme_protocol("preview", …)` в `lib.rs`, отдаёт `App.preview_html`, заполняемый командой `set_preview_html`) в `<iframe src sandbox="allow-scripts allow-same-origin">` — `localStorage`/сеть работают, но cross-origin к `tauri://localhost` + отсутствие capability на `preview://` изолируют превью от IPC и ключей. Вне Tauri панель использует `srcDoc`-фолбэк. Открытие расширяет окно вправо командой `set_window_width` (кламп `x` по краю монитора через `window_geom`).
```

- [ ] **Step 2: Полный прогон проверок**

Run:
```bash
npm run lint && npm run format:check && npm run typecheck && npm run knip && npx vitest run
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml --lib && cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```
Expected: всё зелёное. (Если `format:check` ругается на `CLAUDE.md` — `npx prettier --write CLAUDE.md`.)

- [ ] **Step 3: Ручная приёмка в Tauri (это и есть проверка ключевой гипотезы)**

Run: `npm run tauri dev`, затем по чек-листу:
1. **Главное:** попроси Claude «напиши змейку одним HTML-файлом с сохранением рекорда в localStorage» → открой превью → кнопка «Играть» запускает игру, стрелки управляют, рекорд показывается (не падает на `localStorage`). Это закрывает исходный баг.
2. **Изоляция:** в превью (через devtools на iframe или тестовый сниппет в сгенерированном HTML) `window.__TAURI_INTERNALS__` и `window.parent.__TAURI_INTERNALS__` недоступны/бросают; `invoke('get_settings')` невозможен.
3. CDN-превью (например страница с `https://cdn.tailwindcss.com`) грузится и стилизуется.
4. Обычное превью без localStorage (карточка из прошлых тестов) работает как раньше; чип/автооткрытие (`auto_preview_html`)/✕/расширение окна вправо — без регрессий.
5. Повторное открытие того же HTML перезагружает iframe (нонс), второй разный ответ заменяет содержимое.

Если п.1 не проходит (localStorage всё ещё недоступен на `preview://` в этой версии WKWebView) — НЕ мержить; вернуться к дизайну (зафиксировать как блокер, обсудить альтернативу). Ожидание: tuple-origin кастомной схемы даёт рабочий `localStorage`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — превью на origin preview://, set_preview_html"
```
