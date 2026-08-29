import { useEffect, useRef, type RefObject } from "react";
import { usePersistedExternalStore } from "@/hooks/usePersistedStore";
import { getDict } from "@/i18n";
import { loadChatImages, loadChats, pruneChatImages, saveChats } from "@/ipc/commands";
import {
  chatImageIds,
  createChat,
  deserializeChats,
  hydrateChatImages,
  serializeChats,
  type Chat,
} from "@/lib/chats";
import { notifyError } from "@/lib/notifications";
import { adoptChats, getActiveChatId, getChats, subscribeChats } from "@/state/chats";

const ACTIVE_CHAT_STORAGE_KEY = "active-chat-id";

/**
 * The active chat survives a restart in `localStorage` rather than in
 * chats.json (whose root is a bare array — wrapping it would make an older
 * build read the file as "no chats" and wipe them) or in Settings (which loads
 * independently, so the chat would switch retroactively under a user who has
 * already clicked). A remembered chat that is gone falls back to the first one.
 */
function rememberedActiveId(chats: Chat[]): string {
  const stored = localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY) ?? "";
  const survived = chats.some((chat) => chat.id === stored);
  return survived ? stored : (chats[0]?.id ?? "");
}

/**
 * The second step of the load, and it must finish BEFORE the chats are adopted:
 * chats come back holding image REFERENCES, and one `load_chat_images` call
 * with every id at once turns them back into bytes. Adopt them first and the
 * bubbles render empty for a frame and the draft's previews for good.
 *
 * The `prune` afterwards is the ONLY cleanup of the images folder, and it runs
 * exactly once, here: doing it on every save would delete the file of an
 * attachment added inside the 500 ms the debounce keeps the state in the past.
 */
async function withStoredImages(stored: Chat[]): Promise<Chat[] | null> {
  const ids = chatImageIds(stored);
  const images = ids.length === 0 ? [] : await loadChatImages(ids);
  const hydrated = hydrateChatImages(stored, new Map(images.map((i) => [i.id, i.dataBase64])));
  if (hydrated[0] === undefined) return null;
  void pruneChatImages(chatImageIds(hydrated));
  return hydrated;
}

/**
 * Watching the store rather than a rendered value is the whole point: the id is
 * written from the store's own subscription, so remembering it costs no render
 * at all — and a keystroke, which publishes a change like any other, cannot
 * reach the component that mounted this hook.
 */
function useRememberActiveChat(loaded: RefObject<boolean>): void {
  const written = useRef<string | null>(null);
  useEffect(
    () =>
      subscribeChats(() => {
        if (!loaded.current) return;
        const id = getActiveChatId();
        // The draft lives in this store too, so a keystroke publishes here just
        // like a tab switch does — while the id it writes only ever changes on
        // the switch. Without remembering the last one, typing a message costs
        // one synchronous `localStorage` write per character.
        if (id === "" || id === written.current) return;
        written.current = id;
        localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, id);
      }),
    [loaded],
  );
}

/**
 * Everything about the chats that touches the disk, and nothing else: the store
 * itself (`state/chats`) is pure state. Mount it once, in the HUD's root.
 */
export function useChatsStorage(): void {
  const loaded = usePersistedExternalStore<Chat[]>({
    subscribe: subscribeChats,
    read: getChats,
    adopt: (chats) => {
      adoptChats(chats, rememberedActiveId(chats));
    },
    load: loadChats,
    save: saveChats,
    restore: (json) => deserializeChats(json) ?? [createChat(1)],
    serialize: serializeChats,
    hydrate: withStoredImages,
    onLoadError: (message) => {
      notifyError(getDict().common.storage.chatsLoadFailed, message);
    },
    onSaveError: (message) => {
      notifyError(getDict().common.storage.chatsSaveFailed, message);
    },
  });
  useRememberActiveChat(loaded);
}
