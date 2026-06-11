import { useCallback, useEffect, useRef, useState } from "react";
import { loadChats, saveChats } from "@/ipc/commands";
import {
  acceptedNewAttachments,
  ATTACHMENT_LIMIT,
  downscaleFactor,
  extractImageItems,
  toImagePayload,
  type Attachment,
  type ImagePayload,
} from "@/lib/composer";
import {
  CHAT_LIMIT,
  chatTitle,
  createChat,
  deserializeChats,
  serializeChats,
  type Chat,
} from "@/lib/chats";

const SAVE_DEBOUNCE_MS = 500;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

async function fileToAttachment(file: File): Promise<Attachment> {
  const factor = downscaleFactor(file.size);
  if (factor === 1) {
    const dataUrl = await readAsDataUrl(file);
    return { payload: toImagePayload(dataUrl, file.type), preview: dataUrl };
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * factor));
  canvas.height = Math.max(1, Math.round(bitmap.height * factor));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { payload: toImagePayload(dataUrl, "image/jpeg"), preview: dataUrl };
}

export interface ChatsApi {
  chats: Chat[];
  activeId: string;
  active: Chat;
  newChat: () => void;
  removeChat: (id: string) => void;
  selectChat: (id: string) => void;
  setDraft: (id: string, draft: string, draftAttachments: Attachment[]) => void;
  addDraftAttachments: (id: string, items: DataTransferItemList) => Promise<void>;
  removeDraftAttachment: (id: string, index: number) => void;
  appendUserMessage: (id: string, text: string, images: ImagePayload[]) => void;
  appendAssistantMessage: (id: string, text: string) => void;
}

export function useChats(): ChatsApi {
  // Start with empty array so waitFor(length===1) only passes after load resolves.
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Загрузка с диска один раз на старте.
  useEffect(() => {
    let live = true;
    void loadChats().then((json) => {
      if (!live) return;
      const restored = deserializeChats(json);
      const initial = restored ?? [createChat(1)];
      setChats(initial);
      setActiveId(initial[0].id);
      loaded.current = true;
    });
    return () => {
      live = false;
    };
  }, []);

  // Если activeId ещё не выставлен (первый рендер до загрузки) — указываем на первый.
  const effectiveActiveId = activeId || (chats[0]?.id ?? "");

  // Дебаунс-сохранение при изменениях (только после первичной загрузки).
  useEffect(() => {
    if (!loaded.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveChats(serializeChats(chats));
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
  }, [chats]);

  const patch = useCallback((id: string, fn: (c: Chat) => Chat) => {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const newChat = useCallback(() => {
    setChats((prev) => {
      if (prev.length >= CHAT_LIMIT) return prev;
      const next = createChat(prev.length + 1);
      setActiveId(next.id);
      return [...prev, next];
    });
  }, []);

  const removeChat = useCallback(
    (id: string) => {
      setChats((prev) => {
        if (prev.length <= 1) return prev; // последний не удаляем
        const idx = prev.findIndex((c) => c.id === id);
        const next = prev.filter((c) => c.id !== id);
        setActiveId((cur) => {
          if (cur !== id) return cur;
          const neighbor = next[Math.min(idx, next.length - 1)];
          return neighbor.id;
        });
        return next;
      });
    },
    [],
  );

  const selectChat = useCallback((id: string) => setActiveId(id), []);

  const setDraft = useCallback(
    (id: string, draft: string, draftAttachments: Attachment[]) =>
      patch(id, (c) => ({ ...c, draft, draftAttachments })),
    [patch],
  );

  const addDraftAttachments = useCallback(
    async (id: string, items: DataTransferItemList) => {
      const files = extractImageItems(items);
      if (files.length === 0) return;
      let current = 0;
      setChats((prev) => {
        current = prev.find((c) => c.id === id)?.draftAttachments.length ?? 0;
        return prev;
      });
      const slots = acceptedNewAttachments(current, files.length);
      for (const file of files.slice(0, slots)) {
        try {
          const att = await fileToAttachment(file);
          patch(id, (c) =>
            c.draftAttachments.length >= ATTACHMENT_LIMIT
              ? c
              : { ...c, draftAttachments: [...c.draftAttachments, att] },
          );
        } catch {
          /* битый кадр пропускаем */
        }
      }
    },
    [patch],
  );

  const removeDraftAttachment = useCallback(
    (id: string, index: number) =>
      patch(id, (c) => ({
        ...c,
        draftAttachments: c.draftAttachments.filter((_, i) => i !== index),
      })),
    [patch],
  );

  const appendUserMessage = useCallback(
    (id: string, text: string, images: ImagePayload[]) =>
      setChats((prev) =>
        prev.map((c, i) => {
          if (c.id !== id) return c;
          const isFirst = c.messages.length === 0;
          return {
            ...c,
            title: isFirst ? chatTitle(text, i + 1) : c.title,
            messages: [...c.messages, { role: "user", text, images }],
            draft: "",
            draftAttachments: [],
          };
        }),
      ),
    [],
  );

  const appendAssistantMessage = useCallback(
    (id: string, text: string) =>
      patch(id, (c) => ({
        ...c,
        messages: [...c.messages, { role: "assistant", text, images: [] }],
      })),
    [patch],
  );

  // chats may be empty before first load — provide a stable fallback so callers
  // never receive undefined (though they should always await load first).
  const EMPTY_CHAT: Chat = { id: "", title: "", messages: [], draft: "", draftAttachments: [] };
  const active = chats.find((c) => c.id === effectiveActiveId) ?? chats[0] ?? EMPTY_CHAT;

  return {
    chats,
    activeId: effectiveActiveId,
    active,
    newChat,
    removeChat,
    selectChat,
    setDraft,
    addDraftAttachments,
    removeDraftAttachment,
    appendUserMessage,
    appendAssistantMessage,
  };
}
