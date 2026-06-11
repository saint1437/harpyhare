# Встроенная панель превью + перекомпоновка HUD — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить отдельное окно HTML-превью встроенной панелью справа, поднять «Чат» наверх и убрать его сворачивание, увеличить высоту окна по умолчанию (спека: `docs/superpowers/specs/2026-06-11-inline-preview-panel-design.md`).

**Architecture:** Превью становится правой колонкой того же окна (React-state в `App`, компонент `PreviewPanel`, тот же `<iframe sandbox="allow-scripts">`). Окно расширяется вправо новой Rust-командой `set_window_width` (тот же твин-механизм, что был у `set_window_height`, + кламп `x` по краю монитора через чистую функцию `window_geom::clamp_window_x`). Отдельное окно превью и вся его инфраструктура удаляются.

**Tech Stack:** Tauri 2 (WebviewWindow tween, run_on_main_thread), React 19, vitest, cargo test.

**Порядок коммитов (важно):** pre-commit гоняет `knip` — «висячий» экспорт без потребителя валит коммит. Поэтому Rust-команда ширины добавляется ПЕРВОЙ (Task 1, старый `set_window_height` пока живёт), затем фронт целиком переключается на встроенную панель (Task 2, тут же удаляется весь фронтовый стек отдельного окна), затем чистится Rust (Task 3). Так каждый коммит зелёный по сборке и без рантайм-разрывов. Rust-проверки в хук не входят — гонять руками (`export PATH="$HOME/.cargo/bin:$PATH"`).

---

### Task 1: Rust — `window_geom::clamp_window_x` + команда `set_window_width`

**Files:**
- Create: `src-tauri/src/window_geom.rs`
- Modify: `src-tauri/src/lib.rs` (объявление модуля, новая команда, регистрация в `generate_handler!`)

- [ ] **Step 1: Создать чистый модуль с падающими тестами**

```rust
// src-tauri/src/window_geom.rs
//! Геометрия размеров главного окна. Чистая математика в физических пикселях.

/// Новый x главного окна, чтобы окно ширины `width` целиком влезло на монитор
/// `[monitor_x, monitor_x + monitor_width)`: при упоре в правый край — сдвиг влево,
/// но не левее левого края монитора.
pub fn clamp_window_x(x: i32, width: u32, monitor_x: i32, monitor_width: u32) -> i32 {
    let max_x = monitor_x + monitor_width as i32 - width as i32;
    x.min(max_x).max(monitor_x)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_x_when_window_fits() {
        assert_eq!(clamp_window_x(100, 760, 0, 1920), 100);
    }

    #[test]
    fn shifts_left_when_overflowing_right_edge() {
        // правый край 1600+760=2360 > 1920; max_x = 1920-760 = 1160
        assert_eq!(clamp_window_x(1600, 760, 0, 1920), 1160);
    }

    #[test]
    fn clamps_to_left_when_wider_than_monitor() {
        // width 2000 > 1920 → max_x = -80 < 0 → .max(0) = 0
        assert_eq!(clamp_window_x(50, 2000, 0, 1920), 0);
    }

    #[test]
    fn respects_negative_monitor_origin() {
        // монитор слева: origin -1920, width 1920 → правый край 0; max_x = 0-760 = -760
        assert_eq!(clamp_window_x(-100, 760, -1920, 1920), -760);
    }
}
```

В `src-tauri/src/lib.rs` добавить объявление модуля. Найти строку (последняя в блоке `pub mod …` в начале файла):

```rust
pub mod stt;
```

и добавить **после** неё (алфавитный порядок — `window_geom` идёт после `stt`):

```rust
pub mod window_geom;
```

- [ ] **Step 2: Прогнать тесты — убедиться, что компилируются и проходят**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test --manifest-path src-tauri/Cargo.toml --lib window_geom`
Expected: PASS, 4 passed. (Функция и тесты пишутся вместе; «падающую» фазу заменяет ревью 4 кейсов: влезает, упор справа, шире монитора, отрицательный origin.)

- [ ] **Step 3: Добавить команду `set_window_width`**

В `src-tauri/src/lib.rs` найти существующую команду `set_window_height` (целиком, от её doc-комментария `/// Плавно меняет высоту…` до закрывающей `}`). **Сразу после неё** (оставляя `set_window_height` на месте) вставить:

```rust
/// Плавно меняет ширину главного окна (логические px), сохраняя высоту. Растёт вправо
/// (якорь — левый край); если правый край выходит за монитор — окно сдвигается влево
/// (кламп через window_geom::clamp_window_x). Тот же ease-out-твин на фоновом потоке
/// с guard-генератором resize_gen, что и set_window_height.
#[tauri::command]
fn set_window_width(app: AppHandle, width: f64) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    let scale = w.scale_factor().unwrap_or(1.0);
    let from_w = w.outer_size().map(|s| s.width as f64 / scale).unwrap_or(width);
    let height = w.outer_size().map(|s| s.height as f64 / scale).unwrap_or(640.0);
    let from_pos = w.outer_position().unwrap_or(tauri::PhysicalPosition::new(0, 0));

    // Целевой x с клампом по правому краю текущего монитора (физ. px).
    let target_phys_w = (width * scale).round() as u32;
    let (mon_x, mon_w) = w
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| (m.position().x, m.size().width))
        .unwrap_or((from_pos.x, target_phys_w));
    let target_x = window_geom::clamp_window_x(from_pos.x, target_phys_w, mon_x, mon_w);

    if (from_w - width).abs() < 1.0 && from_pos.x == target_x {
        return;
    }
    let from_x = from_pos.x;
    let y = from_pos.y;

    let my_gen = app
        .state::<App>()
        .resize_gen
        .fetch_add(1, Ordering::SeqCst)
        + 1;

    std::thread::spawn(move || {
        const STEPS: u32 = 14;
        for i in 1..=STEPS {
            if app.state::<App>().resize_gen.load(Ordering::SeqCst) != my_gen {
                return;
            }
            let t = f64::from(i) / f64::from(STEPS);
            let eased = 1.0 - (1.0 - t).powi(3); // ease-out cubic
            let cur_w = from_w + (width - from_w) * eased;
            let cur_x = (f64::from(from_x) + f64::from(target_x - from_x) * eased).round() as i32;
            let win = w.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = win.set_position(tauri::PhysicalPosition::new(cur_x, y));
                let _ = win.set_size(tauri::LogicalSize::new(cur_w, height));
            });
            std::thread::sleep(std::time::Duration::from_millis(13));
        }
        if app.state::<App>().resize_gen.load(Ordering::SeqCst) == my_gen {
            let win = w.clone();
            let _ = app.run_on_main_thread(move || {
                let _ = win.set_position(tauri::PhysicalPosition::new(target_x, y));
                let _ = win.set_size(tauri::LogicalSize::new(width, height));
            });
        }
    });
}
```

- [ ] **Step 4: Зарегистрировать команду в `generate_handler!`**

В `src-tauri/src/lib.rs` найти:

```rust
            set_window_height,
```

и добавить **сразу после** неё:

```rust
            set_window_width,
```

- [ ] **Step 5: Проверки**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo clippy --manifest-path src-tauri/Cargo.toml --lib && cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: clippy без warnings; все тесты зелёные (включая 4 новых `window_geom`).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/window_geom.rs src-tauri/src/lib.rs
git commit -m "feat(rust): set_window_width + window_geom::clamp_window_x (рост окна вправо)"
```

---

### Task 2: Frontend — встроенная панель превью, перекомпоновка HUD, снос отдельного окна

**Files:**
- Create: `src/components/PreviewPanel.tsx`
- Modify: `src/components/AnswerPanel.tsx`, `src/App.tsx`, `src/ipc/commands.ts`, `src/ipc/types.ts`, `src/main.tsx`, `src-tauri/tauri.conf.json`
- Delete: `src/PreviewApp.tsx`, `src/hooks/usePreviewHtml.ts`, `src/hooks/usePreviewHtml.test.ts`

Один коммит (атомарно — иначе knip/tsc ловят висячие экспорты).

- [ ] **Step 1: Создать `PreviewPanel`**

```tsx
// src/components/PreviewPanel.tsx
import { X } from "lucide-react";

export interface PreviewPanelProps {
  html: string;
  onClose: () => void;
}

/** Встроенная панель HTML-превью (правая колонка окна). JS внутри HTML выполняется,
 *  но без allow-same-origin iframe изолирован от приложения и его IPC. */
export function PreviewPanel({ html, onClose }: PreviewPanelProps) {
  return (
    <aside className="flex w-[380px] flex-col gap-2">
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

- [ ] **Step 2: Переписать `AnswerPanel` — переименовать в «Чат», убрать сворачивание**

Полностью заменить содержимое `src/components/AnswerPanel.tsx` на:

```tsx
import { isValidElement, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { HtmlBlockChip } from "@/components/HtmlBlockChip";
import { openExternal } from "@/ipc/commands";
import type { ChatMessage } from "@/lib/chats";

export interface AnswerPanelProps {
  messages: ChatMessage[];
  /** Текущий in-flight ответ (если идёт стрим активного чата), иначе null. */
  partial: string | null;
  streaming: boolean;
  onCopy: () => void;
  /** Открыть HTML-блок во встроенной панели превью (ошибки обрабатывает владелец). */
  onOpenPreview: (code: string) => void;
}

const markdownComponents = {
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href && /^https?:\/\//.test(href)) void openExternal(href);
      }}
      className="text-primary underline underline-offset-2 hover:brightness-125"
    >
      {children}
    </a>
  ),
};

/** ```html-блок → чип превью; остальные языки — обычный <pre>.
 *  Семантика «что считается html-блоком» должна оставаться согласованной
 *  с lib/html-blocks.ts (автооткрытие): line-start ```html без инфо-строки.
 *  Точное сравнение токена класса — чтобы language-html-template и т.п. не матчились. */
function makePre(onOpenPreview: (code: string) => void) {
  return function PreBlock({ children }: { children?: ReactNode }) {
    const code = isValidElement<{ className?: string; children?: ReactNode }>(children)
      ? children
      : null;
    const text = code?.props.children;
    const isHtml = (code?.props.className ?? "")
      .split(/\s+/)
      .some((c) => c.toLowerCase() === "language-html");
    if (code && isHtml && typeof text === "string") {
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

function Assistant({ text, components }: { text: string; components: Components }) {
  return (
    <div className="prose-answer text-[13.5px] leading-relaxed text-foreground/90">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}

export function AnswerPanel({ messages, partial, streaming, onCopy, onOpenPreview }: AnswerPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, partial]);

  const components = useMemo<Components>(
    () => ({ ...markdownComponents, pre: makePre(onOpenPreview) }),
    [onOpenPreview],
  );

  const empty = messages.length === 0 && !partial;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const canCopy = !streaming && lastAssistant !== undefined;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[11px] tracking-wider text-primary uppercase">Чат</span>
        <span
          className="h-px flex-1 bg-gradient-to-r from-primary/40 via-border to-transparent"
          aria-hidden
        />
        {canCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Копировать
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1.5">
        {empty ? (
          <div className="grid h-full place-items-center">
            <span className="text-[13px] text-muted-foreground">Чат появится здесь</span>
          </div>
        ) : (
          <>
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="max-w-[85%] self-end rounded-lg bg-white/5 px-3 py-1.5 text-[13px] break-words whitespace-pre-wrap text-foreground/80"
                >
                  {m.text}
                </div>
              ) : (
                <Assistant key={i} text={m.text} components={components} />
              ),
            )}
            {partial !== null && partial !== "" && (
              <Assistant text={partial} components={components} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
```

(Убраны `ChevronRight`, `cn`, пропсы `expanded`/`onToggle`, кнопка-тоггл; заголовок статичный «Чат»; скролл-зона всегда видна.)

- [ ] **Step 3: ipc — заменить превью-окно/высоту на ширину**

В `src/ipc/commands.ts`:

(а) Заменить обёртку высоты на ширину. Найти и удалить:

```ts
/** Меняет высоту главного окна, сохраняя текущую ширину (для сворачивания ответа). */
export async function setWindowHeight(height: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_window_height", { height });
}
```

Вместо неё вставить:

```ts
/** Плавно меняет ширину главного окна (логические px), сохраняя высоту; растёт вправо. */
export async function setWindowWidth(width: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("set_window_width", { width });
}
```

(б) Удалить весь блок отдельного окна превью — `DEMO_PREVIEW_HTML`, `getPreviewHtml`, `showHtmlPreview`, `closePreviewWindow` (от комментария `/** Демо-контент превью…` до конца `closePreviewWindow`):

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

/** Показывает HTML в окне превью (создаёт или переиспользует). focus — отдать ли окну фокус. */
export async function showHtmlPreview(html: string, focus: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke("show_html_preview", { html, focus });
}

/** Закрывает текущее окно — для ✕/Esc внутри окна превью. */
export async function closePreviewWindow(): Promise<void> {
  if (!isTauri()) return;
  // Динамический импорт — чтобы api/window не попадал в браузерный путь бандла.
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
}
```

(удалить этот блок полностью.)

- [ ] **Step 4: ipc/types — убрать событие `preview-html`**

В `src/ipc/types.ts`, в `interface EventMap`, удалить строки:

```ts
  /** Замена содержимого уже открытого окна превью (эмитится только окну preview). */
  "preview-html": string;
```

- [ ] **Step 5: main.tsx — вернуть рендер только `App`**

Полностью заменить `src/main.tsx` на:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Корневой элемент #root не найден");
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Удалить файлы отдельного окна превью**

```bash
git rm src/PreviewApp.tsx src/hooks/usePreviewHtml.ts src/hooks/usePreviewHtml.test.ts
```

- [ ] **Step 7: Переписать `App.tsx` — раскладка строкой, встроенная панель, ширина**

Полностью заменить содержимое `src/App.tsx` на:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerPanel } from "@/components/AnswerPanel";
import { ChatTabs } from "@/components/ChatTabs";
import { Composer } from "@/components/Composer";
import { HotkeyHints } from "@/components/HotkeyHints";
import { PermissionBanner } from "@/components/PermissionBanner";
import { PreviewPanel } from "@/components/PreviewPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { StatusBar } from "@/components/StatusBar";
import { useChats } from "@/hooks/useChats";
import { useClaudeStream } from "@/hooks/useClaudeStream";
import { usePttSuspend } from "@/hooks/usePttSuspend";
import { useRecorder } from "@/hooks/useRecorder";
import { useSettings } from "@/hooks/useSettings";
import { useTranscription } from "@/hooks/useTranscription";
import { useWindowControls } from "@/hooks/useWindowControls";
import {
  captureAvailable,
  openAudioPermissionSettings,
  retryTranscription,
  setWindowWidth,
} from "@/ipc/commands";
import { isTauri } from "@/ipc/env";
import { onEvent } from "@/ipc/events";
import type { ChatMessageDto } from "@/ipc/types";
import { extractHtmlBlocks } from "@/lib/html-blocks";

const RETRYABLE = /перегружен|соединение|VPN|интернет|оборван/i;

// Ширина окна: базовая (превью закрыто) и расширенная (превью справа). Прирост =
// ширина панели (380) + зазор между колонками (gap-3 = 12px), чтобы левая колонка
// оставалась пиксельно неподвижной. Числа правятся позже.
const BASE_WIDTH = 760;
const OPEN_WIDTH = 1152;

export default function App() {
  const { settings, save, bumpOpacity } = useSettings();
  const state = useRecorder();
  const chats = useChats();

  const [sttError, setSttError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [permissionOk, setPermissionOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Свежие значения для стабильных колбэков (PTT/транскрипция/подписки).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  // Открыть встроенную панель превью с данным HTML.
  const openPreview = useCallback((code: string) => {
    setPreviewHtml(code);
    setPreviewOpen(true);
  }, []);

  // llm-done: дописать ответ в историю; если включено автопревью, чат активен
  // и в ответе есть ```html — открыть панель с последним блоком.
  const onAssistantDone = useCallback(
    (chatId: string, text: string) => {
      chatsRef.current.appendAssistantMessage(chatId, text);
      if (!settingsRef.current.auto_preview_html) return;
      if (chatId !== chatsRef.current.activeId) return;
      const blocks = extractHtmlBlocks(text);
      const last = blocks[blocks.length - 1];
      if (last !== undefined) openPreview(last);
    },
    [openPreview],
  );

  const stream = useClaudeStream(onAssistantDone);
  const streamRef = useRef(stream);
  streamRef.current = stream;

  const active = chats.active;
  const activeId = chats.activeId;
  const activeStreaming = !!stream.streaming[activeId];

  const error = sttError ?? stream.error[activeId] ?? null;

  // Единая точка отправки активного чата (ручной ⌘⏎/«Отправить» и авто-send).
  const dispatchSend = useCallback((rawText: string) => {
    const c = chatsRef.current.active;
    if (streamRef.current.streaming[c.id]) return; // не шлём поверх своего активного стрима
    const trimmed = rawText.trim();
    const images = c.draftAttachments.map((a) => a.payload);
    if (trimmed === "" && images.length === 0) return;
    setSttError(null);
    chatsRef.current.appendUserMessage(c.id, trimmed, images);
    const history: ChatMessageDto[] = [
      ...c.messages.map((m) => ({ role: m.role, text: m.text, images: m.images })),
      { role: "user", text: trimmed, images },
    ];
    void streamRef.current.send(c.id, history);
  }, []);

  const doSend = useCallback(() => {
    dispatchSend(chatsRef.current.active.draft);
  }, [dispatchSend]);

  // Ширина окна следует за состоянием панели превью (расширяется вправо).
  useEffect(() => {
    void setWindowWidth(previewOpen ? OPEN_WIDTH : BASE_WIDTH);
  }, [previewOpen]);

  useTranscription(
    useCallback(
      (incoming: string) => {
        const c = chatsRef.current.active;
        chatsRef.current.setDraft(c.id, incoming, c.draftAttachments);
        setSttError(null);
        setShowRetry(false);
        if (settingsRef.current.auto_send) dispatchSend(incoming);
      },
      [dispatchSend],
    ),
  );

  useEffect(
    () =>
      onEvent("stt-error", (msg) => {
        setSttError(msg);
        setShowRetry(RETRYABLE.test(msg));
      }),
    [],
  );

  useEffect(() => {
    if (state === "recording") {
      setSttError(null);
      setShowRetry(false);
    }
  }, [state]);

  useWindowControls(settings.move_step, doSend, bumpOpacity);
  usePttSuspend();

  useEffect(() => {
    void captureAvailable().then((ok) => {
      setPermissionOk(ok);
    });
  }, []);

  // Демо-затравка для браузерного превью. Ждём, пока активный чат подгрузится
  // (activeId непустой), и сеем ровно один раз.
  const seededDemo = useRef(false);
  useEffect(() => {
    if (isTauri() || seededDemo.current || activeId === "") return;
    seededDemo.current = true;
    chatsRef.current.setDraft(
      activeId,
      "Объясни, чем хвостовая рекурсия отличается от обычной.",
      [],
    );
  }, [activeId]);

  const onRetry = () => {
    setShowRetry(false);
    void retryTranscription();
  };

  const partial = activeStreaming ? (stream.partial[activeId] ?? "") : null;

  return (
    <div className="app-shell relative flex h-screen gap-3 overflow-hidden rounded-[22px] p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {!permissionOk && (
          <PermissionBanner onOpenSettings={() => void openAudioPermissionSettings()} />
        )}

        <StatusBar
          state={state}
          error={error}
          hotkey={settings.hotkey}
          onOpenSettings={() => {
            setSettingsOpen(true);
          }}
          tabs={
            <ChatTabs
              chats={chats.chats}
              activeId={activeId}
              streaming={stream.streaming}
              onSelect={chats.selectChat}
              onRemove={(id) => {
                stream.stop(id); // отменяем фоновый стрим удаляемого чата
                chats.removeChat(id);
              }}
              onNew={chats.newChat}
            />
          }
        />

        <AnswerPanel
          messages={active.messages}
          partial={partial}
          streaming={activeStreaming}
          onCopy={() => {
            const last = [...active.messages].reverse().find((m) => m.role === "assistant");
            if (last) void navigator.clipboard.writeText(last.text);
          }}
          onOpenPreview={openPreview}
        />

        <Composer
          value={active.draft}
          onChange={(v) => {
            chats.setDraft(activeId, v, active.draftAttachments);
          }}
          attachments={active.draftAttachments}
          onRemoveAttachment={(i) => {
            chats.removeDraftAttachment(activeId, i);
          }}
          onPaste={(items) => void chats.addDraftAttachments(activeId, items)}
          onSend={doSend}
          onStop={() => {
            stream.stop(activeId);
          }}
          onClear={() => {
            chats.setDraft(activeId, "", []);
          }}
          onRetry={onRetry}
          hotkey={settings.hotkey}
          streaming={activeStreaming}
          showRetry={showRetry}
        />

        <HotkeyHints hotkey={settings.hotkey} />
      </div>

      {previewOpen && (
        <PreviewPanel
          html={previewHtml}
          onClose={() => {
            setPreviewOpen(false);
          }}
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => {
          setSettingsOpen(false);
        }}
        onSave={(next) => {
          void save(next).then((err) => {
            if (err) setSttError(`Ошибка сохранения настроек: ${err}`);
          });
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}
```

(Раскладка: «Чат» теперь над композером; корень — флекс-строка с левой колонкой и `PreviewPanel` справа; высота окна больше не управляется из JS.)

- [ ] **Step 8: tauri.conf — увеличить высоту по умолчанию**

В `src-tauri/tauri.conf.json`, в объекте окна `main`, заменить:

```json
        "height": 290,
```

на:

```json
        "height": 640,
```

(`width` 760, `minWidth` 480, `minHeight` 240 — без изменений.)

- [ ] **Step 9: Проверки**

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное; vitest — на 3 теста меньше (удалён `usePreviewHtml.test.ts`), остальные проходят.

- [ ] **Step 10: Визуальная проверка в браузере**

Run: `(npm run dev &) ; sleep 4; curl -s "http://localhost:1420/" | head -3; pkill -f vite`
Expected: vite отдаёт страницу (200). Полная визуальная приёмка — позже в Tauri. Не оставляй dev-сервер запущенным.

- [ ] **Step 11: Commit**

```bash
git add src/components/PreviewPanel.tsx src/components/AnswerPanel.tsx src/App.tsx src/ipc/commands.ts src/ipc/types.ts src/main.tsx src-tauri/tauri.conf.json
git commit -m "feat: встроенная панель превью справа + «Чат» наверху без сворачивания"
```

---

### Task 3: Rust — снос инфраструктуры отдельного окна превью

**Files:**
- Modify: `src-tauri/src/lib.rs` (удалить команды/состояние/константы/`set_window_height`/модуль)
- Delete: `src-tauri/src/preview.rs`, `src-tauri/capabilities/preview.json`

- [ ] **Step 1: Удалить команды превью-окна и константы из `lib.rs`**

Удалить блок констант:

```rust
/// Логические размеры окна превью; в физические переводятся через scale_factor.
const PREVIEW_LOGICAL_HEIGHT: f64 = 480.0;
const PREVIEW_GAP: f64 = 12.0;
```

Удалить целиком функцию `show_html_preview` (от её doc-комментария `/// Показывает HTML в синглтон-окне превью…` до закрывающей `}` перед `get_preview_html`) и функцию `get_preview_html`:

```rust
#[tauri::command]
fn get_preview_html(app: AppHandle) -> String {
    app.state::<App>().preview_html.lock().unwrap().clone()
}
```

(Файл — источник истины; удалить обе функции `show_html_preview` и `get_preview_html` полностью.)

- [ ] **Step 2: Удалить регистрацию команд в `generate_handler!`**

Удалить строки:

```rust
            show_html_preview,
            get_preview_html,
```

- [ ] **Step 3: Удалить состояние `preview_html`**

В объявлении struct `App` удалить:

```rust
    pub preview_html: Mutex<String>,
```

В `app.manage(App { ... })` удалить:

```rust
                preview_html: Mutex::new(String::new()),
```

- [ ] **Step 4: Удалить команду `set_window_height` и хелпер `win_width`**

Удалить целиком функцию `set_window_height` (от doc-комментария `/// Плавно меняет высоту главного окна…` до её закрывающей `}`) и хелпер:

```rust
/// Текущая логическая ширина окна (на случай ручного ресайза во время анимации);
/// падает обратно на стартовую ширину.
fn win_width(win: &tauri::WebviewWindow, fallback: f64) -> f64 {
    let scale = win.scale_factor().unwrap_or(1.0);
    win.outer_size().map(|s| s.width as f64 / scale).unwrap_or(fallback)
}
```

В `generate_handler!` удалить строку:

```rust
            set_window_height,
```

- [ ] **Step 5: Удалить модуль `preview` и его файл**

В `src-tauri/src/lib.rs` удалить строку:

```rust
pub mod preview;
```

Удалить файл и capability:

```bash
git rm src-tauri/src/preview.rs src-tauri/capabilities/preview.json
```

- [ ] **Step 6: Проверки**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo clippy --manifest-path src-tauri/Cargo.toml --lib && cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: компиляция без ошибок; clippy без warnings (нет мёртвого кода — `set_window_height`, `win_width`, `preview_rect`, `preview_html` удалены); тесты зелёные (`window_geom` остаётся, `preview` исчез).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "refactor(rust): снести инфраструктуру отдельного окна превью (окно/команды/preview.rs/capability)"
```

---

### Task 4: CLAUDE.md — актуализировать под встроенную панель

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Обновить раздел контракта и инвариантов**

В `CLAUDE.md`:

(а) В списке событий убрать `preview-html`. Найти:

```
(`state-changed`, `transcript-ready`, `stt-error`, `llm-delta`, `llm-done`, `llm-error`, `preview-html` — адресное, эмитится только окну `preview`)
```

заменить на:

```
(`state-changed`, `transcript-ready`, `stt-error`, `llm-delta`, `llm-done`, `llm-error`)
```

(б) В пункте инварианта «Window chrome:» удалить предложение про окно `preview` (про `show_html_preview`, `?window=preview`, `preview.json`, `<iframe sandbox>`):

```
Второе окно `preview` (HTML-превью ответов) создаётся на лету командой `show_html_preview`, грузит тот же бандл с `?window=preview` (роутинг в `main.tsx`) и имеет свой минимальный набор прав в `src-tauri/capabilities/preview.json`; контент рендерится в `<iframe sandbox="allow-scripts">` без `allow-same-origin`.
```

и заменить на:

```
HTML-превью ответов рендерится встроенной панелью `PreviewPanel` (правая колонка того же окна) в `<iframe sandbox="allow-scripts">` без `allow-same-origin`; открытие расширяет окно вправо командой `set_window_width` (тот же твин, что был у высоты, + кламп `x` по краю монитора через `window_geom`).
```

(в) В пункте про манипуляции окном заменить упоминание `set_window_height` на `set_window_width`. Найти:

```
`move_window_by` and `set_window_height` are Rust commands.
```

заменить на:

```
`move_window_by` and `set_window_width` are Rust commands.
```

И в том же пункте найти:

```
`set_window_height` also tweens (ease-out) on a background thread, dispatching each frame via `run_on_main_thread`, with a `resize_gen` generation guard.
```

заменить на:

```
`set_window_width` tweens (ease-out) on a background thread, dispatching each frame via `run_on_main_thread`, with a `resize_gen` generation guard; window height is now static (set in `tauri.conf.json`).
```

(г) Если в разделе «Window height is state-driven» есть инвариант про `COMPACT_HEIGHT`/`FULL_HEIGHT` и синхронизацию `tauri.conf.json` — заменить его на констатацию, что высота окна теперь статична (одна высота в `tauri.conf.json`, динамической высоты под ответ нет), а под ответ окно расширяется по ширине. (Если такого пункта нет — пропустить.)

- [ ] **Step 2: Проверки**

Run: `npm run format:check`
Expected: проходит (если ругается на `CLAUDE.md` — `npx prettier --write CLAUDE.md`).

- [ ] **Step 3: Полный прогон проверок**

Run:
```bash
npm run lint && npm run format:check && npm run typecheck && npm run knip && npx vitest run
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml --lib && cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```
Expected: всё зелёное.

- [ ] **Step 4: Ручная приёмка в Tauri**

Run: `npm run tauri dev`, затем по чек-листу:
1. «Чат» сверху (переименован из «Диалог»), композер снизу, шеврона/сворачивания нет, область чата видна всегда; пустой чат — «Чат появится здесь».
2. Высота окна — новая по умолчанию (выше прежней).
3. Ответ с ```html → чип; клик по чипу расширяет окно вправо, появляется панель «Превью» справа; левый контент (чат/композер) не двигается пиксельно.
4. Автооткрытие панели по завершении ответа активного чата; `auto_preview_html=false` гасит автооткрытие, чип работает.
5. JS в превью живой; «Копировать код» кладёт HTML в буфер; ✕ закрывает панель и сужает окно обратно.
6. HUD у правого края экрана → при открытии превью окно сдвигается влево и остаётся целиком на мониторе.
7. Отдельного окна превью больше не появляется.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — встроенная панель превью, set_window_width, статичная высота"
```
