import { useCallback, useEffect, useRef, useState } from "react";
import {
  FALLBACK_ANSWER,
  INITIAL_CHATS,
  VOICE_PROMPTS,
  type DemoChat,
  type DemoMessage,
  type VoicePrompt,
} from "./demo-data";

export type DemoPhase = "idle" | "recording" | "transcribing" | "streaming";

const RECORDING_MS = 1500;
const TRANSCRIBING_MS = 750;
const AUTOSEND_DELAY_MS = 450;
const THINKING_MS = 900;
const REVEAL_CHARS_PER_SECOND = 95;
const MAX_FRAME_MS = 100;
const CHAT_LIMIT = 6;

function freshChats(): DemoChat[] {
  return INITIAL_CHATS.map((chat) => ({ ...chat, messages: [...chat.messages] }));
}

function answerFor(question: string): string {
  return VOICE_PROMPTS.find((p) => p.question === question)?.answer ?? FALLBACK_ANSWER;
}

export interface DemoRun {
  chats: DemoChat[];
  active: DemoChat;
  activeId: string;
  phase: DemoPhase;
  partial: string | null;
  thinkingStartedAt: number;
  selectChat: (id: string) => void;
  newChat: () => void;
  closeChat: (id: string) => void;
  setDraft: (text: string) => void;
  removeMessage: (index: number) => void;
  clearHistory: () => void;
  send: () => void;
  stopStream: () => void;
  askByVoice: (prompt: VoicePrompt) => void;
}

export function useDemoRun(): DemoRun {
  const [chats, setChats] = useState<DemoChat[]>(freshChats);
  const [activeId, setActiveId] = useState(() => INITIAL_CHATS[0]?.id ?? "");
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [partial, setPartial] = useState<string | null>(null);
  const [thinkingStartedAt, setThinkingStartedAt] = useState(0);

  const timersRef = useRef<number[]>([]);
  const frameRef = useRef(0);
  const streamRef = useRef<{ chatId: string; full: string; shown: number; last: number } | null>(
    null,
  );
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const chatSeqRef = useRef(INITIAL_CHATS.length);

  const cancelPending = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    cancelAnimationFrame(frameRef.current);
    streamRef.current = null;
  }, []);

  const later = useCallback((delayMs: number, run: () => void) => {
    timersRef.current.push(window.setTimeout(run, delayMs));
  }, []);

  const patchChat = useCallback((id: string, patch: (chat: DemoChat) => DemoChat) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? patch(chat) : chat)));
  }, []);

  const appendMessage = useCallback(
    (id: string, message: DemoMessage) => {
      patchChat(id, (chat) => ({ ...chat, messages: [...chat.messages, message] }));
    },
    [patchChat],
  );

  const tick: (now: number) => void = useCallback(
    (now: number) => {
      const stream = streamRef.current;
      if (!stream) return;
      const elapsed = Math.min(MAX_FRAME_MS, now - stream.last);
      stream.last = now;
      stream.shown += (elapsed / 1000) * REVEAL_CHARS_PER_SECOND;
      const shownChars = Math.floor(stream.shown);
      if (shownChars >= stream.full.length) {
        streamRef.current = null;
        setPartial(null);
        setPhase("idle");
        appendMessage(stream.chatId, { role: "assistant", text: stream.full });
        return;
      }
      setPartial(stream.full.slice(0, shownChars));
      frameRef.current = requestAnimationFrame(tick);
    },
    [appendMessage],
  );

  const beginStream = useCallback(
    (chatId: string, answer: string) => {
      setPartial("");
      setPhase("streaming");
      setThinkingStartedAt(Date.now());
      later(THINKING_MS, () => {
        streamRef.current = { chatId, full: answer, shown: 0, last: performance.now() };
        frameRef.current = requestAnimationFrame(tick);
      });
    },
    [later, tick],
  );

  const dispatch = useCallback(
    (chatId: string, text: string) => {
      const trimmed = text.trim();
      if (trimmed === "") return;
      appendMessage(chatId, { role: "user", text: trimmed });
      patchChat(chatId, (chat) => ({ ...chat, draft: "" }));
      beginStream(chatId, answerFor(trimmed));
    },
    [appendMessage, patchChat, beginStream],
  );

  const send = useCallback(() => {
    const chatId = activeIdRef.current;
    const draft = chats.find((chat) => chat.id === chatId)?.draft ?? "";
    cancelPending();
    dispatch(chatId, draft);
  }, [chats, cancelPending, dispatch]);

  const askByVoice = useCallback(
    (prompt: VoicePrompt) => {
      const chatId = activeIdRef.current;
      cancelPending();
      setPartial(null);
      setPhase("recording");
      patchChat(chatId, (chat) => ({ ...chat, draft: "" }));
      later(RECORDING_MS, () => {
        setPhase("transcribing");
        later(TRANSCRIBING_MS, () => {
          setPhase("idle");
          patchChat(chatId, (chat) => ({ ...chat, draft: prompt.question }));
          later(AUTOSEND_DELAY_MS, () => {
            dispatch(chatId, prompt.question);
          });
        });
      });
    },
    [cancelPending, later, patchChat, dispatch],
  );

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    cancelPending();
    setPartial(null);
    setPhase("idle");
    if (stream && stream.shown >= 1) {
      appendMessage(stream.chatId, {
        role: "assistant",
        text: stream.full.slice(0, Math.floor(stream.shown)),
      });
    }
  }, [cancelPending, appendMessage]);

  const selectChat = useCallback(
    (id: string) => {
      cancelPending();
      setPartial(null);
      setPhase("idle");
      setActiveId(id);
    },
    [cancelPending],
  );

  const newChat = useCallback(() => {
    if (chats.length >= CHAT_LIMIT) return;
    chatSeqRef.current += 1;
    const id = `chat-${chatSeqRef.current}`;
    setChats((prev) => [...prev, { id, title: "Новый чат", messages: [], draft: "" }]);
    setActiveId(id);
  }, [chats.length]);

  const closeChat = useCallback(
    (id: string) => {
      if (chats.length <= 1) return;
      cancelPending();
      setPartial(null);
      setPhase("idle");
      const rest = chats.filter((chat) => chat.id !== id);
      setChats(rest);
      const fallback = rest[0];
      if (fallback && id === activeIdRef.current) setActiveId(fallback.id);
    },
    [chats, cancelPending],
  );

  const setDraft = useCallback(
    (text: string) => {
      patchChat(activeIdRef.current, (chat) => ({ ...chat, draft: text }));
    },
    [patchChat],
  );

  const removeMessage = useCallback(
    (index: number) => {
      patchChat(activeIdRef.current, (chat) => ({
        ...chat,
        messages: chat.messages.filter((_, i) => i !== index),
      }));
    },
    [patchChat],
  );

  const clearHistory = useCallback(() => {
    cancelPending();
    setPartial(null);
    setPhase("idle");
    patchChat(activeIdRef.current, (chat) => ({ ...chat, messages: [] }));
  }, [cancelPending, patchChat]);

  useEffect(() => cancelPending, [cancelPending]);

  const active = chats.find((chat) => chat.id === activeId) ?? chats[0] ?? INITIAL_CHATS[0];

  return {
    chats,
    active: active ?? { id: "", title: "", messages: [], draft: "" },
    activeId,
    phase,
    partial,
    thinkingStartedAt,
    selectChat,
    newChat,
    closeChat,
    setDraft,
    removeMessage,
    clearHistory,
    send,
    stopStream,
    askByVoice,
  };
}
