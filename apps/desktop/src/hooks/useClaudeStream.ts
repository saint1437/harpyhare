import { useCallback, useEffect, useRef, useState } from "react";
import { cancelStream, sendToClaude } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { ChatMessageDto } from "@/ipc/types";
import { advanceReveal, sliceRevealed } from "@/lib/stream-reveal";

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
  const revealed = useRef<Map<string, number>>(new Map());
  const active = useRef<Set<string>>(new Set());
  const raf = useRef(0);
  const running = useRef(false);
  const lastFrameTs = useRef(0);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const frame = useCallback<FrameRequestCallback>((frameTs) => {
    if (active.current.size === 0) {
      running.current = false;
      lastFrameTs.current = 0;
      return;
    }
    const dtMs = lastFrameTs.current === 0 ? 0 : frameTs - lastFrameTs.current;
    lastFrameTs.current = frameTs;
    const updates: Record<string, string> = {};
    for (const id of active.current) {
      const full = buffers.current.get(id) ?? "";
      const shown = advanceReveal(revealed.current.get(id) ?? 0, full.length, dtMs);
      revealed.current.set(id, shown);
      updates[id] = sliceRevealed(full, shown);
    }
    setPartial((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [id, text] of Object.entries(updates)) {
        if (next[id] !== text) {
          next[id] = text;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    raf.current = requestAnimationFrame(frame);
  }, []);

  const ensureRevealLoop = useCallback(() => {
    if (running.current) return;
    running.current = true;
    lastFrameTs.current = 0;
    raf.current = requestAnimationFrame(frame);
  }, [frame]);

  const dropPartial = useCallback((chatId: string) => {
    buffers.current.delete(chatId);
    revealed.current.delete(chatId);
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
      ensureRevealLoop();
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
      running.current = false;
      lastFrameTs.current = 0;
    };
  }, [ensureRevealLoop, commitBufferAndFinish]);

  const beginStream = useCallback(
    (chatId: string) => {
      buffers.current.set(chatId, "");
      revealed.current.set(chatId, 0);
      active.current.add(chatId);
      setPartial((p) => ({ ...p, [chatId]: "" }));
      setStreaming((s) => ({ ...s, [chatId]: true }));
      setStartedAt((s) => ({ ...s, [chatId]: Date.now() }));
      setError((e) => ({ ...e, [chatId]: null }));
      ensureRevealLoop();
    },
    [ensureRevealLoop],
  );

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
