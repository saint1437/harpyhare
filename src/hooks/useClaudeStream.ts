import { useCallback, useEffect, useRef, useState } from "react";
import { cancelStream, sendToClaude } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { ChatMessageDto } from "@/ipc/types";

export interface ClaudeStreams {
  /** Текущий «живой» буфер ответа по чатам (для рендера in-flight реплики). */
  partial: Record<string, string>;
  streaming: Record<string, boolean>;
  /** Время начала стрима по чатам (Date.now() в send) — для счётчика «Думает… Nс». */
  startedAt: Record<string, number>;
  error: Record<string, string | null>;
  send: (chatId: string, messages: ChatMessageDto[], system: string) => Promise<void>;
  stop: (chatId: string) => void;
}

/**
 * @param onComplete вызывается на llm-done с финальным текстом — потребитель
 * дописывает ответ как assistant-сообщение в историю чата.
 */
export function useClaudeStream(
  onComplete: (chatId: string, finalText: string) => void,
): ClaudeStreams {
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [streaming, setStreaming] = useState<Record<string, boolean>>({});
  const [startedAt, setStartedAt] = useState<Record<string, number>>({});
  const [error, setError] = useState<Record<string, string | null>>({});

  // Буферы дельт по чатам и набор активных стримов — в ref'ах, чтобы события
  // (подписанные один раз) видели свежие значения без переподписки.
  const buffers = useRef<Map<string, string>>(new Map());
  const active = useRef<Set<string>>(new Set());
  const raf = useRef(0);
  const pending = useRef(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const flush = useCallback(() => {
    pending.current = false;
    setPartial((prev) => {
      const next = { ...prev };
      for (const id of active.current) next[id] = buffers.current.get(id) ?? "";
      return next;
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (pending.current) return;
    pending.current = true;
    raf.current = requestAnimationFrame(flush);
  }, [flush]);

  const dropPartial = useCallback((chatId: string) => {
    buffers.current.delete(chatId);
    setPartial((prev) => {
      if (!(chatId in prev)) return prev;
      const { [chatId]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);

  useEffect(() => {
    const offDelta = onEvent("llm-delta", ({ chatId, delta }) => {
      if (!active.current.has(chatId)) return;
      buffers.current.set(chatId, (buffers.current.get(chatId) ?? "") + delta);
      scheduleFlush();
    });
    const offDone = onEvent("llm-done", ({ chatId }) => {
      if (!active.current.has(chatId)) return;
      active.current.delete(chatId);
      const text = buffers.current.get(chatId) ?? "";
      onCompleteRef.current(chatId, text);
      dropPartial(chatId);
      setStreaming((s) => ({ ...s, [chatId]: false }));
    });
    const offError = onEvent("llm-error", ({ chatId, message }) => {
      if (!active.current.has(chatId)) return;
      active.current.delete(chatId);
      dropPartial(chatId);
      setStreaming((s) => ({ ...s, [chatId]: false }));
      setError((e) => ({ ...e, [chatId]: message }));
    });
    return () => {
      offDelta();
      offDone();
      offError();
      cancelAnimationFrame(raf.current);
      pending.current = false;
    };
  }, [scheduleFlush, dropPartial]);

  const send = useCallback(
    async (chatId: string, messages: ChatMessageDto[], system: string) => {
      buffers.current.set(chatId, "");
      active.current.add(chatId);
      setPartial((p) => ({ ...p, [chatId]: "" }));
      setStreaming((s) => ({ ...s, [chatId]: true }));
      setStartedAt((s) => ({ ...s, [chatId]: Date.now() }));
      setError((e) => ({ ...e, [chatId]: null }));
      try {
        await sendToClaude(messages, chatId, system);
      } catch (e) {
        active.current.delete(chatId);
        dropPartial(chatId);
        setStreaming((s) => ({ ...s, [chatId]: false }));
        setError((err) => ({ ...err, [chatId]: String(e) }));
      }
    },
    [dropPartial],
  );

  const stop = useCallback(
    (chatId: string) => {
      active.current.delete(chatId);
      void cancelStream(chatId);
      dropPartial(chatId);
      setStreaming((s) => ({ ...s, [chatId]: false }));
    },
    [dropPartial],
  );

  return { partial, streaming, startedAt, error, send, stop };
}
