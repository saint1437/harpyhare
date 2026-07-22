import type { Attachment, ImagePayload } from "@/lib/composer";
import { DEFAULT_MODEL } from "@/lib/models";

export const CHAT_LIMIT = 6;
const TITLE_MAX = 22;
const TITLE_ELLIPSIS = "…";
const UNTITLED_CHAT_TITLE = "Чат";
const NO_PRESET_ID = "";

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
  titlePinned: boolean;
  presetId: string;
  thinkingEnabled: boolean;
  model: string;
  webSearch: boolean;
  context: string;
  libraryDocIds: string[];
  lastInputTokens: number;
}

const NEW_CHAT_DEFAULTS = {
  draft: "",
  titlePinned: false,
  presetId: NO_PRESET_ID,
  thinkingEnabled: false,
  model: DEFAULT_MODEL,
  webSearch: false,
  context: "",
  libraryDocIds: [],
  lastInputTokens: 0,
} satisfies Partial<Chat>;

function uid(): string {
  return crypto.randomUUID();
}

function indexedChatTitle(index: number): string {
  return `${UNTITLED_CHAT_TITLE} ${index}`;
}

export function createChat(index: number, id: string = uid()): Chat {
  return {
    id,
    title: indexedChatTitle(index),
    messages: [],
    draftAttachments: [],
    ...NEW_CHAT_DEFAULTS,
  };
}

export function chatTitle(firstUserText: string, index: number): string {
  const trimmed = firstUserText.trim();
  if (trimmed === "") return indexedChatTitle(index);
  return trimmed.length > TITLE_MAX ? `${trimmed.slice(0, TITLE_MAX)}${TITLE_ELLIPSIS}` : trimmed;
}

export function serializeChats(chats: Chat[]): string {
  const withoutImages = chats.map((c) => ({
    id: c.id,
    title: c.title,
    titlePinned: c.titlePinned,
    presetId: c.presetId,
    thinkingEnabled: c.thinkingEnabled,
    model: c.model,
    webSearch: c.webSearch,
    context: c.context,
    libraryDocIds: c.libraryDocIds,
    lastInputTokens: c.lastInputTokens,
    messages: c.messages.map((m) => ({ role: m.role, text: m.text, images: [] })),
    draft: c.draft,
    draftAttachments: [],
  }));
  return JSON.stringify(withoutImages);
}

function restoreMessage(m: ChatMessage): ChatMessage {
  return {
    role: m.role === "assistant" ? "assistant" : "user",
    text: typeof m.text === "string" ? m.text : "",
    images: [],
  };
}

function restoreChat(c: unknown): Chat {
  const o = c as Partial<Chat>;
  return {
    id: typeof o.id === "string" ? o.id : uid(),
    title: typeof o.title === "string" ? o.title : UNTITLED_CHAT_TITLE,
    titlePinned: typeof o.titlePinned === "boolean" ? o.titlePinned : NEW_CHAT_DEFAULTS.titlePinned,
    presetId: typeof o.presetId === "string" ? o.presetId : NO_PRESET_ID,
    thinkingEnabled:
      typeof o.thinkingEnabled === "boolean"
        ? o.thinkingEnabled
        : NEW_CHAT_DEFAULTS.thinkingEnabled,
    model: typeof o.model === "string" && o.model !== "" ? o.model : NEW_CHAT_DEFAULTS.model,
    webSearch: typeof o.webSearch === "boolean" ? o.webSearch : NEW_CHAT_DEFAULTS.webSearch,
    context: typeof o.context === "string" ? o.context : NEW_CHAT_DEFAULTS.context,
    libraryDocIds: Array.isArray(o.libraryDocIds)
      ? o.libraryDocIds.filter((id): id is string => typeof id === "string")
      : [],
    lastInputTokens:
      typeof o.lastInputTokens === "number" && Number.isFinite(o.lastInputTokens)
        ? Math.max(0, o.lastInputTokens)
        : 0,
    messages: Array.isArray(o.messages) ? o.messages.map(restoreMessage) : [],
    draft: typeof o.draft === "string" ? o.draft : NEW_CHAT_DEFAULTS.draft,
    draftAttachments: [],
  };
}

export function deserializeChats(json: string): Chat[] | null {
  if (json.trim() === "") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map((c) => restoreChat(c));
}
