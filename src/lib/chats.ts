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
  return crypto.randomUUID();
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
