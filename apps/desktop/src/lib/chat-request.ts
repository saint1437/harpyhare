import type { ChatMessageDto, ImagePayload } from "@/ipc/types";
import {
  attachmentImage,
  type Chat,
  type ChatImage,
  type ChatMessage,
  type ChatWithoutDraft,
} from "./chats";
import { libraryContextBlocks, type ContextLibrary } from "./context-library";
import { presetText, type PromptPreset } from "./presets";

/** PROMPT CONTENT — see the note on `LIBRARY_CONTEXT_BLOCK_HEADER`. */
const USER_CONTEXT_SYSTEM_HEADER = "Контекст от пользователя (справочные материалы):\n";
const SYSTEM_BLOCKS_SEPARATOR = "\n\n";

/** The bytes never travel with the id: the API takes the image itself. */
export function requestImages(images: ChatImage[]): ImagePayload[] {
  return images.map(({ media_type, data }) => ({ media_type, data }));
}

export function requestMessages(messages: ChatMessage[]): ChatMessageDto[] {
  return messages.map((m) => ({ role: m.role, text: m.text, images: requestImages(m.images) }));
}

export function draftImages(chat: Chat): ChatImage[] {
  return chat.draftAttachments.map(attachmentImage);
}

/**
 * The Anthropic API is stateless, so the whole history goes out on every
 * request — the message being sent is not in `chat.messages` yet, because the
 * state update and the request are dispatched together.
 */
export function historyWithNewUserMessage(
  chat: Pick<Chat, "messages">,
  text: string,
  images: ChatImage[],
): ChatMessageDto[] {
  return [...requestMessages(chat.messages), { role: "user", text, images: requestImages(images) }];
}

/**
 * The system prompt is assembled here, not stored: the pre-prompt, then the
 * selected library materials, then the chat's own context. An empty part is
 * dropped rather than contributing a blank paragraph.
 */
export function chatSystemPrompt(
  presets: PromptPreset[],
  chat: ChatWithoutDraft,
  library: ContextLibrary,
): string {
  const context = chat.context.trim();
  return [
    presetText(presets, chat.presetId),
    ...libraryContextBlocks(library, chat.libraryDocIds),
    context === "" ? "" : `${USER_CONTEXT_SYSTEM_HEADER}${context}`,
  ]
    .filter((s) => s !== "")
    .join(SYSTEM_BLOCKS_SEPARATOR);
}
