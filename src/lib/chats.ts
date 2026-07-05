import type { Attachment, ImagePayload } from "@/lib/composer";
import { DEFAULT_MODEL } from "@/lib/models";
import { TRANSCRIPTION_PRESET_ID } from "@/lib/presets";

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
  /** Заголовок задан вручную (renameChat) — авто-заголовок из первого сообщения его не перезатирает. */
  titlePinned: boolean;
  /** id выбранного пресета препромпта ("" = без препромпта). */
  presetId: string;
  /** Слать ли thinking (adaptive) в Anthropic: true — умнее, false — быстрее первый токен. */
  thinkingEnabled: boolean;
  /** Модель Anthropic этого чата (селект в Composer). */
  model: string;
  /** Server-side веб-поиск Anthropic в ответах этого чата (тумблер в Composer). */
  webSearch: boolean;
  /** Постоянный контекст чата (вакансия/резюме/конспект…) — уходит в system каждого
   *  запроса. Текст, в отличие от картинок, переживает сериализацию на диск. */
  context: string;
}

function uid(): string {
  return crypto.randomUUID();
}

export function createChat(index: number): Chat {
  return {
    id: uid(),
    title: `Чат ${index}`,
    messages: [],
    draft: "",
    draftAttachments: [],
    titlePinned: false,
    presetId: TRANSCRIPTION_PRESET_ID,
    thinkingEnabled: true,
    model: DEFAULT_MODEL,
    webSearch: false,
    context: "",
  };
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
    titlePinned: c.titlePinned,
    presetId: c.presetId,
    thinkingEnabled: c.thinkingEnabled,
    model: c.model,
    webSearch: c.webSearch,
    context: c.context,
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
      titlePinned: typeof o.titlePinned === "boolean" ? o.titlePinned : false,
      presetId: typeof o.presetId === "string" ? o.presetId : "",
      // legacy-чаты без поля ведут себя как раньше (thinking включён)
      thinkingEnabled: typeof o.thinkingEnabled === "boolean" ? o.thinkingEnabled : true,
      model: typeof o.model === "string" && o.model !== "" ? o.model : DEFAULT_MODEL,
      // legacy-чаты без полей: поиск выключен, контекста нет
      webSearch: typeof o.webSearch === "boolean" ? o.webSearch : false,
      context: typeof o.context === "string" ? o.context : "",
      messages: Array.isArray(o.messages)
        ? o.messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            text: typeof m.text === "string" ? m.text : "",
            images: [],
          }))
        : [],
      draft: typeof o.draft === "string" ? o.draft : "",
      draftAttachments: [],
    };
  });
}
