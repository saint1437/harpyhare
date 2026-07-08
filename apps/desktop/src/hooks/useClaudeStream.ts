import { useCallback, useEffect, useRef, useState } from "react";
import { cancelStream, sendToClaude } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { ChatMessageDto } from "@/ipc/types";

export interface ClaudeStreams {
  partial: Record<string, string>;
  streaming: Record<string, boolean>;
  startedAt: Record<string, number>;
  error: Record<string, string | null>;
  send: (
    chatId: string,
    messages: ChatMessageDto[],
    system: string,
    thinking: boolean,
    model: string,
    webSearch: boolean,
  ) => Promise<void>;
  stop: (chatId: string) => void;
}

export function useClaudeStream(
  onComplete: (chatId: string, finalText: string) => void,
): ClaudeStreams {
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [streaming, setStreaming] = useState<Record<string, boolean>>({});
  const [startedAt, setStartedAt] = useState<Record<string, number>>({});
  const [error, setError] = useState<Record<string, string | null>>({});

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

  const commitBufferAndFinish = useCallback(
    (chatId: string, commitEvenIfEmpty: boolean) => {
      const finalText = buffers.current.get(chatId) ?? "";
      if (commitEvenIfEmpty || finalText !== "") onCompleteRef.current(chatId, finalText);
      dropPartial(chatId);
      setStreaming((s) => ({ ...s, [chatId]: false }));
    },
    [dropPartial],
  );

  useEffect(() => {
    const offDelta = onEvent("llm-delta", ({ chatId, delta }) => {
      if (!active.current.has(chatId)) return;
      buffers.current.set(chatId, (buffers.current.get(chatId) ?? "") + delta);
      scheduleFlush();
    });
    const offDone = onEvent("llm-done", ({ chatId }) => {
      if (!active.current.has(chatId)) return;
      active.current.delete(chatId);
      commitBufferAndFinish(chatId, true);
    });
    const offError = onEvent("llm-error", ({ chatId, message }) => {
      if (!active.current.has(chatId)) return;
      active.current.delete(chatId);
      commitBufferAndFinish(chatId, false);
      setError((e) => ({ ...e, [chatId]: message }));
    });
    return () => {
      offDelta();
      offDone();
      offError();
      cancelAnimationFrame(raf.current);
      pending.current = false;
    };
  }, [scheduleFlush, commitBufferAndFinish]);

  const beginStream = useCallback((chatId: string) => {
    buffers.current.set(chatId, "");
    active.current.add(chatId);
    setPartial((p) => ({ ...p, [chatId]: "" }));
    setStreaming((s) => ({ ...s, [chatId]: true }));
    setStartedAt((s) => ({ ...s, [chatId]: Date.now() }));
    setError((e) => ({ ...e, [chatId]: null }));
  }, []);

  const failStream = useCallback(
    (chatId: string, message: string) => {
      active.current.delete(chatId);
      dropPartial(chatId);
      setStreaming((s) => ({ ...s, [chatId]: false }));
      setError((err) => ({ ...err, [chatId]: message }));
    },
    [dropPartial],
  );

  const send = useCallback(
    async (
      chatId: string,
      messages: ChatMessageDto[],
      system: string,
      thinking: boolean,
      model: string,
      webSearch: boolean,
    ) => {
      beginStream(chatId);
      try {
        await sendToClaude(messages, chatId, system, thinking, model, webSearch);
      } catch (e) {
        failStream(chatId, String(e));
      }
    },
    [beginStream, failStream],
  );

  const stop = useCallback(
    (chatId: string) => {
      active.current.delete(chatId);
      void cancelStream(chatId);
      commitBufferAndFinish(chatId, false);
    },
    [commitBufferAndFinish],
  );

  return { partial, streaming, startedAt, error, send, stop };
}
