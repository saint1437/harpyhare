# Per-chat препромпт через управляемые пресеты — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить глобальный `system_prompt` на управляемые пресеты (CRUD в настройках) + per-chat выбор через `Select` рядом с «Отправить»; `system` берётся из пресета чата и шлётся в каждом запросе (спека: `docs/superpowers/specs/2026-06-11-per-chat-prompt-presets-design.md`).

**Architecture:** `Settings.system_prompt` → `prompt_presets: {id,name,text}[]` (сид «Расшифровка речи», id `transcription`). `Chat.presetId` ссылается на пресет. Текст резолвится на фронте (`presetText`) и передаётся в `send_to_claude(messages, chatId, system)`; Rust больше не читает system из настроек. Anthropic API stateless — system уходит в каждом запросе.

**Tech Stack:** Tauri 2, React 19 (shadcn Select/Input/Textarea), serde, cargo test, vitest.

**Порядок коммитов (важно):** Task 1 (Rust контракт+send-path) — фронт пока шлёт без `system` (рантайм-разрыв до Task 4, сборка зелёная). Task 2 (TS контракт + `lib/presets` + Settings UI). Task 3 (Chat.presetId + useChats). Task 4 (send-path фронта + Composer select — фича работает end-to-end). Task 5 (доки). Каждый коммит зелёный по сборке. Rust-проверки гонять руками (`export PATH="$HOME/.cargo/bin:$PATH"`).

---

### Task 1: Rust — `prompt_presets` в Settings + `system`-параметр в `send_to_claude`

**Files:**
- Modify: `src-tauri/src/settings.rs` (PromptPreset, поле, Default, тесты)
- Modify: `src-tauri/src/lib.rs` (`send_to_claude` сигнатура)

- [ ] **Step 1: Расширить тесты (падающие)**

В `src-tauri/src/settings.rs`, в `defaults_match_spec` заменить строку `assert!(s.system_prompt.contains("расшифровку"));` на:

```rust
        assert_eq!(s.prompt_presets.len(), 1);
        assert_eq!(s.prompt_presets[0].id, "transcription");
        assert!(s.prompt_presets[0].text.contains("расшифровку"));
```

В `save_load_roundtrip_with_600_perms` после `s.toggle_hotkey = "F10".into();` добавить:

```rust
        s.prompt_presets = vec![test_preset()];
```

(где `test_preset` — хелпер, определяемый ниже в этом же `mod tests`) и после `assert_eq!(loaded.toggle_hotkey, "F10");`:

```rust
        assert_eq!(loaded.prompt_presets.len(), 1);
        assert_eq!(loaded.prompt_presets[0].name, "Тест");
```

В блок `mod tests` добавить хелпер и два новых теста:

```rust
    fn test_preset() -> PromptPreset {
        PromptPreset { id: "p1".into(), name: "Тест".into(), text: "текст".into() }
    }

    #[test]
    fn load_missing_prompt_presets_defaults_to_seed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"auto_send":true}"#).unwrap();
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.prompt_presets.len(), 1);
        assert_eq!(s.prompt_presets[0].id, "transcription");
    }

    #[test]
    fn load_old_system_prompt_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        std::fs::write(&path, r#"{"system_prompt":"старое","auto_send":false}"#).unwrap();
        // неизвестное поле system_prompt не ломает разбор; пресеты — из сида
        let s = Settings::load(&path).unwrap();
        assert_eq!(s.prompt_presets[0].id, "transcription");
    }
```

Поскольку `test_preset` использует `PromptPreset` (определяется в Step 2), тест-модуль уже ссылается на `super::*`.

- [ ] **Step 2: Убедиться, что cargo-тесты падают (нет типа/поля)**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test --manifest-path src-tauri/Cargo.toml --lib settings`
Expected: FAIL — `cannot find type 'PromptPreset'` / `no field 'prompt_presets'`.

- [ ] **Step 3: Добавить тип `PromptPreset`, заменить поле, обновить Default**

В `src-tauri/src/settings.rs`, перед `pub struct Settings`, добавить:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptPreset {
    pub id: String,
    pub name: String,
    pub text: String,
}
```

В struct `Settings` заменить строку `pub system_prompt: String,` на:

```rust
    pub prompt_presets: Vec<PromptPreset>,
```

В `impl Default` заменить строку `system_prompt: DEFAULT_SYSTEM_PROMPT.into(),` на:

```rust
            prompt_presets: vec![PromptPreset {
                id: "transcription".into(),
                name: "Расшифровка речи".into(),
                text: DEFAULT_SYSTEM_PROMPT.into(),
            }],
```

(`DEFAULT_SYSTEM_PROMPT` константа остаётся — её теперь использует только сид. `clamp()` пресеты не трогает.)

- [ ] **Step 4: Прогнать cargo-тесты**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo test --manifest-path src-tauri/Cargo.toml --lib settings`
Expected: PASS (включая новые тесты).

- [ ] **Step 5: `send_to_claude` берёт `system` из параметра**

В `src-tauri/src/lib.rs` найти начало команды:

```rust
#[tauri::command]
async fn send_to_claude(app: AppHandle, messages: Vec<llm::ChatMessage>, chat_id: String) {
    let (model, system) = {
        let s = app.state::<App>();
        let s = s.settings.lock().unwrap();
        (s.model.clone(), s.system_prompt.clone())
    };
```

и заменить на:

```rust
#[tauri::command]
async fn send_to_claude(
    app: AppHandle,
    messages: Vec<llm::ChatMessage>,
    chat_id: String,
    system: String,
) {
    let model = {
        let s = app.state::<App>();
        let s = s.settings.lock().unwrap();
        s.model.clone()
    };
```

(Дальше по телу `build_request_body(&model, &system, &messages)` уже использует `system` — теперь это параметр. Больше ничего в теле менять не нужно.)

- [ ] **Step 6: Проверки**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo clippy --manifest-path src-tauri/Cargo.toml --lib && cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: компиляция без ошибок; clippy без warnings; тесты зелёные. (Фронт пока зовёт `send_to_claude` без `system` — это исправит Task 4; сборка фронта не затронута.)

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/settings.rs src-tauri/src/lib.rs
git commit -m "feat(rust): prompt_presets в Settings + system-параметр send_to_claude"
```

---

### Task 2: Frontend контракт — `lib/presets`, types.ts, Settings UI

**Files:**
- Create: `src/lib/presets.ts`, `src/lib/presets.test.ts`
- Modify: `src/ipc/types.ts`
- Modify: `src/components/SettingsDialog.tsx`

- [ ] **Step 1: Падающий тест `presetText`**

```ts
// src/lib/presets.test.ts
import { describe, expect, it } from "vitest";
import { presetText, type PromptPreset } from "./presets";

const presets: PromptPreset[] = [
  { id: "a", name: "A", text: "текст-A" },
  { id: "b", name: "B", text: "текст-B" },
];

describe("presetText", () => {
  it("возвращает текст пресета по id", () => {
    expect(presetText(presets, "b")).toBe("текст-B");
  });
  it("неизвестный id → пустая строка", () => {
    expect(presetText(presets, "zzz")).toBe("");
  });
  it("пустой presetId → пустая строка", () => {
    expect(presetText(presets, "")).toBe("");
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/lib/presets.test.ts`
Expected: FAIL — `Cannot find module './presets'`.

- [ ] **Step 3: Реализовать `lib/presets.ts`**

```ts
// src/lib/presets.ts
/** id засиженного пресета «Расшифровка речи» — общий для Rust-сида, дефолта чата и TS. */
export const TRANSCRIPTION_PRESET_ID = "transcription";

export interface PromptPreset {
  id: string;
  name: string;
  text: string;
}

/** Текст пресета по id; неизвестный/пустой id → "" (без препромпта). */
export function presetText(presets: PromptPreset[], presetId: string): string {
  return presets.find((p) => p.id === presetId)?.text ?? "";
}
```

- [ ] **Step 4: Прогнать тест**

Run: `npx vitest run src/lib/presets.test.ts`
Expected: PASS, 3 passed.

- [ ] **Step 5: Обновить `types.ts` — заменить `system_prompt` на `prompt_presets`**

В `src/ipc/types.ts`:

Добавить импорт (после `import type { ImagePayload }`):

```ts
import { type PromptPreset, TRANSCRIPTION_PRESET_ID } from "@/lib/presets";
```

И реэкспорт рядом с `export type { ImagePayload };`:

```ts
export type { PromptPreset };
```

В `interface Settings` заменить `system_prompt: string;` на:

```ts
  prompt_presets: PromptPreset[];
```

В `DEFAULT_SETTINGS` заменить `system_prompt: "",` на:

```ts
  prompt_presets: [
    { id: TRANSCRIPTION_PRESET_ID, name: "Расшифровка речи", text: "" },
  ],
```

(Текст пустой намеренно — рантайм берёт реальный из `get_settings` (Rust), заглушка только для браузерного мока; так же было с `system_prompt: ""`.)

- [ ] **Step 6: Settings UI — убрать Textarea, добавить CRUD пресетов**

В `src/components/SettingsDialog.tsx`:

(а) Удалить блок поля «Системный промпт»:

```tsx
          <Field label="Системный промпт">
            <Textarea
              rows={3}
              value={draft.system_prompt}
              onChange={(e) => {
                set("system_prompt", e.target.value);
              }}
            />
          </Field>
```

(б) Вставить на его место менеджер пресетов:

```tsx
          <Field label="Пресеты препромпта">
            <div className="grid gap-2">
              {draft.prompt_presets.map((p, i) => (
                <div key={p.id} className="grid gap-1.5 rounded-md bg-white/5 p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Имя"
                      value={p.name}
                      onChange={(e) => {
                        updatePreset(i, { name: e.target.value });
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        removePreset(i);
                      }}
                    >
                      Удалить
                    </Button>
                  </div>
                  <Textarea
                    rows={3}
                    placeholder="Текст препромпта"
                    value={p.text}
                    onChange={(e) => {
                      updatePreset(i, { text: e.target.value });
                    }}
                  />
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addPreset}>
                + Добавить пресет
              </Button>
            </div>
          </Field>
```

(в) Добавить хелперы и нормализацию. Найти существующий `set`-хелпер:

```tsx
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };
```

и добавить **после** него:

```tsx
  const updatePreset = (index: number, patch: Partial<PromptPreset>) => {
    setDraft((d) => ({
      ...d,
      prompt_presets: d.prompt_presets.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  };
  const addPreset = () => {
    setDraft((d) => ({
      ...d,
      prompt_presets: [...d.prompt_presets, { id: crypto.randomUUID(), name: "", text: "" }],
    }));
  };
  const removePreset = (index: number) => {
    setDraft((d) => ({
      ...d,
      prompt_presets: d.prompt_presets.filter((_, i) => i !== index),
    }));
  };
```

(г) В обработчике сохранения выкинуть пустые пресеты. Найти:

```tsx
  const save = () => {
    onSave({
      ...draft,
      hotkey: draft.hotkey.trim() || "V",
      toggle_hotkey: draft.toggle_hotkey.trim() || "Cmd+Shift+H",
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
      prompt_presets: draft.prompt_presets.filter(
        (p) => p.name.trim() !== "" || p.text.trim() !== "",
      ),
    });
  };
```

(д) Добавить импорт типа в начало файла (рядом с `import { MODELS, type Settings } from "@/ipc/types";`):

```tsx
import type { PromptPreset } from "@/lib/presets";
```

(`Textarea` уже импортирован и продолжает использоваться в пресетах — оставить импорт. `Input`, `Button` уже импортированы.)

- [ ] **Step 7: Проверки**

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное. (`commands.test.ts` сравнивает `getSettings()` с `DEFAULT_SETTINGS` — обе стороны обновлены, проходит.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/presets.ts src/lib/presets.test.ts src/ipc/types.ts src/components/SettingsDialog.tsx
git commit -m "feat: lib/presets + prompt_presets в контракте + CRUD пресетов в настройках"
```

---

### Task 3: `Chat.presetId` + `useChats.setChatPreset`

**Files:**
- Modify: `src/lib/chats.ts`, `src/lib/chats.test.ts`
- Modify: `src/hooks/useChats.ts`, `src/hooks/useChats.test.ts`

- [ ] **Step 1: Падающие правки тестов**

В `src/lib/chats.test.ts`, в хелпере `chatWith`, добавить `presetId` в базовый объект (после `titlePinned: false,`):

```ts
    presetId: "transcription",
```

Добавить тест в блок `serialize/deserialize` (после теста про `titlePinned`):

```ts
  it("сохраняет presetId при round-trip; старый json без него → ''", () => {
    const chats = [chatWith([], { presetId: "abc" })];
    expect(deserializeChats(serializeChats(chats))?.[0]?.presetId).toBe("abc");
    const old = deserializeChats('[{"id":"a","title":"Чат 1","messages":[],"draft":""}]');
    expect(old?.[0]?.presetId).toBe("");
  });
```

В `src/hooks/useChats.test.ts` добавить тест (после теста `renameChat игнорирует пустое имя`):

```ts
  it("новый чат ссылается на сид-пресет; setChatPreset меняет ссылку", async () => {
    const { result } = renderHook(() => useChats());
    await waitFor(() => {
      expect(result.current.chats.length).toBe(1);
    });
    expect(result.current.active.presetId).toBe("transcription");
    const id = result.current.activeId;
    act(() => {
      result.current.setChatPreset(id, "mypreset");
    });
    expect(result.current.active.presetId).toBe("mypreset");
  });
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npx vitest run src/lib/chats.test.ts src/hooks/useChats.test.ts`
Expected: FAIL (нет `presetId` в `Chat`, нет `setChatPreset`).

- [ ] **Step 3: `Chat.presetId` в `lib/chats.ts`**

В `src/lib/chats.ts` добавить импорт (после `import type { Attachment, ImagePayload }`):

```ts
import { TRANSCRIPTION_PRESET_ID } from "@/lib/presets";
```

В `interface Chat` после `titlePinned: boolean;` добавить:

```ts
  /** id выбранного пресета препромпта ("" = без препромпта). */
  presetId: string;
```

В `createChat` добавить `presetId` (после `titlePinned: false,`):

```ts
    presetId: TRANSCRIPTION_PRESET_ID,
```

В `serializeChats` (в объекте `stripped`) после `titlePinned: c.titlePinned,` добавить:

```ts
    presetId: c.presetId,
```

В `deserializeChats` (в возвращаемом объекте) после строки `titlePinned: ...` добавить:

```ts
      presetId: typeof o.presetId === "string" ? o.presetId : "",
```

- [ ] **Step 4: `setChatPreset` в `useChats.ts`**

В `src/hooks/useChats.ts`:

В `EMPTY_CHAT` добавить `presetId: ""` (после `titlePinned: false,`):

```ts
  presetId: "",
```

В `ChatsApi` после `renameChat: (id: string, title: string) => void;` добавить:

```ts
  setChatPreset: (id: string, presetId: string) => void;
```

После `renameChat` (колбэка) добавить:

```ts
  const setChatPreset = useCallback(
    (id: string, presetId: string) => {
      patch(id, (c) => ({ ...c, presetId }));
    },
    [patch],
  );
```

В возвращаемом объекте после `renameChat,` добавить:

```ts
    setChatPreset,
```

- [ ] **Step 5: Прогнать тесты**

Run: `npx vitest run src/lib/chats.test.ts src/hooks/useChats.test.ts`
Expected: PASS.

- [ ] **Step 6: Общие проверки**

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное.

- [ ] **Step 7: Commit**

```bash
git add src/lib/chats.ts src/lib/chats.test.ts src/hooks/useChats.ts src/hooks/useChats.test.ts
git commit -m "feat: Chat.presetId + useChats.setChatPreset (дефолт — сид-пресет)"
```

---

### Task 4: Путь отправки + `Select` пресета в Composer

**Files:**
- Modify: `src/ipc/commands.ts`, `src/ipc/commands.test.ts`
- Modify: `src/hooks/useClaudeStream.ts`, `src/hooks/useClaudeStream.test.ts`
- Modify: `src/components/Composer.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: ipc `sendToClaude` принимает `system`**

В `src/ipc/commands.ts` заменить:

```ts
export async function sendToClaude(messages: ChatMessageDto[], chatId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("send_to_claude", { messages, chatId });
}
```

на:

```ts
export async function sendToClaude(
  messages: ChatMessageDto[],
  chatId: string,
  system: string,
): Promise<void> {
  if (!isTauri()) return;
  await invoke("send_to_claude", { messages, chatId, system });
}
```

В `src/ipc/commands.test.ts` найти вызов `sendToClaude([{ role: "user", text: "hi", images: [] }], "chat-1")` и добавить третий аргумент `, ""`:

```ts
      sendToClaude([{ role: "user", text: "hi", images: [] }], "chat-1", ""),
```

- [ ] **Step 2: `useClaudeStream.send` принимает `system`**

В `src/hooks/useClaudeStream.ts`:

В `interface ClaudeStreams` заменить:

```ts
  send: (chatId: string, messages: ChatMessageDto[]) => Promise<void>;
```

на:

```ts
  send: (chatId: string, messages: ChatMessageDto[], system: string) => Promise<void>;
```

В реализации `send` заменить сигнатуру и вызов `sendToClaude`:

```ts
  const send = useCallback(
    async (chatId: string, messages: ChatMessageDto[], system: string) => {
```

и `await sendToClaude(messages, chatId);` → `await sendToClaude(messages, chatId, system);`.

В `src/hooks/useClaudeStream.test.ts` во всех вызовах `result.current.send("X", [...])` добавить третий аргумент `, ""`. Их 6 (строки с `result.current.send(`): заменить каждый `[{ role: "user", text: "q", images: [] }])` на `[{ role: "user", text: "q", images: [] }], "")`.

- [ ] **Step 3: Composer — пропсы и `Select`**

В `src/components/Composer.tsx`:

Добавить импорт Select (рядом с импортами ui):

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

В `ComposerProps` после `showRetry: boolean;` добавить:

```tsx
  presets: { id: string; name: string }[];
  presetId: string;
  onPresetChange: (id: string) => void;
```

В ряду действий — найти кнопку «Отправить»:

```tsx
        <Button onClick={props.onSend} disabled={props.streaming}>
          Отправить{" "}
          <kbd className="ml-1.5 rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10.5px]">⌘⏎</kbd>
        </Button>
```

и вставить **перед** ней `Select`:

```tsx
        <Select
          value={
            props.presetId !== "" && props.presets.some((p) => p.id === props.presetId)
              ? props.presetId
              : "none"
          }
          onValueChange={(v) => {
            props.onPresetChange(v === "none" ? "" : v);
          }}
        >
          <SelectTrigger className="h-8 w-[140px] text-[12px]">
            <SelectValue placeholder="Препромпт" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без препромпта</SelectItem>
            {props.presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name || "Без имени"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
```

- [ ] **Step 4: App — резолв `system` и проброс пресетов**

В `src/App.tsx`:

Добавить импорт:

```tsx
import { presetText } from "@/lib/presets";
```

В `dispatchSend` заменить последнюю строку `void streamRef.current.send(c.id, history);` на:

```tsx
    const system = presetText(settingsRef.current.prompt_presets, c.presetId);
    void streamRef.current.send(c.id, history, system);
```

В JSX `<Composer ... />` добавить пропсы (рядом с `showRetry={showRetry}`):

```tsx
        presets={settings.prompt_presets}
        presetId={active.presetId}
        onPresetChange={(id) => {
          chats.setChatPreset(activeId, id);
        }}
```

- [ ] **Step 5: Проверки**

Run: `npm run typecheck && npx vitest run && npm run lint && npm run knip`
Expected: всё зелёное.

Run: `(npm run dev &) ; sleep 4; curl -s "http://localhost:1420/" | head -3; pkill -f vite`
Expected: vite отдаёт страницу. Не оставляй dev-сервер.

- [ ] **Step 6: Commit**

```bash
git add src/ipc/commands.ts src/ipc/commands.test.ts src/hooks/useClaudeStream.ts src/hooks/useClaudeStream.test.ts src/components/Composer.tsx src/App.tsx
git commit -m "feat(ui): Select пресета в Composer + system из пресета в send_to_claude"
```

---

### Task 5: CLAUDE.md + проверки + ручная приёмка

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Обновить CLAUDE.md**

(а) В разделе «The Rust ⇄ frontend contract», найти строку про Settings (10 fields) и обновить состав — заменить:

```
- `Settings` (10 fields) is defined identically in `src-tauri/src/settings.rs` and `src/ipc/types.ts`.
```

на:

```
- `Settings` (10 fields) is defined identically in `src-tauri/src/settings.rs` and `src/ipc/types.ts`. Системного промпта в Settings нет — вместо него `prompt_presets: {id,name,text}[]` (сид «Расшифровка речи», id `transcription`); чат хранит `presetId`, текст резолвится на фронте (`lib/presets.presetText`) и уходит параметром `system` в `send_to_claude` (Anthropic API stateless — system в каждом запросе).
```

(б) В перечне команд/контракта, если упоминается `send_to_claude(messages, chat_id)` — поправить на `send_to_claude(messages, chat_id, system)`. (Если такого упоминания нет — пропустить и отметить в отчёте.)

- [ ] **Step 2: Полный прогон проверок**

Run:
```bash
npm run lint && npm run format:check && npm run typecheck && npm run knip && npx vitest run
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --manifest-path src-tauri/Cargo.toml --lib && cargo clippy --manifest-path src-tauri/Cargo.toml --lib
```
Expected: всё зелёное. (Если `format:check` ругается на `CLAUDE.md` — `npx prettier --write CLAUDE.md`.)

- [ ] **Step 3: Ручная приёмка в Tauri**

Run: `npm run tauri dev`, затем:
1. В настройках поля «Системный промпт» нет; есть «Пресеты препромпта» с сидом «Расшифровка речи». Добавить свой пресет (имя + текст), сохранить, переоткрыть настройки — сохранился.
2. Новый чат: в Composer рядом с «Отправить» Select показывает «Расшифровка речи». Ответ Claude учитывает выбранный промпт.
3. Сменить в Select на свой пресет → следующий ответ учитывает его; «Без препромпта» → пустой system. Выбор переживает перезапуск (per-chat).
4. Удалить пресет в настройках, у которого был выбран чат → в этом чате Select показывает «Без препромпта», ответы без препромпта.
5. Старые `settings.json` (с `system_prompt`) и `chats.json` (без `presetId`) открываются без ошибок: пресеты — сид, чаты — без выбранного пресета (Select «Без препромпта»).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — prompt_presets вместо system_prompt, system-параметр send_to_claude"
```
