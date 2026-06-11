# Множественные чаты с памятью — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить одноразовый «вопрос → ответ» в множественные независимые чаты с памятью диалога, переключаемые вкладками в верхней строке, с параллельными стримами и персистентностью на диск.

**Architecture:** Источник истины по чатам — фронт (`Chat[]` + `activeId`). Rust-бэкенд хранит чаты как непрозрачную JSON-строку (`chats.json`, атомарно, `0600`) и шлёт историю сообщений в Anthropic. Стримы помечаются `chat_id`: события `llm-delta/done/error` несут `chatId`, отмена — по-чатная через `HashMap<chat_id, CancellationToken>`. На фронте `useChats` владеет списком и персистентностью, `useClaudeStream` — по-чатными буферами стрима.

**Tech Stack:** Rust (Tauri 2, serde, tokio), React 19 + TypeScript, Vitest, `cargo test`.

**Ключевые решения (зафиксированы в спеке):**
- Картинки **не** сохраняются на диск (стрипаются при сериализации); текст и ответы — да.
- Лимит **6** чатов.
- Черновик (`draft`, текст) и черновые вложения (`draftAttachments`) — по-чатные.
- Тип `Attachment` переезжает в `lib/composer.ts` (чтобы `lib/chats.ts` оставался без зависимости от хуков). DOM-конвертация файлов переезжает в `useChats`; старый `useAttachments` удаляется.

---

## Файловая структура

**Rust (`src-tauri/src/`):**
- `llm.rs` (Modify) — тип `ChatMessage`, `build_request_body` принимает `&[ChatMessage]`.
- `chats.rs` (Create) — персистентность непрозрачной строки (load/save, атомарно `0600`).
- `lib.rs` (Modify) — `App.llm_cancel` → мапа токенов; `send_to_claude(messages, chat_id)`; события с `chatId`; `cancel_stream(chat_id)`; команды `load_chats`/`save_chats`; регистрация в `generate_handler!`; объявление `pub mod chats`.

**IPC (`src/ipc/`):**
- `types.ts` (Modify) — `EventMap` payloads с `chatId`; тип `ChatMessageDto`.
- `commands.ts` (Modify) — `sendToClaude(messages, chatId)`, `cancelStream(chatId)`, `loadChats()`, `saveChats(json)`.

**Фронт логика (`src/lib/`):**
- `composer.ts` (Modify) — добавить `interface Attachment`.
- `chats.ts` (Create) — типы `Chat`/`ChatMessage`/`Role`, `CHAT_LIMIT`, `createChat`, `chatTitle`, `serializeChats`, `deserializeChats`.

**Хуки (`src/hooks/`):**
- `useChats.ts` (Create) — состояние чатов, операции, персистентность, черновые вложения.
- `useClaudeStream.ts` (Modify) — по-чатные буферы/стримы.
- `useAttachments.ts` + `useAttachments.test.ts` (Delete) — логика поглощена `useChats`.

**Компоненты (`src/components/`):**
- `ChatTabs.tsx` (Create) — ряд вкладок.
- `StatusBar.tsx` (Modify) — рендер вкладок слева от шестерёнки.
- `AnswerPanel.tsx` (Modify) — лента диалога вместо одного ответа.
- `App.tsx` (Modify) — связывание.

**Docs:**
- `CLAUDE.md` (Modify) — инвариант про `chatId` в событиях и `chats.json`.

---

## Task 1: Rust — `ChatMessage` и многосообщенческий `build_request_body`

**Files:**
- Modify: `src-tauri/src/llm.rs:100-138` (тип `ImageAttachment`, `build_request_body`)
- Modify: `src-tauri/src/llm.rs:237-260` (тесты `build_request_body`)

- [ ] **Step 1: Заменить тест формы тела на многосообщенческий**

В `src-tauri/src/llm.rs`, в `mod tests`, замени тест `request_body_shape_for_opus_includes_adaptive_thinking` целиком на:

```rust
    #[test]
    fn request_body_shape_for_opus_includes_adaptive_thinking() {
        let msgs = vec![ChatMessage {
            role: "user".into(),
            text: "вопрос".into(),
            images: vec![],
        }];
        let body = build_request_body("claude-opus-4-8", "sys", &msgs);
        assert_eq!(body["model"], "claude-opus-4-8");
        assert_eq!(body["max_tokens"], 64000);
        assert_eq!(body["stream"], true);
        assert_eq!(body["thinking"]["type"], "adaptive");
        assert_eq!(body["system"], "sys");
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["messages"][0]["content"], "вопрос");
    }

    #[test]
    fn request_body_preserves_multi_turn_history() {
        let msgs = vec![
            ChatMessage { role: "user".into(), text: "1+1?".into(), images: vec![] },
            ChatMessage { role: "assistant".into(), text: "2".into(), images: vec![] },
            ChatMessage { role: "user".into(), text: "а 2+2?".into(), images: vec![] },
        ];
        let body = build_request_body("claude-opus-4-8", "sys", &msgs);
        assert_eq!(body["messages"].as_array().unwrap().len(), 3);
        assert_eq!(body["messages"][1]["role"], "assistant");
        assert_eq!(body["messages"][1]["content"], "2");
        assert_eq!(body["messages"][2]["content"], "а 2+2?");
    }
```

И обнови тест haiku (следующий за ним) — найди `build_request_body("claude-haiku-4-5", ...)` и приведи к новой сигнатуре:

```rust
    #[test]
    fn haiku_body_has_no_thinking_field() {
        let msgs = vec![ChatMessage {
            role: "user".into(),
            text: "вопрос".into(),
            images: vec![],
        }];
        let body = build_request_body("claude-haiku-4-5", "sys", &msgs);
        assert!(body.get("thinking").is_none());
    }
```

- [ ] **Step 2: Запустить тесты — убедиться, что не компилируется/падает**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib llm::`
Expected: ошибка компиляции — `ChatMessage` не существует, `build_request_body` принимает другое число аргументов.

- [ ] **Step 3: Добавить тип `ChatMessage` и переписать `build_request_body`**

В `src-tauri/src/llm.rs` после определения `ImageAttachment` (строка ~104) добавь:

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" | "assistant"
    pub text: String,
    #[serde(default)]
    pub images: Vec<ImageAttachment>,
}
```

Замени функцию `build_request_body` (строки ~125-138) на:

```rust
pub fn build_request_body(model: &str, system: &str, messages: &[ChatMessage]) -> Value {
    let msgs: Vec<Value> = messages
        .iter()
        .map(|m| json!({"role": m.role, "content": build_content(&m.text, &m.images)}))
        .collect();
    let mut body = json!({
        "model": model,
        "max_tokens": 64000,
        "stream": true,
        "system": system,
        "messages": msgs
    });
    // claude-haiku-4-5 не поддерживает adaptive thinking — поле не отправляем (см. спеку)
    if !model.starts_with("claude-haiku") {
        body["thinking"] = json!({"type": "adaptive"});
    }
    body
}
```

- [ ] **Step 4: Запустить тесты — зелёные**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib llm::`
Expected: PASS (все тесты llm, включая SSE-парсер и два новых).

- [ ] **Step 5: Коммит**

```bash
git add src-tauri/src/llm.rs
git commit -m "feat(llm): build_request_body принимает историю сообщений (ChatMessage)"
```

---

## Task 2: Rust — модуль персистентности `chats.rs`

**Files:**
- Create: `src-tauri/src/chats.rs`
- Modify: `src-tauri/src/lib.rs:1-7` (добавить `pub mod chats;`)

- [ ] **Step 1: Создать `chats.rs` с падающим тестом**

Создай `src-tauri/src/chats.rs`:

```rust
use std::path::Path;

/// Возвращает сохранённую JSON-строку чатов (схему владеет фронт).
/// Отсутствие файла или ошибка чтения → пустая строка (фронт стартует с одним чатом).
pub fn load(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

/// Атомарно записывает непрозрачную JSON-строку с правами 0600 (по образцу settings.rs).
pub fn save(path: &Path, json: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    {
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)?;
        f.write_all(json.as_bytes())?;
    }
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn save_load_roundtrip_with_600_perms() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("chats.json");
        let payload = r#"[{"id":"a","title":"Чат 1","messages":[],"draft":""}]"#;
        save(&path, payload).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        assert_eq!(load(&path), payload);
        assert!(!path.with_extension("tmp").exists()); // tmp убран rename'ом
    }

    #[test]
    fn load_missing_file_gives_empty_string() {
        assert_eq!(load(std::path::Path::new("/nonexistent/chats.json")), "");
    }

    #[test]
    fn save_creates_parent_directories() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/deeper/chats.json");
        save(&path, "[]").unwrap();
        assert!(path.exists());
    }
}
```

- [ ] **Step 2: Зарегистрировать модуль**

В `src-tauri/src/lib.rs` в блоке `pub mod` (строки 1-7) добавь строку (по алфавиту, после `pub mod capture;`):

```rust
pub mod chats;
```

- [ ] **Step 3: Запустить тесты**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib chats::`
Expected: PASS (3 теста).

- [ ] **Step 4: Коммит**

```bash
git add src-tauri/src/chats.rs src-tauri/src/lib.rs
git commit -m "feat(chats): атомарная персистентность чатов (chats.json, 0600)"
```

---

## Task 3: Rust — по-чатные стримы, отмена и команды чатов в `lib.rs`

**Files:**
- Modify: `src-tauri/src/lib.rs:9-14` (импорты), `:22-32` (`App`), `:80-90` (init), `:97-109` (`generate_handler!`), `:280-318` (`send_to_claude`/`cancel_stream`)

- [ ] **Step 1: Импорты и поле `App`**

В `src-tauri/src/lib.rs` обнови блок `use std::sync` (строки 9-12) на:

```rust
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
```

В структуре `App` (строки 22-32) замени поле `llm_cancel`:

```rust
    pub llm_cancel: Mutex<HashMap<String, CancellationToken>>,
```

В инициализации `app.manage(App { ... })` (строки 80-90) замени:

```rust
                llm_cancel: Mutex::new(HashMap::new()),
```

- [ ] **Step 2: Серде-структуры событий и `chats_path`**

В `src-tauri/src/lib.rs` сразу после `fn settings_path(...)` (после строки 39) добавь:

```rust
fn chats_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("app_data_dir")
        .join("chats.json")
}

/// Полезные нагрузки LLM-событий несут chat_id, чтобы фронт роутил дельты по чатам.
/// camelCase — потому что фронт читает их как { chatId, ... }.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmDelta {
    chat_id: String,
    delta: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmDone {
    chat_id: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LlmError {
    chat_id: String,
    message: String,
}
```

- [ ] **Step 3: Переписать `send_to_claude` под историю + chat_id**

Замени функцию `send_to_claude` (строки 280-311) целиком на:

```rust
#[tauri::command]
async fn send_to_claude(app: AppHandle, messages: Vec<llm::ChatMessage>, chat_id: String) {
    let (model, system) = {
        let s = app.state::<App>();
        let s = s.settings.lock().unwrap();
        (s.model.clone(), s.system_prompt.clone())
    };
    let client = app.state::<App>().llm.lock().unwrap().clone();
    let cancel = CancellationToken::new();
    {
        let st = app.state::<App>();
        let mut map = st.llm_cancel.lock().unwrap();
        if let Some(old) = map.insert(chat_id.clone(), cancel.clone()) {
            old.cancel(); // повторный send в тот же чат отменяет прежний
        }
    }
    let body = llm::build_request_body(&model, &system, &messages);
    let app2 = app.clone();
    let cid = chat_id.clone();
    let res = client
        .stream_message(body, cancel, move |delta| {
            let _ = app2.emit(
                "llm-delta",
                LlmDelta { chat_id: cid.clone(), delta: delta.to_string() },
            );
        })
        .await;
    app.state::<App>().llm_cancel.lock().unwrap().remove(&chat_id);
    match res {
        Ok(()) | Err(llm::LlmError::Cancelled) => {
            let _ = app.emit("llm-done", LlmDone { chat_id });
        }
        Err(e) => {
            let _ = app.emit("llm-error", LlmError { chat_id, message: e.to_string() });
        }
    }
}
```

- [ ] **Step 4: Переписать `cancel_stream` под chat_id и добавить команды чатов**

Замени функцию `cancel_stream` (строки 313-318) на:

```rust
#[tauri::command]
fn cancel_stream(app: AppHandle, chat_id: String) {
    if let Some(c) = app.state::<App>().llm_cancel.lock().unwrap().remove(&chat_id) {
        c.cancel();
    }
}

#[tauri::command]
fn load_chats(app: AppHandle) -> String {
    chats::load(&chats_path(&app))
}

#[tauri::command]
fn save_chats(app: AppHandle, json: String) -> Result<(), String> {
    chats::save(&chats_path(&app), &json).map_err(|e| e.to_string())
}
```

- [ ] **Step 5: Зарегистрировать команды чатов**

В `generate_handler!` (строки 97-109) добавь две строки после `cancel_stream,`:

```rust
            load_chats,
            save_chats,
```

- [ ] **Step 6: Скомпилировать и прогнать тесты Rust**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: PASS (компилируется, все тесты зелёные).

- [ ] **Step 7: Clippy**

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml --lib`
Expected: без ошибок (warnings допустимы, но не нарастающие по нашему коду).

- [ ] **Step 8: Коммит**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(lib): по-чатные стримы (chatId в событиях), отмена по чату, команды чатов"
```

---

## Task 4: IPC-контракт — типы и команды

**Files:**
- Modify: `src/ipc/types.ts:31-39` (`EventMap`), конец файла (тип `ChatMessageDto`)
- Modify: `src/ipc/commands.ts:5-13` (`sendToClaude`/`cancelStream`), конец файла (`loadChats`/`saveChats`)

- [ ] **Step 1: Обновить `EventMap` и добавить DTO**

В `src/ipc/types.ts` замени блок `EventMap` (строки 31-39) на:

```ts
/** DTO сообщения для отправки в Anthropic (соответствует Rust llm::ChatMessage). */
export interface ChatMessageDto {
  role: "user" | "assistant";
  text: string;
  images: ImagePayload[];
}

/** Карта имя-события → тип payload (для типобезопасного listen). */
export interface EventMap {
  "state-changed": RecorderState;
  "transcript-ready": string;
  "stt-error": string;
  "llm-delta": { chatId: string; delta: string };
  "llm-done": { chatId: string };
  "llm-error": { chatId: string; message: string };
}
```

- [ ] **Step 2: Обновить команды стрима и добавить команды чатов**

В `src/ipc/commands.ts` замени `sendToClaude` и `cancelStream` (строки 5-13). Сначала обнови импорт типов (строка 3):

```ts
import { DEFAULT_SETTINGS, type ChatMessageDto, type ImagePayload, type Settings } from "./types";
```

(`ImagePayload` остаётся в импорте, он ещё используется в других местах проекта через этот модуль — оставь.)

Замени функции:

```ts
export async function sendToClaude(messages: ChatMessageDto[], chatId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("send_to_claude", { messages, chatId });
}

export async function cancelStream(chatId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cancel_stream", { chatId });
}
```

В конец файла добавь:

```ts
/** Возвращает сохранённую JSON-строку чатов (пустая строка, если файла нет). */
export async function loadChats(): Promise<string> {
  if (!isTauri()) return "";
  return invoke<string>("load_chats");
}

export async function saveChats(json: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("save_chats", { json });
}
```

Примечание: импорт `type ImagePayload` в строке 3 может стать неиспользуемым — если `tsc` ругнётся `TS6133`, убери `type ImagePayload,` из этого импорта.

- [ ] **Step 3: Проверить типы фронта**

Run: `npm run build`
Expected: на этом шаге возможны ошибки в `App.tsx`/`useClaudeStream.ts` (старые сигнатуры) — это нормально, их чиним в Task 6-7-11. Убедись, что в `src/ipc/*` ошибок нет (ошибки только в потребителях).

- [ ] **Step 4: Коммит**

```bash
git add src/ipc/types.ts src/ipc/commands.ts
git commit -m "feat(ipc): chatId в LLM-событиях, команды загрузки/сохранения чатов"
```

---

## Task 5: Фронт-логика — `Attachment` в composer и модуль `lib/chats.ts`

**Files:**
- Modify: `src/lib/composer.ts:6-9` (добавить `Attachment`)
- Create: `src/lib/chats.ts`
- Create: `src/lib/chats.test.ts`

- [ ] **Step 1: Добавить тип `Attachment` в composer.ts**

В `src/lib/composer.ts` после `export interface ImagePayload { ... }` (после строки 9) добавь:

```ts
/** Вложение в черновике композера: данные для API + dataURL для превью. */
export interface Attachment {
  payload: ImagePayload;
  preview: string;
}
```

- [ ] **Step 2: Написать падающие тесты `lib/chats.ts`**

Создай `src/lib/chats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chatTitle, createChat, deserializeChats, serializeChats, type Chat } from "./chats";

const img = { media_type: "image/png", data: "AAAA" };

function chatWith(messages: Chat["messages"], extra: Partial<Chat> = {}): Chat {
  return { id: "x", title: "Чат 1", messages, draft: "", draftAttachments: [], ...extra };
}

describe("createChat", () => {
  it("даёт уникальный id и заголовок по индексу", () => {
    const a = createChat(1);
    const b = createChat(2);
    expect(a.id).not.toBe(b.id);
    expect(a.title).toBe("Чат 1");
    expect(b.title).toBe("Чат 2");
    expect(a.messages).toEqual([]);
    expect(a.draft).toBe("");
  });
});

describe("chatTitle", () => {
  it("берёт начало первого пользовательского сообщения", () => {
    expect(chatTitle("объясни рекурсию подробно и с примерами", 1)).toBe("объясни рекурсию подро…");
  });
  it("короткий текст не обрезает", () => {
    expect(chatTitle("привет", 1)).toBe("привет");
  });
  it("пустой текст → запасной заголовок по индексу", () => {
    expect(chatTitle("   ", 3)).toBe("Чат 3");
  });
});

describe("serialize/deserialize", () => {
  it("стрипает картинки из сообщений и черновые вложения", () => {
    const chats = [
      chatWith(
        [{ role: "user", text: "что тут?", images: [img] }, { role: "assistant", text: "кот", images: [] }],
        { draft: "недописанное", draftAttachments: [{ payload: img, preview: "data:..." }] },
      ),
    ];
    const json = serializeChats(chats);
    const parsed = JSON.parse(json);
    expect(parsed[0].messages[0].images).toEqual([]);
    expect(parsed[0].messages[0].text).toBe("что тут?");
    expect(parsed[0].draft).toBe("недописанное");
    expect(parsed[0].draftAttachments).toEqual([]);
  });

  it("round-trip восстанавливает чаты с пустыми вложениями", () => {
    const chats = [chatWith([{ role: "user", text: "вопрос", images: [] }], { draft: "хвост" })];
    const restored = deserializeChats(serializeChats(chats));
    expect(restored).not.toBeNull();
    expect(restored![0].messages[0].text).toBe("вопрос");
    expect(restored![0].draft).toBe("хвост");
    expect(restored![0].draftAttachments).toEqual([]);
  });

  it("пустая строка → null", () => {
    expect(deserializeChats("")).toBeNull();
  });

  it("битый JSON → null", () => {
    expect(deserializeChats("{не json")).toBeNull();
  });

  it("пустой массив → null (фронт создаст стартовый чат)", () => {
    expect(deserializeChats("[]")).toBeNull();
  });
});
```

- [ ] **Step 3: Запустить тест — упадёт**

Run: `npx vitest run src/lib/chats.test.ts`
Expected: FAIL — модуль `./chats` не существует.

- [ ] **Step 4: Реализовать `lib/chats.ts`**

Создай `src/lib/chats.ts`:

```ts
import type { Attachment, ImagePayload } from "@/lib/composer";

export const CHAT_LIMIT = 6;
const TITLE_MAX = 22;

export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  text: string;
  images: ImagePayload[];
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  draft: string;
  draftAttachments: Attachment[];
}

function uid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export function createChat(index: number): Chat {
  return { id: uid(), title: `Чат ${index}`, messages: [], draft: "", draftAttachments: [] };
}

/** Заголовок из первого вопроса (обрезка по TITLE_MAX) либо «Чат N». */
export function chatTitle(firstUserText: string, index: number): string {
  const t = firstUserText.trim();
  if (t === "") return `Чат ${index}`;
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX)}…` : t;
}

/** Сериализация для диска: картинки стрипаются (и из истории, и из черновика). */
export function serializeChats(chats: Chat[]): string {
  const stripped = chats.map((c) => ({
    id: c.id,
    title: c.title,
    messages: c.messages.map((m) => ({ role: m.role, text: m.text, images: [] })),
    draft: c.draft,
    draftAttachments: [],
  }));
  return JSON.stringify(stripped);
}

/** Разбор с диска. null → невалидно/пусто, вызывающий создаёт стартовый чат. */
export function deserializeChats(json: string): Chat[] | null {
  if (json.trim() === "") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((c) => {
    const o = c as Partial<Chat>;
    return {
      id: typeof o.id === "string" ? o.id : uid(),
      title: typeof o.title === "string" ? o.title : "Чат",
      messages: Array.isArray(o.messages)
        ? o.messages.map((m) => ({ role: m.role, text: m.text, images: [] }))
        : [],
      draft: typeof o.draft === "string" ? o.draft : "",
      draftAttachments: [],
    };
  });
}
```

- [ ] **Step 5: Запустить тест — зелёный**

Run: `npx vitest run src/lib/chats.test.ts`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add src/lib/composer.ts src/lib/chats.ts src/lib/chats.test.ts
git commit -m "feat(lib): модель чатов и сериализация без картинок"
```

---

## Task 6: Хук `useChats` (состояние, операции, персистентность, вложения)

**Files:**
- Create: `src/hooks/useChats.ts`
- Create: `src/hooks/useChats.test.ts`
- Delete: `src/hooks/useAttachments.ts`, `src/hooks/useAttachments.test.ts`

- [ ] **Step 1: Написать падающие тесты `useChats`**

Создай `src/hooks/useChats.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadChats = vi.fn();
const saveChats = vi.fn();
vi.mock("@/ipc/commands", () => ({
  loadChats: () => loadChats(),
  saveChats: (json: string) => saveChats(json),
}));

import { useChats } from "./useChats";
import { CHAT_LIMIT } from "@/lib/chats";

beforeEach(() => {
  vi.useFakeTimers();
  loadChats.mockResolvedValue("");
  saveChats.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useChats", () => {
  it("стартует с одним пустым чатом, если на диске пусто", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.chats.length).toBe(1));
    expect(result.current.active.messages).toEqual([]);
    expect(result.current.activeId).toBe(result.current.chats[0].id);
  });

  it("newChat добавляет чат, переключает на него и уважает лимит", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.chats.length).toBe(1));
    for (let i = 1; i < CHAT_LIMIT; i++) act(() => result.current.newChat());
    expect(result.current.chats.length).toBe(CHAT_LIMIT);
    expect(result.current.activeId).toBe(result.current.chats[CHAT_LIMIT - 1].id);
    act(() => result.current.newChat()); // сверх лимита — игнор
    expect(result.current.chats.length).toBe(CHAT_LIMIT);
  });

  it("appendUserMessage ставит заголовок из первого вопроса и чистит черновик", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.chats.length).toBe(1));
    const id = result.current.activeId;
    act(() => result.current.setDraft(id, "длинный вопрос про рекурсию и стек", []));
    act(() => result.current.appendUserMessage(id, "длинный вопрос про рекурсию и стек", []));
    expect(result.current.active.title).toBe("длинный вопрос про рек…");
    expect(result.current.active.draft).toBe("");
    expect(result.current.active.messages).toHaveLength(1);
    expect(result.current.active.messages[0].role).toBe("user");
  });

  it("appendAssistantMessage дописывает ответ", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.chats.length).toBe(1));
    const id = result.current.activeId;
    act(() => result.current.appendUserMessage(id, "вопрос", []));
    act(() => result.current.appendAssistantMessage(id, "ответ"));
    expect(result.current.active.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.current.active.messages[1].text).toBe("ответ");
  });

  it("removeChat не даёт удалить последний и переключает активный", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.chats.length).toBe(1));
    const first = result.current.activeId;
    act(() => result.current.newChat());
    const second = result.current.activeId;
    act(() => result.current.removeChat(second));
    expect(result.current.chats.length).toBe(1);
    expect(result.current.activeId).toBe(first);
    act(() => result.current.removeChat(first)); // последний — нельзя
    expect(result.current.chats.length).toBe(1);
  });

  it("дебаунсит сохранение на диск", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => expect(result.current.chats.length).toBe(1));
    saveChats.mockClear();
    act(() => result.current.newChat());
    expect(saveChats).not.toHaveBeenCalled(); // ещё не прошёл дебаунс
    act(() => vi.advanceTimersByTime(600));
    expect(saveChats).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npx vitest run src/hooks/useChats.test.ts`
Expected: FAIL — `./useChats` не существует.

- [ ] **Step 3: Реализовать `useChats.ts`**

Создай `src/hooks/useChats.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { loadChats, saveChats } from "@/ipc/commands";
import {
  acceptedNewAttachments,
  ATTACHMENT_LIMIT,
  downscaleFactor,
  extractImageItems,
  toImagePayload,
  type Attachment,
  type ImagePayload,
} from "@/lib/composer";
import {
  CHAT_LIMIT,
  chatTitle,
  createChat,
  deserializeChats,
  serializeChats,
  type Chat,
} from "@/lib/chats";

const SAVE_DEBOUNCE_MS = 500;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

async function fileToAttachment(file: File): Promise<Attachment> {
  const factor = downscaleFactor(file.size);
  if (factor === 1) {
    const dataUrl = await readAsDataUrl(file);
    return { payload: toImagePayload(dataUrl, file.type), preview: dataUrl };
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * factor));
  canvas.height = Math.max(1, Math.round(bitmap.height * factor));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { payload: toImagePayload(dataUrl, "image/jpeg"), preview: dataUrl };
}

export interface ChatsApi {
  chats: Chat[];
  activeId: string;
  active: Chat;
  newChat: () => void;
  removeChat: (id: string) => void;
  selectChat: (id: string) => void;
  setDraft: (id: string, draft: string, draftAttachments: Attachment[]) => void;
  addDraftAttachments: (id: string, items: DataTransferItemList) => Promise<void>;
  removeDraftAttachment: (id: string, index: number) => void;
  appendUserMessage: (id: string, text: string, images: ImagePayload[]) => void;
  appendAssistantMessage: (id: string, text: string) => void;
}

export function useChats(): ChatsApi {
  const [chats, setChats] = useState<Chat[]>(() => [createChat(1)]);
  const [activeId, setActiveId] = useState<string>(() => "");
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Загрузка с диска один раз на старте.
  useEffect(() => {
    let live = true;
    void loadChats().then((json) => {
      if (!live) return;
      const restored = deserializeChats(json);
      const initial = restored ?? [createChat(1)];
      setChats(initial);
      setActiveId(initial[0].id);
      loaded.current = true;
    });
    return () => {
      live = false;
    };
  }, []);

  // Если activeId ещё не выставлен (первый рендер до загрузки) — указываем на первый.
  const effectiveActiveId = activeId || chats[0].id;

  // Дебаунс-сохранение при изменениях (только после первичной загрузки).
  useEffect(() => {
    if (!loaded.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveChats(serializeChats(chats));
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
  }, [chats]);

  const patch = useCallback((id: string, fn: (c: Chat) => Chat) => {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const newChat = useCallback(() => {
    setChats((prev) => {
      if (prev.length >= CHAT_LIMIT) return prev;
      const next = createChat(prev.length + 1);
      setActiveId(next.id);
      return [...prev, next];
    });
  }, []);

  const removeChat = useCallback(
    (id: string) => {
      setChats((prev) => {
        if (prev.length <= 1) return prev; // последний не удаляем
        const idx = prev.findIndex((c) => c.id === id);
        const next = prev.filter((c) => c.id !== id);
        setActiveId((cur) => {
          if (cur !== id) return cur;
          const neighbor = next[Math.min(idx, next.length - 1)];
          return neighbor.id;
        });
        return next;
      });
    },
    [],
  );

  const selectChat = useCallback((id: string) => setActiveId(id), []);

  const setDraft = useCallback(
    (id: string, draft: string, draftAttachments: Attachment[]) =>
      patch(id, (c) => ({ ...c, draft, draftAttachments })),
    [patch],
  );

  const addDraftAttachments = useCallback(
    async (id: string, items: DataTransferItemList) => {
      const files = extractImageItems(items);
      if (files.length === 0) return;
      let current = 0;
      setChats((prev) => {
        current = prev.find((c) => c.id === id)?.draftAttachments.length ?? 0;
        return prev;
      });
      const slots = acceptedNewAttachments(current, files.length);
      for (const file of files.slice(0, slots)) {
        try {
          const att = await fileToAttachment(file);
          patch(id, (c) =>
            c.draftAttachments.length >= ATTACHMENT_LIMIT
              ? c
              : { ...c, draftAttachments: [...c.draftAttachments, att] },
          );
        } catch {
          /* битый кадр пропускаем */
        }
      }
    },
    [patch],
  );

  const removeDraftAttachment = useCallback(
    (id: string, index: number) =>
      patch(id, (c) => ({
        ...c,
        draftAttachments: c.draftAttachments.filter((_, i) => i !== index),
      })),
    [patch],
  );

  const appendUserMessage = useCallback(
    (id: string, text: string, images: ImagePayload[]) =>
      setChats((prev) =>
        prev.map((c, i) => {
          if (c.id !== id) return c;
          const isFirst = c.messages.length === 0;
          return {
            ...c,
            title: isFirst ? chatTitle(text, i + 1) : c.title,
            messages: [...c.messages, { role: "user", text, images }],
            draft: "",
            draftAttachments: [],
          };
        }),
      ),
    [],
  );

  const appendAssistantMessage = useCallback(
    (id: string, text: string) =>
      patch(id, (c) => ({
        ...c,
        messages: [...c.messages, { role: "assistant", text, images: [] }],
      })),
    [patch],
  );

  const active = chats.find((c) => c.id === effectiveActiveId) ?? chats[0];

  return {
    chats,
    activeId: effectiveActiveId,
    active,
    newChat,
    removeChat,
    selectChat,
    setDraft,
    addDraftAttachments,
    removeDraftAttachment,
    appendUserMessage,
    appendAssistantMessage,
  };
}
```

- [ ] **Step 4: Удалить старый `useAttachments`**

```bash
git rm src/hooks/useAttachments.ts src/hooks/useAttachments.test.ts
```

- [ ] **Step 5: Запустить тесты `useChats`**

Run: `npx vitest run src/hooks/useChats.test.ts`
Expected: PASS (6 тестов).

- [ ] **Step 6: Коммит**

```bash
git add src/hooks/useChats.ts src/hooks/useChats.test.ts
git commit -m "feat(hooks): useChats — список чатов, черновики, вложения, персистентность"
```

---

## Task 7: Хук `useClaudeStream` — по-чатные буферы

**Files:**
- Modify: `src/hooks/useClaudeStream.ts` (полная переработка)
- Modify: `src/hooks/useClaudeStream.test.ts` (полная переработка)

- [ ] **Step 1: Переписать тест под по-чатный API**

Замени содержимое `src/hooks/useClaudeStream.test.ts` на:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (payload: unknown) => void;
const handlers: Record<string, Handler> = {};
const sendToClaude = vi.fn();
const cancelStream = vi.fn();

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: Handler) => {
    handlers[name] = handler;
    return () => delete handlers[name];
  },
}));
vi.mock("@/ipc/commands", () => ({
  sendToClaude: (...args: unknown[]) => sendToClaude(...args),
  cancelStream: (...args: unknown[]) => cancelStream(...args),
}));

import { useClaudeStream } from "./useClaudeStream";

function emit(name: string, payload: unknown) {
  act(() => handlers[name]?.(payload));
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("useClaudeStream (per-chat)", () => {
  it("роутит дельты в нужный чат", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    emit("llm-delta", { chatId: "A", delta: "при" });
    emit("llm-delta", { chatId: "A", delta: "вет" });
    expect(result.current.partial["A"]).toBe("привет");
    expect(result.current.streaming["A"]).toBe(true);
  });

  it("два параллельных стрима не смешиваются", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    act(() => void result.current.send("B", [{ role: "user", text: "q", images: [] }]));
    emit("llm-delta", { chatId: "A", delta: "AAA" });
    emit("llm-delta", { chatId: "B", delta: "BBB" });
    expect(result.current.partial["A"]).toBe("AAA");
    expect(result.current.partial["B"]).toBe("BBB");
  });

  it("llm-done вызывает onComplete с полным текстом и снимает streaming", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useClaudeStream(onComplete));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    emit("llm-delta", { chatId: "A", delta: "итог" });
    emit("llm-done", { chatId: "A" });
    expect(onComplete).toHaveBeenCalledWith("A", "итог");
    expect(result.current.streaming["A"]).toBeFalsy();
    expect(result.current.partial["A"]).toBeUndefined();
  });

  it("после stop поздние дельты игнорируются", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    act(() => result.current.stop("A"));
    expect(cancelStream).toHaveBeenCalledWith("A");
    emit("llm-delta", { chatId: "A", delta: "поздно" });
    expect(result.current.partial["A"]).toBeUndefined();
  });

  it("llm-error кладёт ошибку в чат и снимает streaming", () => {
    const { result } = renderHook(() => useClaudeStream(vi.fn()));
    act(() => void result.current.send("A", [{ role: "user", text: "q", images: [] }]));
    emit("llm-error", { chatId: "A", message: "сломалось" });
    expect(result.current.error["A"]).toBe("сломалось");
    expect(result.current.streaming["A"]).toBeFalsy();
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npx vitest run src/hooks/useClaudeStream.test.ts`
Expected: FAIL — новый API (`send(chatId, messages)`, `partial`, `onComplete`) не реализован.

- [ ] **Step 3: Переписать `useClaudeStream.ts`**

Замени содержимое `src/hooks/useClaudeStream.ts` на:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelStream, sendToClaude } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { ChatMessageDto } from "@/ipc/types";

export interface ClaudeStreams {
  /** Текущий «живой» буфер ответа по чатам (для рендера in-flight реплики). */
  partial: Record<string, string>;
  streaming: Record<string, boolean>;
  error: Record<string, string | null>;
  send: (chatId: string, messages: ChatMessageDto[]) => Promise<void>;
  stop: (chatId: string) => void;
}

/**
 * @param onComplete вызывается на llm-done с финальным текстом — потребитель
 * дописывает ответ как assistant-сообщение в историю чата.
 */
export function useClaudeStream(
  onComplete: (chatId: string, finalText: string) => void,
): ClaudeStreams {
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [streaming, setStreaming] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<Record<string, string | null>>({});

  // Буферы дельт по чатам и набор активных стримов — в ref'ах, чтобы события
  // (подписанные один раз) видели свежие значения без переподписки.
  const buffers = useRef<Record<string, string>>({});
  const active = useRef<Set<string>>(new Set());
  const raf = useRef(0);
  const pending = useRef(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const flush = useCallback(() => {
    pending.current = false;
    setPartial((prev) => {
      const next = { ...prev };
      for (const id of active.current) next[id] = buffers.current[id] ?? "";
      return next;
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    raf.current = requestAnimationFrame(flush);
  }, [flush]);

  const dropPartial = useCallback((chatId: string) => {
    delete buffers.current[chatId];
    setPartial((prev) => {
      if (!(chatId in prev)) return prev;
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
  }, []);

  useEffect(() => {
    const offDelta = onEvent("llm-delta", ({ chatId, delta }) => {
      if (!active.current.has(chatId)) return;
      buffers.current[chatId] = (buffers.current[chatId] ?? "") + delta;
      scheduleFlush();
    });
    const offDone = onEvent("llm-done", ({ chatId }) => {
      if (!active.current.has(chatId)) return;
      active.current.delete(chatId);
      const text = buffers.current[chatId] ?? "";
      onCompleteRef.current(chatId, text);
      dropPartial(chatId);
      setStreaming((s) => ({ ...s, [chatId]: false }));
    });
    const offError = onEvent("llm-error", ({ chatId, message }) => {
      if (!active.current.has(chatId)) return;
      active.current.delete(chatId);
      dropPartial(chatId);
      setStreaming((s) => ({ ...s, [chatId]: false }));
      setError((e) => ({ ...e, [chatId]: message }));
    });
    return () => {
      offDelta();
      offDone();
      offError();
      cancelAnimationFrame(raf.current);
      pending.current = false;
    };
  }, [scheduleFlush, dropPartial]);

  const send = useCallback(
    async (chatId: string, messages: ChatMessageDto[]) => {
      buffers.current[chatId] = "";
      active.current.add(chatId);
      setPartial((p) => ({ ...p, [chatId]: "" }));
      setStreaming((s) => ({ ...s, [chatId]: true }));
      setError((e) => ({ ...e, [chatId]: null }));
      try {
        await sendToClaude(messages, chatId);
      } catch (e) {
        active.current.delete(chatId);
        dropPartial(chatId);
        setStreaming((s) => ({ ...s, [chatId]: false }));
        setError((err) => ({ ...err, [chatId]: String(e) }));
      }
    },
    [dropPartial],
  );

  const stop = useCallback(
    (chatId: string) => {
      active.current.delete(chatId);
      void cancelStream(chatId);
      dropPartial(chatId);
      setStreaming((s) => ({ ...s, [chatId]: false }));
    },
    [dropPartial],
  );

  return { partial, streaming, error, send, stop };
}
```

- [ ] **Step 4: Запустить тесты — зелёные**

Run: `npx vitest run src/hooks/useClaudeStream.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Коммит**

```bash
git add src/hooks/useClaudeStream.ts src/hooks/useClaudeStream.test.ts
git commit -m "feat(hooks): useClaudeStream — независимые по-чатные стримы"
```

---

## Task 8: Компонент `ChatTabs`

**Files:**
- Create: `src/components/ChatTabs.tsx`

- [ ] **Step 1: Реализовать `ChatTabs.tsx`**

Создай `src/components/ChatTabs.tsx`:

```tsx
import { Plus, X } from "lucide-react";
import { CHAT_LIMIT, type Chat } from "@/lib/chats";
import { cn } from "@/lib/utils";

export interface ChatTabsProps {
  chats: Chat[];
  activeId: string;
  streaming: Record<string, boolean>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onNew: () => void;
}

export function ChatTabs({ chats, activeId, streaming, onSelect, onRemove, onNew }: ChatTabsProps) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      {chats.map((c, i) => {
        const isActive = c.id === activeId;
        return (
          <div
            key={c.id}
            className={cn(
              "group relative flex items-center shrink-0 rounded-md transition-colors",
              isActive ? "bg-white/10" : "hover:bg-white/5",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              title={c.title}
              className={cn(
                "flex items-center gap-1.5 pl-2.5 pr-2 py-1 font-mono text-[11px] rounded-md",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {streaming[c.id] && (
                <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
              )}
              <span className="max-w-[88px] truncate">{c.title || `Чат ${i + 1}`}</span>
            </button>
            {chats.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                aria-label={`Удалить ${c.title}`}
                className="grid place-items-center size-4 mr-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-white/10 transition-opacity"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onNew}
        disabled={chats.length >= CHAT_LIMIT}
        aria-label="Новый чат"
        className="grid place-items-center size-6 shrink-0 rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Проверить сборку фронта (точечно — компонент изолирован)**

Run: `npx tsc -b --pretty false 2>&1 | grep ChatTabs || echo "ChatTabs OK"`
Expected: `ChatTabs OK` (в самом файле ошибок типов нет; ошибки в `App.tsx` всё ещё ожидаемы до Task 11).

- [ ] **Step 3: Коммит**

```bash
git add src/components/ChatTabs.tsx
git commit -m "feat(ui): компонент вкладок чатов ChatTabs"
```

---

## Task 9: Интеграция вкладок в `StatusBar`

**Files:**
- Modify: `src/components/StatusBar.tsx`

- [ ] **Step 1: Принять вкладки как слот и разместить их в шапке**

Замени содержимое `src/components/StatusBar.tsx` на:

```tsx
import type { ReactNode } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import type { RecorderState } from "@/ipc/types";
import { cn } from "@/lib/utils";

export interface StatusBarProps {
  state: RecorderState;
  error: string | null;
  hotkey: string;
  tabs: ReactNode;
  onOpenSettings: () => void;
}

export function StatusBar({ state, error, hotkey, tabs, onOpenSettings }: StatusBarProps) {
  const statusText: Record<RecorderState, string> = {
    idle: `Зажми ${hotkey} — записать системный звук`,
    recording: "Запись…",
    transcribing: "Распознаю…",
  };
  const showError = error !== null && state === "idle";
  const dotClass =
    state === "recording"
      ? "bg-recording animate-pulse"
      : state === "transcribing"
        ? "bg-primary animate-pulse"
        : showError
          ? "bg-destructive"
          : "bg-muted-foreground";

  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 min-h-7">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
          <span className={cn("size-2.5 rounded-full shrink-0", dotClass)} aria-hidden />
          {tabs}
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Настройки"
          className="grid place-items-center size-7 shrink-0 rounded-full text-muted-foreground transition-[color,background,transform] hover:text-foreground hover:bg-white/5 hover:rotate-45 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <SettingsIcon className="size-4" />
        </button>
      </div>
      <span
        className={cn(
          "font-mono text-[11.5px] truncate",
          showError ? "text-destructive whitespace-normal" : "text-muted-foreground",
        )}
      >
        {showError ? error : statusText[state]}
      </span>
    </header>
  );
}
```

Примечание: класс `no-scrollbar` может отсутствовать в проекте. Если в `src/index.css` его нет — добавь туда:

```css
@layer utilities {
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
}
```

- [ ] **Step 2: Сборка (ошибки только в App.tsx до Task 11)**

Run: `npx tsc -b --pretty false 2>&1 | grep StatusBar || echo "StatusBar OK"`
Expected: `StatusBar OK`.

- [ ] **Step 3: Коммит**

```bash
git add src/components/StatusBar.tsx src/index.css
git commit -m "feat(ui): StatusBar показывает вкладки чатов; статус — отдельной строкой"
```

---

## Task 10: `AnswerPanel` → лента диалога

**Files:**
- Modify: `src/components/AnswerPanel.tsx` (полная переработка)

- [ ] **Step 1: Переработать в ленту сообщений**

Замени содержимое `src/components/AnswerPanel.tsx` на:

```tsx
import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { openExternal } from "@/ipc/commands";
import type { ChatMessage } from "@/lib/chats";
import { cn } from "@/lib/utils";

export interface AnswerPanelProps {
  messages: ChatMessage[];
  /** Текущий in-flight ответ (если идёт стрим активного чата), иначе null. */
  partial: string | null;
  streaming: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
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

function Assistant({ text }: { text: string }) {
  return (
    <div className="prose-answer text-[13.5px] leading-relaxed text-foreground/90">
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </Markdown>
    </div>
  );
}

export function AnswerPanel({
  messages,
  partial,
  streaming,
  expanded,
  onToggle,
  onCopy,
}: AnswerPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, partial, expanded]);

  const empty = messages.length === 0 && !partial;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const canCopy = expanded && !streaming && lastAssistant !== undefined;

  return (
    <section className="flex-1 min-h-0 flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-primary hover:brightness-125"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
          Диалог
        </button>
        <span className="flex-1 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" aria-hidden />
        {canCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Копировать
          </button>
        )}
      </div>

      {expanded && (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1.5 flex flex-col gap-3">
          {empty ? (
            <div className="h-full grid place-items-center">
              <span className="text-[13px] text-muted-foreground">Диалог появится здесь</span>
            </div>
          ) : (
            <>
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div
                    key={i}
                    className="self-end max-w-[85%] rounded-lg bg-white/5 px-3 py-1.5 text-[13px] text-foreground/80 whitespace-pre-wrap break-words"
                  >
                    {m.text}
                  </div>
                ) : (
                  <Assistant key={i} text={m.text} />
                ),
              )}
              {partial !== null && partial !== "" && <Assistant text={partial} />}
            </>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Сборка (ошибки только в App.tsx)**

Run: `npx tsc -b --pretty false 2>&1 | grep AnswerPanel || echo "AnswerPanel OK"`
Expected: `AnswerPanel OK`.

- [ ] **Step 3: Коммит**

```bash
git add src/components/AnswerPanel.tsx
git commit -m "feat(ui): AnswerPanel рендерит ленту диалога (user/assistant)"
```

---

## Task 11: Связывание в `App.tsx`

**Files:**
- Modify: `src/App.tsx` (полная переработка композиции)

- [ ] **Step 1: Переписать `App.tsx`**

Замени содержимое `src/App.tsx` на:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "@/components/StatusBar";
import { ChatTabs } from "@/components/ChatTabs";
import { PermissionBanner } from "@/components/PermissionBanner";
import { Composer } from "@/components/Composer";
import { AnswerPanel } from "@/components/AnswerPanel";
import { SettingsDialog } from "@/components/SettingsDialog";
import { HotkeyHints } from "@/components/HotkeyHints";
import { useSettings } from "@/hooks/useSettings";
import { useRecorder } from "@/hooks/useRecorder";
import { useTranscription } from "@/hooks/useTranscription";
import { useClaudeStream } from "@/hooks/useClaudeStream";
import { useChats } from "@/hooks/useChats";
import { useWindowControls } from "@/hooks/useWindowControls";
import { usePttSuspend } from "@/hooks/usePttSuspend";
import {
  captureAvailable,
  openAudioPermissionSettings,
  retryTranscription,
  setWindowHeight,
} from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import { isTauri } from "@/ipc/env";
import type { ChatMessageDto } from "@/ipc/types";

const RETRYABLE = /перегружен|соединение|VPN|интернет|оборван/i;

const COMPACT_HEIGHT = 290;
const FULL_HEIGHT = 660;

export default function App() {
  const { settings, save } = useSettings();
  const state = useRecorder();
  const chats = useChats();
  const stream = useClaudeStream(chats.appendAssistantMessage);

  const [sttError, setSttError] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const [permissionOk, setPermissionOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);

  const active = chats.active;
  const activeId = chats.activeId;
  const activeStreaming = !!stream.streaming[activeId];

  // Свежие значения для стабильных колбэков (PTT/транскрипция/подписки).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const streamRef = useRef(stream);
  streamRef.current = stream;

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

  const doSend = useCallback(() => dispatchSend(chatsRef.current.active.draft), [dispatchSend]);

  // Авто-раскрытие при появлении контента в активном чате (стрим/история).
  const hasContent = active.messages.length > 0 || activeStreaming;
  const prevEmpty = useRef(true);
  useEffect(() => {
    if (hasContent && prevEmpty.current) setAnswerOpen(true);
    prevEmpty.current = !hasContent;
  }, [hasContent]);

  // При переключении чата панель раскрыта, если в нём есть переписка.
  useEffect(() => {
    setAnswerOpen(active.messages.length > 0 || !!stream.streaming[activeId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Высота окна следует за состоянием панели.
  useEffect(() => {
    void setWindowHeight(answerOpen ? FULL_HEIGHT : COMPACT_HEIGHT);
  }, [answerOpen]);

  useTranscription(
    useCallback((incoming: string) => {
      const c = chatsRef.current.active;
      chatsRef.current.setDraft(c.id, incoming, c.draftAttachments);
      setSttError(null);
      setShowRetry(false);
      if (settingsRef.current.auto_send) dispatchSend(incoming);
    }, [dispatchSend]),
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

  useWindowControls(settings.move_step, doSend);
  usePttSuspend();

  useEffect(() => {
    void captureAvailable().then((ok) => setPermissionOk(ok));
  }, []);

  useEffect(() => {
    if (isTauri()) return;
    chatsRef.current.setDraft(
      chatsRef.current.active.id,
      "Объясни, чем хвостовая рекурсия отличается от обычной.",
      [],
    );
  }, []);

  const onRetry = () => {
    setShowRetry(false);
    void retryTranscription();
  };

  const partial = activeStreaming ? (stream.partial[activeId] ?? "") : null;

  return (
    <div className="app-shell relative flex flex-col gap-3 h-screen p-4 rounded-[22px] overflow-hidden">
      {!permissionOk && <PermissionBanner onOpenSettings={() => void openAudioPermissionSettings()} />}

      <StatusBar
        state={state}
        error={error}
        hotkey={settings.hotkey}
        onOpenSettings={() => setSettingsOpen(true)}
        tabs={
          <ChatTabs
            chats={chats.chats}
            activeId={activeId}
            streaming={stream.streaming}
            onSelect={chats.selectChat}
            onRemove={chats.removeChat}
            onNew={chats.newChat}
          />
        }
      />

      <Composer
        value={active.draft}
        onChange={(v) => chats.setDraft(activeId, v, active.draftAttachments)}
        attachments={active.draftAttachments}
        onRemoveAttachment={(i) => chats.removeDraftAttachment(activeId, i)}
        onPaste={(items) => void chats.addDraftAttachments(activeId, items)}
        onSend={doSend}
        onStop={() => stream.stop(activeId)}
        onClear={() => chats.setDraft(activeId, "", [])}
        onRetry={onRetry}
        hotkey={settings.hotkey}
        streaming={activeStreaming}
        showRetry={showRetry}
      />

      <AnswerPanel
        messages={active.messages}
        partial={partial}
        streaming={activeStreaming}
        expanded={answerOpen}
        onToggle={() => setAnswerOpen((o) => !o)}
        onCopy={() => {
          const last = [...active.messages].reverse().find((m) => m.role === "assistant");
          if (last) void navigator.clipboard.writeText(last.text);
        }}
      />

      <HotkeyHints hotkey={settings.hotkey} />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
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

- [ ] **Step 2: Полная проверка типов и сборка фронта**

Run: `npm run build`
Expected: PASS (нет ошибок типов; `Composer` принимает те же пропсы — `value/onChange/attachments/onRemoveAttachment/onPaste/onSend/onStop/onClear/onRetry/hotkey/streaming/showRetry`).
Если `tsc` ругнётся на неиспользуемый импорт в `src/ipc/commands.ts` (`ImagePayload`) — убери его из импорта там.

- [ ] **Step 3: Прогнать все фронт-тесты**

Run: `npx vitest run`
Expected: PASS (включая `composer`, `useSettings`, `useChats`, `useClaudeStream`, `chats`).

- [ ] **Step 4: Коммит**

```bash
git add src/App.tsx src/ipc/commands.ts
git commit -m "feat(app): связывание множественных чатов (вкладки, лента, per-chat стрим)"
```

---

## Task 12: Документация и ручная проверка

**Files:**
- Modify: `CLAUDE.md` (раздел инвариантов и архитектуры)

- [ ] **Step 1: Обновить CLAUDE.md**

В `CLAUDE.md` в разделе «The Rust ⇄ frontend contract» в перечне событий замени строку про события на:

```
- **Events** are `app.emit("name", payload)` in `lib.rs`; the frontend listens via `src/ipc/events.ts`, typed by `EventMap` in `src/ipc/types.ts` (`state-changed`, `transcript-ready`, `stt-error`, `llm-delta`, `llm-done`, `llm-error`). LLM-события несут `chatId` (`{ chatId, delta }` / `{ chatId }` / `{ chatId, message }`) — стримы независимы по чатам.
```

В разделе «Non-obvious invariants» добавь пункт:

```
- **Чаты независимы и параллельны.** Источник истины — фронт (`useChats`: `Chat[]` + `activeId`); Rust хранит чаты как непрозрачную JSON-строку в `chats.json` (атомарно, `0600`, модуль `chats.rs`, команды `load_chats`/`save_chats`). `send_to_claude(messages, chat_id)` шлёт всю историю чата; отмена по-чатная через `Mutex<HashMap<chat_id, CancellationToken>>`. Картинки в `chats.json` не сохраняются (стрипаются в `serializeChats`). Лимит — `CHAT_LIMIT = 6`.
```

В разделе «Frontend architecture» в списке хуков замени `useAttachments` на `useChats` (он поглотил логику вложений) и упомяни `lib/chats.ts`.

- [ ] **Step 2: Полная проверка обеих сторон**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib && npx vitest run && npm run build`
Expected: всё зелёное.

- [ ] **Step 3: Ручная проверка в реальном приложении**

Run: `npm run tauri dev`

Проверь сценарии:
1. Стартует один чат; задаёшь вопрос → ответ стримится, авто-раскрытие панели.
2. Задаёшь дозапрос → Claude помнит контекст (история шлётся).
3. `＋` создаёт новый чат (пустой, окно сжимается); во вкладке прежнего — переписка на месте при возврате.
4. Запускаешь генерацию в чате A, переключаешься на B, шлёшь вопрос в B — оба стримятся; на вкладке A индикатор-точка; вернувшись в A, видишь дописанный ответ.
5. Наведение на вкладку → крестик; удаление активного переключает на соседний; последний чат удалить нельзя.
6. Лимит: 6-я вкладка — `＋` гаснет.
7. Перезапуск (`Cmd+Q`, снова `npm run tauri dev`) → чаты и переписка на месте; картинки в истории отсутствуют (ожидаемо), текст есть.

- [ ] **Step 4: Финальный коммит**

```bash
git add CLAUDE.md
git commit -m "docs: множественные чаты — события с chatId, chats.json, инварианты"
```

---

## Self-review (выполнено при написании плана)

**Покрытие спеки:**
- Многоходовой диалог с памятью → Task 1 (history в API), Task 6 (история на фронте), Task 11 (склейка истории при отправке). ✓
- Параллельные независимые стримы с `chatId` → Task 3 (бэкенд), Task 7 (фронт). ✓
- Вкладки в верхней строке, лимит 6, удаление/тултип → Task 8/9. ✓
- Лента диалога → Task 10. ✓
- Персистентность `chats.json`, атомарно 0600, стрип картинок → Task 2 (Rust), Task 5 (сериализация), Task 6 (load/save с дебаунсом). ✓
- IPC 1:1 → Task 4. ✓
- Тесты (useChats, useClaudeStream, build_request_body, сериализация) → Task 1/5/6/7. ✓
- Вне рамок (переименование/поиск/сохранение картинок) — не реализуется. ✓

**Согласованность типов:** `ChatMessage` (Rust `llm::ChatMessage` ↔ TS `ChatMessage` в `lib/chats.ts` ↔ `ChatMessageDto` в ipc) — поля `role/text/images` совпадают. События `{ chatId, delta }`/`{ chatId }`/`{ chatId, message }` совпадают между Rust-структурами (camelCase) и `EventMap`. `useClaudeStream(onComplete)` ↔ `chats.appendAssistantMessage(id, text)` — сигнатура совпадает. `Attachment` определён в `lib/composer.ts`, потребляется в `lib/chats.ts`/`useChats`/`ChatTabs`/`AnswerPanel`/`App`.

**Плейсхолдеров нет.**
