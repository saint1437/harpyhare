import { useSyncExternalStore } from "react";
import {
  CHAT_LIMIT,
  chatTitle,
  createChat,
  createChatFrom,
  type Chat,
  type ChatImage,
  type ChatMessage,
  type ChatPatch,
  type ChatWithoutDraft,
} from "@/lib/chats";
import { ATTACHMENT_LIMIT, type Attachment } from "@/lib/composer";

/**
 * The chats slice — the second store to leave the HUD's root, and for the same
 * reason as the first (`state/stream`): one field of it changed far more often
 * than the component tree that hung off it.
 *
 * That field is the DRAFT. It lives per chat, so while the chats were a
 * `useState` in `useChats` every keystroke in the composer produced a new
 * `Chat[]`, a new `active` chat and therefore a re-render of the HUD's root —
 * the header, the tabs, the status bar and the message list, to change one
 * string inside one textarea.
 *
 * The cure is not memoisation but selectors. Nothing here hands out "the chats"
 * or "the active chat" as one object; every reader subscribes to the narrowest
 * thing it actually needs, and `useSyncExternalStore` compares what comes back
 * with `Object.is`:
 *
 * - `useActiveDraft` / `useActiveDraftAttachments` — the composer, and nothing
 *   else. These are the only selectors a keystroke changes.
 * - `useActiveChatWithoutDraft` — everyone else's view of the active chat. It is
 *   a CACHED derived object: rebuilt on every publish, but kept by reference
 *   when every field matched, so a keystroke leaves its identity alone.
 * - `useChatTabs` — `{id, title}` per chat, cached the same way, so neither a
 *   keystroke nor a stream delta wakes `ChatTabs`.
 *
 * Persistence is deliberately NOT here (see `hooks/useChatsStorage`): the store
 * is pure state, and everything that touches disk or IPC sits above it. That is
 * also what makes the store testable without a single mock.
 *
 * As in `state/stream`, module scope IS per-window state — the two windows are
 * two React roots that share nothing — and every mutator returns without
 * emitting when nothing actually changed.
 */

export interface ChatsState {
  chats: Chat[];
  /**
   * The chat the UI is on. Empty until the list has been read from disk, and
   * never trusted blindly afterwards: a phantom id (a chat that was removed
   * elsewhere) resolves to the first chat rather than to no chat at all.
   */
  activeId: string;
}

/** What a tab needs, and nothing more. */
export interface ChatTab {
  id: string;
  title: string;
}

const EMPTY_CHATS: Chat[] = [];

/**
 * The chat the selectors resolve to before the first load. It carries a real
 * chat's defaults (so nothing downstream has to cope with missing fields) and
 * no id, so it can be neither patched nor selected.
 */
const NO_CHAT: Chat = { ...createChat(1, ""), title: "" };

function withoutDraft(chat: Chat): ChatWithoutDraft {
  const { draft: _draft, draftAttachments: _attachments, ...rest } = chat;
  return rest;
}

/**
 * Field-by-field, over the keys the value actually has — not over a list of
 * names written out by hand. A list would be one more place to forget a field
 * in, and forgetting one here does not fail: it just stops a panel from ever
 * updating.
 */
function sameFields<T extends object>(a: T, b: T): boolean {
  const entries = Object.entries(a);
  if (entries.length !== Object.keys(b).length) return false;
  const other = b as Record<string, unknown>;
  return entries.every(([key, value]) => value === other[key]);
}

function sameTabs(previous: ChatTab[], chats: Chat[]): boolean {
  if (previous.length !== chats.length) return false;
  return chats.every((chat, i) => {
    const tab = previous[i];
    if (tab === undefined) return false;
    return tab.id === chat.id && tab.title === chat.title;
  });
}

function activeChatOf(snapshot: ChatsState): Chat {
  return (
    snapshot.chats.find((chat) => chat.id === snapshot.activeId) ?? snapshot.chats[0] ?? NO_CHAT
  );
}

let state: ChatsState = { chats: EMPTY_CHATS, activeId: "" };
let tabs: ChatTab[] = [];
let activeWithoutDraft: ChatWithoutDraft = withoutDraft(NO_CHAT);

const listeners = new Set<() => void>();

function publish(next: ChatsState): void {
  if (next.chats === state.chats && next.activeId === state.activeId) return;
  state = next;
  if (!sameTabs(tabs, next.chats))
    tabs = next.chats.map((chat) => ({ id: chat.id, title: chat.title }));
  const candidate = withoutDraft(activeChatOf(next));
  if (!sameFields(candidate, activeWithoutDraft)) activeWithoutDraft = candidate;
  listeners.forEach((listener) => {
    listener();
  });
}

export function subscribeChats(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The whole list — for serialisation, which is the only thing that needs it. */
export function getChats(): Chat[] {
  return state.chats;
}

/**
 * The active chat outside React: the send pipeline runs from event handlers and
 * from IPC events, where there is no render to read a selector in. It is always
 * the current value — the reason `useChats` had to keep a `useLatestRef` and a
 * comment about React only running updaters eagerly while the fiber is idle.
 */
export function getActiveChat(): Chat {
  return activeChatOf(state);
}

export function getActiveChatId(): string {
  return activeChatOf(state).id;
}

export function draftAttachmentCount(chatId: string): number {
  return state.chats.find((chat) => chat.id === chatId)?.draftAttachments.length ?? 0;
}

/** Only for tests: module scope outlives a `cleanup()` between cases. */
export function resetChatsState(): void {
  state = { chats: EMPTY_CHATS, activeId: "" };
  tabs = [];
  activeWithoutDraft = withoutDraft(NO_CHAT);
}

/* ── mutators ─────────────────────────────────────────────────────────────── */

function setChats(chats: Chat[]): void {
  publish({ ...state, chats });
}

/**
 * The one way a single chat changes. It returns without publishing when the
 * chat is unknown or when the mapper hands back the very object it was given —
 * which is how the limits (`ATTACHMENT_LIMIT`, an index out of range) express
 * "nothing happened" without every caller repeating the check.
 */
function mapChat(chatId: string, fn: (chat: Chat, index: number) => Chat): void {
  const index = state.chats.findIndex((chat) => chat.id === chatId);
  const chat = state.chats[index];
  if (chat === undefined) return;
  const next = fn(chat, index);
  if (next === chat) return;
  const chats = [...state.chats];
  chats[index] = next;
  setChats(chats);
}

/** The list as it came back from disk, plus the chat to open on it. */
export function adoptChats(chats: Chat[], activeId: string): void {
  publish({ chats, activeId });
}

export function newChat(): void {
  if (state.chats.length >= CHAT_LIMIT) return;
  const chat = createChat(state.chats.length + 1);
  publish({ chats: [...state.chats, chat], activeId: chat.id });
}

/**
 * The same parameters, a clean conversation — never a clone of the
 * correspondence. `libraryDocIds` comes across as a COPY of the array: two
 * chats must not share one reference.
 */
export function duplicateChat(sourceId: string): void {
  if (state.chats.length >= CHAT_LIMIT) return;
  const source = state.chats.find((chat) => chat.id === sourceId);
  if (source === undefined) return;
  const copy = createChatFrom(source, state.chats.length + 1);
  publish({ chats: [...state.chats, copy], activeId: copy.id });
}

export function removeChat(chatId: string): void {
  if (state.chats.length <= 1) return;
  const index = state.chats.findIndex((chat) => chat.id === chatId);
  if (index === -1) return;
  const chats = state.chats.filter((chat) => chat.id !== chatId);
  const removedTheActiveOne = activeChatOf(state).id === chatId;
  const neighbour = chats[Math.min(index, chats.length - 1)];
  publish({
    chats,
    activeId: removedTheActiveOne && neighbour ? neighbour.id : state.activeId,
  });
}

export function selectChat(chatId: string): void {
  if (chatId === state.activeId) return;
  publish({ ...state, activeId: chatId });
}

export function patchChat(chatId: string, patch: ChatPatch): void {
  mapChat(chatId, (chat) => {
    const current = chat as unknown as Record<string, unknown>;
    const changed = Object.entries(patch).some(([field, value]) => current[field] !== value);
    return changed ? { ...chat, ...patch } : chat;
  });
}

export function appendDraftAttachment(chatId: string, attachment: Attachment): void {
  mapChat(chatId, (chat) =>
    chat.draftAttachments.length >= ATTACHMENT_LIMIT
      ? chat
      : { ...chat, draftAttachments: [...chat.draftAttachments, attachment] },
  );
}

export function removeDraftAttachment(chatId: string, index: number): void {
  mapChat(chatId, (chat) =>
    chat.draftAttachments[index] === undefined
      ? chat
      : { ...chat, draftAttachments: chat.draftAttachments.filter((_, i) => i !== index) },
  );
}

function chatWithUserMessage(chat: Chat, index: number, text: string, images: ChatImage[]): Chat {
  const isFirst = chat.messages.length === 0;
  return {
    ...chat,
    title: isFirst && !chat.titlePinned ? chatTitle(text, index + 1) : chat.title,
    messages: [...chat.messages, { role: "user", text, images }],
  };
}

function withClearedDraft(chat: Chat): Chat {
  return { ...chat, draft: "", draftAttachments: [] };
}

function keepDraft(chat: Chat): Chat {
  return chat;
}

function withoutSentAttachments(chat: Chat, images: ChatImage[]): Chat {
  return images.length === 0 ? chat : { ...chat, draftAttachments: [] };
}

function appendUserTurn(
  chatId: string,
  text: string,
  images: ChatImage[],
  afterAppend: (chat: Chat) => Chat,
): void {
  mapChat(chatId, (chat, index) => afterAppend(chatWithUserMessage(chat, index, text, images)));
}

export function appendUserMessage(chatId: string, text: string, images: ChatImage[]): void {
  appendUserTurn(chatId, text, images, withClearedDraft);
}

/**
 * A quick action NEVER touches the draft's text — an unfinished question must
 * survive pressing ⌘1 — and clears the attachments only if they actually went
 * into the message.
 */
export function appendQuickActionMessage(chatId: string, text: string, images: ChatImage[]): void {
  appendUserTurn(chatId, text, images, (chat) => withoutSentAttachments(chat, images));
}

export function appendAutoTurnMessage(chatId: string, text: string): void {
  appendUserTurn(chatId, text, [], keepDraft);
}

export function appendAssistantMessage(chatId: string, text: string): void {
  mapChat(chatId, (chat) => ({
    ...chat,
    messages: [...chat.messages, { role: "assistant", text, images: [] }],
  }));
}

export function removeMessage(chatId: string, index: number): void {
  mapChat(chatId, (chat) =>
    chat.messages[index] === undefined
      ? chat
      : { ...chat, messages: chat.messages.filter((_, i) => i !== index) },
  );
}

export function truncateMessages(chatId: string, count: number): void {
  mapChat(chatId, (chat) =>
    count >= chat.messages.length ? chat : { ...chat, messages: chat.messages.slice(0, count) },
  );
}

export function clearMessages(chatId: string): void {
  mapChat(chatId, (chat) =>
    chat.messages.length === 0 && chat.lastInputTokens === 0
      ? chat
      : { ...chat, messages: [], lastInputTokens: 0 },
  );
}

/* ── selectors ────────────────────────────────────────────────────────────── */

export function useChatTabs(): ChatTab[] {
  return useSyncExternalStore(subscribeChats, () => tabs);
}

export function useActiveChatId(): string {
  return useSyncExternalStore(subscribeChats, getActiveChatId);
}

/** Everyone but the composer. See `ChatWithoutDraft`. */
export function useActiveChatWithoutDraft(): ChatWithoutDraft {
  return useSyncExternalStore(subscribeChats, () => activeWithoutDraft);
}

/**
 * The history, on its own. `mapChat` copies a chat with a spread and never
 * rebuilds `messages`, so the array keeps its identity through a draft change —
 * which is what lets the memoised answer panel sit out a keystroke.
 */
export function useActiveMessages(): ChatMessage[] {
  return useSyncExternalStore(subscribeChats, () => activeChatOf(state).messages);
}

/** The composer, and nothing else. */
export function useActiveDraft(): string {
  return useSyncExternalStore(subscribeChats, () => activeChatOf(state).draft);
}

export function useActiveDraftAttachments(): Attachment[] {
  return useSyncExternalStore(subscribeChats, () => activeChatOf(state).draftAttachments);
}
