import { useCallback, type RefObject } from "react";
import type { ClaudeStreams } from "@/hooks/useClaudeStream";
import type { ChatMessageDto } from "@/ipc/types";
import { planDispatch } from "@/lib/auto-turns";
import {
  chatSystemPrompt,
  draftImages,
  historyWithNewUserMessage,
  requestMessages,
} from "@/lib/chat-request";
import { chatRequestOptions, type Chat } from "@/lib/chats";
import type { ContextLibrary } from "@/lib/context-library";
import { dismissAllNotifications } from "@/lib/notifications";
import type { PromptPreset } from "@/lib/presets";
import {
  appendAutoTurnMessage,
  appendQuickActionMessage,
  appendUserMessage,
  getActiveChat,
  truncateMessages,
} from "@/state/chats";
import { isStreaming } from "@/state/stream";

export interface SendPipeline {
  dispatchSend: (rawText: string) => void;
  dispatchQuickAction: (prompt: string, withAttachments: boolean) => void;
  dispatchAutoTurn: (text: string) => boolean;
  doSend: () => void;
  resendFromMessage: (index: number) => void;
}

/**
 * Every path that reaches Claude, over ONE assembly of the system prompt and
 * the history (`streamChat`). A new sender must not grow its own copy of that
 * assembly — that is how the quick-action path once shipped without the
 * library materials.
 *
 * The chats come from the module store rather than from a prop or a ref: these
 * callbacks run from event handlers, from IPC events and from document-level
 * hotkeys, where there is no render to read a selector in, and `getActiveChat`
 * is always the current value. What is left as refs is what genuinely still
 * lives in React state.
 */
export function useSendPipeline(
  streamRef: RefObject<ClaudeStreams>,
  presetsRef: RefObject<PromptPreset[]>,
  libraryRef: RefObject<ContextLibrary>,
): SendPipeline {
  const streamChat = useCallback(
    (chat: Chat, history: ChatMessageDto[]) => {
      const system = chatSystemPrompt(presetsRef.current, chat, libraryRef.current);
      void streamRef.current.send(chat.id, history, system, chat.model, chatRequestOptions(chat));
    },
    [streamRef, presetsRef, libraryRef],
  );

  const dispatchSend = useCallback(
    (rawText: string) => {
      const chat = getActiveChat();
      if (isStreaming(chat.id)) return;
      const trimmed = rawText.trim();
      const images = draftImages(chat);
      if (trimmed === "" && images.length === 0) return;
      // Новая попытка — новый разговор: отказ прошлой к ней уже не относится.
      dismissAllNotifications();
      appendUserMessage(chat.id, trimmed, images);
      streamChat(chat, historyWithNewUserMessage(chat, trimmed, images));
    },
    [streamChat],
  );

  const dispatchQuickAction = useCallback(
    (prompt: string, withAttachments: boolean) => {
      const chat = getActiveChat();
      if (isStreaming(chat.id)) return;
      const trimmed = prompt.trim();
      if (trimmed === "") return;
      const images = withAttachments ? draftImages(chat) : [];
      // Новая попытка — новый разговор: отказ прошлой к ней уже не относится.
      dismissAllNotifications();
      appendQuickActionMessage(chat.id, trimmed, images);
      streamChat(chat, historyWithNewUserMessage(chat, trimmed, images));
    },
    [streamChat],
  );

  const dispatchAutoTurn = useCallback(
    (text: string) => {
      const chat = getActiveChat();
      const streaming = isStreaming(chat.id);
      const { interrupt, send } = planDispatch(text, streaming);
      if (!send) return false;
      // Fire-and-forget is safe here only because `send` awaits the cancellation this
      // starts; the replacement request cannot outrun it.
      if (interrupt) void streamRef.current.abandon(chat.id);
      // Новая попытка — новый разговор: отказ прошлой к ней уже не относится.
      dismissAllNotifications();
      const trimmed = text.trim();
      appendAutoTurnMessage(chat.id, trimmed);
      streamChat(chat, historyWithNewUserMessage(chat, trimmed, []));
      return true;
    },
    [streamRef, streamChat],
  );

  const doSend = useCallback(() => {
    dispatchSend(getActiveChat().draft);
  }, [dispatchSend]);

  const resendFromMessage = useCallback(
    (index: number) => {
      const chat = getActiveChat();
      if (isStreaming(chat.id)) return;
      if (chat.messages[index]?.role !== "user") return;
      // Новая попытка — новый разговор: отказ прошлой к ней уже не относится.
      dismissAllNotifications();
      const kept = chat.messages.slice(0, index + 1);
      truncateMessages(chat.id, kept.length);
      streamChat(chat, requestMessages(kept));
    },
    [streamChat],
  );

  return { dispatchSend, dispatchQuickAction, dispatchAutoTurn, doSend, resendFromMessage };
}
