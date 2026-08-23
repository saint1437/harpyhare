import { type Attachment, type ImagePayload, imageDataUrl } from "@/lib/composer";
import { DEFAULT_MODEL } from "@/lib/models";

export const CHAT_LIMIT = 6;
const TITLE_MAX = 22;
const TITLE_ELLIPSIS = "…";
const UNTITLED_CHAT_TITLE = "Чат";
const NO_PRESET_ID = "";

export type Role = "user" | "assistant";

export const NOT_PERSISTED_IMAGE_ID = "";

export interface ChatImage extends ImagePayload {
  id: string;
}

interface StoredImageRef {
  id: string;
  media_type: string;
}

export interface ChatMessage {
  role: Role;
  text: string;
  images: ChatImage[];
}

export interface RequestOptions {
  thinking: boolean;
  webSearch: boolean;
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

export function createChatFrom(source: Chat, index: number, id: string = uid()): Chat {
  return {
    ...createChat(index, id),
    presetId: source.presetId,
    thinkingEnabled: source.thinkingEnabled,
    model: source.model,
    webSearch: source.webSearch,
    context: source.context,
    libraryDocIds: [...source.libraryDocIds],
  };
}

export type ChatPatch = Partial<
  Pick<
    Chat,
    | "draft"
    | "draftAttachments"
    | "presetId"
    | "thinkingEnabled"
    | "model"
    | "webSearch"
    | "context"
    | "libraryDocIds"
    | "lastInputTokens"
  >
>;

export function chatRequestOptions(chat: Chat): RequestOptions {
  return { thinking: chat.thinkingEnabled, webSearch: chat.webSearch };
}

export function chatTitle(firstUserText: string, index: number): string {
  const trimmed = firstUserText.trim();
  if (trimmed === "") return indexedChatTitle(index);
  return trimmed.length > TITLE_MAX ? `${trimmed.slice(0, TITLE_MAX)}${TITLE_ELLIPSIS}` : trimmed;
}

export function serializeChats(chats: Chat[]): string {
  const withImageRefs = chats.map((c) => ({
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
    messages: c.messages.map((m) => ({
      role: m.role,
      text: m.text,
      images: m.images.filter(isPersisted).map(imageRef),
    })),
    draft: c.draft,
    draftAttachments: c.draftAttachments.map(attachmentImage).filter(isPersisted).map(imageRef),
  }));
  return JSON.stringify(withImageRefs);
}

function isPersisted(image: ChatImage): boolean {
  return image.id !== NOT_PERSISTED_IMAGE_ID;
}

function imageRef(image: ChatImage): StoredImageRef {
  return { id: image.id, media_type: image.media_type };
}

export function attachmentImage(attachment: Attachment): ChatImage {
  return { ...attachment.payload, id: attachment.id };
}

function restoreImages(raw: unknown): ChatImage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    const o = value as Partial<StoredImageRef>;
    if (typeof o.id !== "string" || o.id === NOT_PERSISTED_IMAGE_ID) return [];
    if (typeof o.media_type !== "string") return [];
    return [{ id: o.id, media_type: o.media_type, data: "" }];
  });
}

function restoreMessage(m: ChatMessage): ChatMessage {
  return {
    role: m.role === "assistant" ? "assistant" : "user",
    text: typeof m.text === "string" ? m.text : "",
    images: restoreImages(m.images),
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
    draftAttachments: restoreImages(o.draftAttachments).map(pendingAttachment),
  };
}

function imagePayload(image: ChatImage): ImagePayload {
  return { media_type: image.media_type, data: image.data };
}

function pendingAttachment(image: ChatImage): Attachment {
  return { id: image.id, payload: imagePayload(image), preview: "" };
}

export function chatImageIds(chats: Chat[]): string[] {
  const ids = new Set<string>();
  for (const chat of chats) {
    for (const message of chat.messages) {
      for (const image of message.images) ids.add(image.id);
    }
    for (const attachment of chat.draftAttachments) ids.add(attachment.id);
  }
  ids.delete(NOT_PERSISTED_IMAGE_ID);
  return [...ids];
}

export function hydrateChatImages(chats: Chat[], dataById: Map<string, string>): Chat[] {
  return chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((m) => ({ ...m, images: withStoredData(m.images, dataById) })),
    draftAttachments: withStoredData(chat.draftAttachments.map(attachmentImage), dataById).map(
      (image) => ({ id: image.id, payload: imagePayload(image), preview: imageDataUrl(image) }),
    ),
  }));
}

function withStoredData(images: ChatImage[], dataById: Map<string, string>): ChatImage[] {
  return images.flatMap((image) => {
    if (image.data !== "") return [image];
    const data = dataById.get(image.id);
    return data === undefined ? [] : [{ ...image, data }];
  });
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
