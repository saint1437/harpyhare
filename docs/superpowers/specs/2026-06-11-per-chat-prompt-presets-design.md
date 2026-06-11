# Per-chat препромпт через управляемые пресеты — дизайн

**Дата:** 2026-06-11
**Статус:** утверждён, готов к плану реализации

## Задача

Сейчас системный промпт — глобальный (`Settings.system_prompt`, один на всё приложение, применяется ко всем чатам в `send_to_claude`). Нужно: убрать глобальный промпт; дать **per-chat** выбор препромпта из управляемого списка пресетов; кнопку-`Select` рядом с «Отправить» для выбора; пресеты создаются/редактируются/удаляются в настройках.

**Важно (stateless API):** Anthropic Messages API не хранит состояние — каждый запрос несёт `system` + всю историю `messages`. «Отправить препромпт один раз и чтобы он остался на сервере» невозможно; system передаётся в каждом запросе. Поэтому «per-chat препромпт» = выбран один раз для чата, но резолвится и шлётся как `system` при каждой отправке.

## Решения (зафиксированы в брейншторме)

| Вопрос | Решение |
|---|---|
| Глобальный `system_prompt` | Убрать (поле Settings + Textarea в диалоге) |
| Где живут пресеты | В Settings: новое поле `prompt_presets: { id, name, text }[]`, CRUD в диалоге настроек |
| Как чат хранит выбор | Ссылкой: `Chat.presetId: string` (id пресета; `""` = без препромпта). Правка пресета применяется ко всем чатам с ним; удалённый пресет → чат без препромпта |
| Дефолт нового чата | Сид одного пресета с фиксированным id `"transcription"` (текущий текст промпта расшифровки); `createChat` ставит `presetId = "transcription"` |
| Выбор в чате | `Select` рядом с «Отправить» (опции: все пресеты + «Без препромпта») |
| Резолв текста | На фронте: `presetText(presets, presetId)` → передаётся в `send_to_claude` параметром `system` |

## Текущее состояние (для контекста)

- `settings.rs`: 10 полей, среди них `pub system_prompt: String` (Default = `DEFAULT_SYSTEM_PROMPT` — про расшифровку русской речи). `#[serde(default)]` на struct. Тесты `defaults_match_spec`/`save_load_roundtrip_with_600_perms`/`load_missing_*`.
- `types.ts`: `Settings` (10 полей) + `DEFAULT_SETTINGS` (где `system_prompt: ""` — TS намеренно не дублирует длинный текст; рантайм берёт реальные настройки из `get_settings`).
- `lib.rs` `send_to_claude(app, messages, chat_id)`: читает `(model, system)` из settings; `system = settings.system_prompt`. `build_request_body(model, system, messages)` кладёт `"system": system`.
- `src/ipc/commands.ts` `sendToClaude(messages, chatId)` → invoke `send_to_claude`.
- `useClaudeStream.send(chatId, messages)` → `sendToClaude(messages, chatId)`.
- `App.dispatchSend`: строит `history` (вся переписка) и зовёт `stream.send(c.id, history)`.
- `lib/chats.ts`: `Chat { id, title, messages, draft, draftAttachments, titlePinned }`; `createChat(index)`; `serializeChats`/`deserializeChats`. `useChats`: `newChat`/`setChatPreset` (нет)/`renameChat`/...
- `SettingsDialog.tsx`: `Field «Системный промпт»` с `Textarea` (`draft.system_prompt`). Использует shadcn `Select`, `Input`, `Textarea`, `Button`.
- `Composer.tsx`: ряд действий — «Очистить», (Повторить/Стоп), «Отправить».

## Архитектура

### Тип пресета

`PromptPreset { id: string; name: string; text: string }` — определить идентично в Rust (`settings.rs`) и TS (`types.ts`). Константа фиксированного id сид-пресета: `"transcription"` (литерал в обоих сидах; в TS можно вынести в `TRANSCRIPTION_PRESET_ID` и переиспользовать).

### Settings (Rust + TS)

- Убрать `system_prompt`.
- Добавить `prompt_presets: Vec<PromptPreset>` (Rust) / `prompt_presets: PromptPreset[]` (TS).
- **Rust Default:** `vec![ PromptPreset { id: "transcription", name: "Расшифровка речи", text: DEFAULT_SYSTEM_PROMPT } ]`.
- **TS DEFAULT_SETTINGS:** один пресет с тем же `id`/`name` и коротким текстом-заглушкой (рантайм всё равно берёт реальный из `get_settings`; заглушка — для браузерного мока, как сейчас `system_prompt: ""`).
- `clamp()` пресеты не трогает.
- Миграция: старый ключ `system_prompt` в `settings.json` игнорируется serde; отсутствующий `prompt_presets` → сид из Default.

### Chat (lib/chats.ts)

- Добавить `presetId: string` в `Chat`.
- `createChat(index)` → `presetId: TRANSCRIPTION_PRESET_ID` (новые чаты ссылаются на сид-пресет; бутстрап-чат и кнопка «+» — оба через `createChat`).
- `serializeChats`/`deserializeChats`: включить `presetId` (deserialize: `typeof o.presetId === "string" ? o.presetId : ""`).
- `EMPTY_CHAT`-заглушка в `useChats` — добавить `presetId: ""`.

### useChats

- Метод `setChatPreset(id: string, presetId: string)` — `patch(id, c => ({ ...c, presetId }))`. Добавить в `ChatsApi` + return.

### Резолв и путь отправки

- Чистый помощник `presetText(presets: PromptPreset[], presetId: string): string` (новый файл `src/lib/presets.ts`, под тест): возвращает `text` пресета по id, иначе `""`.
- `App.dispatchSend`: `const system = presetText(settingsRef.current.prompt_presets, c.presetId);` → `streamRef.current.send(c.id, history, system)`.
- `useClaudeStream.send(chatId, messages, system)` (новый параметр) → `sendToClaude(messages, chatId, system)`.
- `commands.ts`: `sendToClaude(messages, chatId, system)` → `invoke("send_to_claude", { messages, chatId, system })`.
- `lib.rs` `send_to_claude(app, messages, chat_id, system: String)`: читать только `model` из settings; `system` — из параметра; `build_request_body(&model, &system, &messages)`. Убрать чтение `settings.system_prompt`.

### UI

- **Composer:** добавить пропсы `presets: { id: string; name: string }[]`, `presetId: string`, `onPresetChange: (id: string) => void`. В ряду действий рядом с «Отправить» — `Select` (опции = «Без препромпта» + все пресеты по имени). **Нюанс Radix/shadcn Select:** item не может иметь пустое `value` — для «Без препромпта» использовать sentinel `"none"`, маппить `presetId===""` ↔ `"none"` на входе/выходе (`onPresetChange(v === "none" ? "" : v)`). `App` передаёт `presets` из настроек, `presetId` активного чата, `onPresetChange={(id) => chats.setChatPreset(activeId, id)}`.
- **SettingsDialog:** удалить `Field «Системный промпт»` (Textarea + `draft.system_prompt`). Добавить менеджер пресетов: для каждого `draft.prompt_presets[i]` — `Input` имени + `Textarea` текста + кнопка «удалить» (по id); кнопка «Добавить пресет» (push `{ id: crypto.randomUUID(), name: "", text: "" }`). Правки идут в `draft.prompt_presets`, сохраняются по «Сохранить» (существующий путь `set_settings`). Нормализация на сохранении: выкинуть пресеты с пустыми `name` И `text` (пустые мусорные строки).

## Поток данных

1. Выбор пресета в Composer → `chats.setChatPreset(activeId, id)` → `Chat.presetId` обновлён (персист в `chats.json`).
2. Отправка → `App.dispatchSend` → `presetText(settings.prompt_presets, activeChat.presetId)` → `system` → `stream.send → sendToClaude → send_to_claude → build_request_body` (`system` в каждом запросе вместе со всей историей).
3. CRUD пресетов в настройках → `set_settings` (персист в `settings.json`); чаты ссылаются по id, текст резолвится при отправке.

## Обработка ошибок и edge-cases

- `presetId` указывает на несуществующий/удалённый пресет → `presetText` возвращает `""` → запрос без `system` (валидно для Anthropic).
- Пустой список пресетов (пользователь удалил все, включая сид) → новые чаты ссылаются на `"transcription"`, которого нет → `""`; Composer-select показывает «Без препромпта». Допустимо.
- Старые `settings.json`/`chats.json` — бесшовная миграция (см. выше).
- Смена пресета влияет на следующую отправку (system резолвится в момент отправки), не задним числом.

## Тестирование

- **vitest:** `presetText` (находит текст по id; неизвестный id → ""; пустой `presetId` → ""); `useChats` — `createChat` ставит `presetId="transcription"`, `setChatPreset` меняет, дебаунс-персист включает `presetId`; `lib/chats` — roundtrip `presetId`, старый json без `presetId` → "". `useClaudeStream`-тест: если он проверяет вызов `sendToClaude`, обновить под новый аргумент `system`.
- **cargo (`settings.rs`):** `defaults_match_spec` — `prompt_presets` содержит пресет с id `"transcription"` и текстом про расшифровку; roundtrip — добавить/прочитать пресеты; `load_missing_prompt_presets_defaults` — старый json без поля → сид; (опц.) старый json с `system_prompt` грузится без ошибки и поле игнорируется. `build_request_body` уже покрыт.
- **Ручная приёмка:** в чате select меняет пресет; ответ учитывает выбранный промпт; CRUD пресетов в настройках сохраняется; новый чат по умолчанию на «Расшифровка речи»; «Без препромпта» → пустой system; удаление пресета → чаты с ним идут без препромпта; старые настройки/чаты открываются без потерь.

## Вне рамок (YAGNI)

- Prompt caching (`cache_control`) для удешевления повторной отправки префикса — отдельная доработка.
- Конфигурируемый «дефолтный пресет для новых чатов» (пока фиксированный `"transcription"`).
- Реордер пресетов, импорт/экспорт, превью токенов.
- Инжект препромпта как сообщения в историю (используем поле `system`, это эффективнее).

## Критерий готовности

- Глобального `system_prompt` в Settings/диалоге нет; есть `prompt_presets` с CRUD в настройках.
- В чате `Select` рядом с «Отправить» выбирает пресет; выбор персистится per-chat; влияет на следующий ответ.
- `system` берётся из выбранного пресета чата и уходит в каждом запросе (stateless); удалённый/пустой → без препромпта.
- Новый чат по умолчанию ссылается на сид-пресет «Расшифровка речи»; поведение из коробки сохранено.
- Бесшовная миграция старых `settings.json`/`chats.json`.
- `Settings` — 10 полей (убрали `system_prompt`, добавили `prompt_presets`), зеркально Rust ↔ TS; CLAUDE.md обновлён.
- `lint`/`typecheck`/`knip`/`format`/vitest/cargo/clippy — зелёные.
