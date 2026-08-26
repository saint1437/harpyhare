import { getDict } from "@/i18n";
import { type Attachment, type ImagePayload, imageDataUrl } from "@/lib/composer";
import { DEFAULT_MODEL } from "@/lib/models";
import { bool, list, nonEmptyStr, num, obj, oneOf, str, type Infer } from "@/lib/schema";

export const CHAT_LIMIT = 6;
const TITLE_MAX = 22;
const TITLE_ELLIPSIS = "…";

const NO_PRESET_ID = "";

export const ROLES = ["user", "assistant"] as const;

export type Role = (typeof ROLES)[number];

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

/**
 * The chat minus the two fields the composer owns. `draft` and
 * `draftAttachments` change on every keystroke and nothing else in the chat
 * does, so everyone who is not the composer — the system prompt, the token
 * projection, the HUD's root — takes this shape instead and stops re-rendering
 * per character. See `state/chats`.
 */
export type ChatWithoutDraft = Omit<Chat, "draft" | "draftAttachments">;

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

/**
 * "Чат 3" / "Chat 3". The stem is read at CREATION time and then stored, so
 * chats made before a language switch keep the name they were given — the same
 * way a chat renamed by its first message keeps it.
 */
function indexedChatTitle(index: number): string {
  return `${getDict().common.chat.untitled} ${index}`;
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

export function chatRequestOptions(chat: ChatWithoutDraft): RequestOptions {
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

/**
 * The on-disk shape, declared once. Its key set is asserted against `Chat` in
 * `chats.test.ts`: thirteen hand-written `typeof` checks used to be the reader,
 * and a field added to `Chat` produced neither a compile error nor a failing
 * test — it simply came back missing after a restart.
 */
const storedImageSchema = obj({ id: str(), media_type: str() });

const storedMessageSchema = obj({
  role: oneOf(ROLES, "user"),
  text: str(),
  images: list(storedImageSchema, (image) => image.id !== NOT_PERSISTED_IMAGE_ID),
});

const storedChatSchema = obj({
  id: str(),
  title: str(""),
  messages: list(storedMessageSchema),
  draft: str(NEW_CHAT_DEFAULTS.draft),
  draftAttachments: list(storedImageSchema, (image) => image.id !== NOT_PERSISTED_IMAGE_ID),
  titlePinned: bool(NEW_CHAT_DEFAULTS.titlePinned),
  presetId: str(NO_PRESET_ID),
  thinkingEnabled: bool(NEW_CHAT_DEFAULTS.thinkingEnabled),
  model: nonEmptyStr(NEW_CHAT_DEFAULTS.model),
  webSearch: bool(NEW_CHAT_DEFAULTS.webSearch),
  context: str(NEW_CHAT_DEFAULTS.context),
  libraryDocIds: list(str(), (id) => id !== ""),
  lastInputTokens: num(0, { min: 0 }),
});

export type StoredChat = Infer<typeof storedChatSchema>;

function pendingImage(ref: StoredImageRef): ChatImage {
  return { id: ref.id, media_type: ref.media_type, data: "" };
}

function restoreChat(raw: unknown): Chat {
  const stored = storedChatSchema.parse(raw);
  return {
    ...stored,
    // A chat with no id cannot be selected, remembered or removed.
    id: stored.id === "" ? uid() : stored.id,
    messages: stored.messages.map((m) => ({ ...m, images: m.images.map(pendingImage) })),
    draftAttachments: stored.draftAttachments.map((ref) => pendingAttachment(pendingImage(ref))),
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
  // The schema's fallback for a missing title is empty, not «Чат»: a default
  // baked into a module-level schema would freeze the locale at import time.
  // The stem is read here instead, once per load, in the current language.
  return raw.map((c, index) => {
    const chat = restoreChat(c);
    return chat.title === "" ? { ...chat, title: indexedChatTitle(index + 1) } : chat;
  });
}
