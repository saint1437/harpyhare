import { useCallback, useEffect, useMemo, useRef } from "react";
import { cancelStream, sendToClaude } from "@/ipc/commands";
import { onEvent } from "@/ipc/events";
import type { ChatMessageDto } from "@/ipc/types";
import type { RequestOptions } from "@/lib/chats";
import { internalError } from "@/lib/errors";
import { notifyAppError } from "@/lib/notifications";
import { advanceReveal, sliceRevealed } from "@/lib/stream-reveal";
import { beginStreamState, clearPartial, setPartials, setStreamingFlag } from "@/state/stream";

/**
 * The stream's DATA lives in `state/stream` and is read through selectors; what
 * this hook returns is only the three ways to act on it. Handing `partial` back
 * through React state was what made every frame of the reveal re-render the
 * whole HUD.
 */
export interface ClaudeStreams {
  send: (
    chatId: string,
    messages: ChatMessageDto[],
    system: string,
    model: string,
    options: RequestOptions,
  ) => Promise<void>;
  stop: (chatId: string) => void;
  abandon: (chatId: string) => Promise<void>;
}

export function useClaudeStream(
  onComplete: (chatId: string, finalText: string) => void,
): ClaudeStreams {
  const buffers = useRef<Map<string, string>>(new Map());
  const revealed = useRef<Map<string, number>>(new Map());
  const active = useRef<Set<string>>(new Set());
  const raf = useRef(0);
  const running = useRef(false);
  const lastFrameTs = useRef(0);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const pendingCancel = useRef<Map<string, Promise<void>>>(new Map());

  // A replacement request must not reach the backend before the stream it supersedes has
  // actually been cancelled — otherwise both are briefly live upstream and the abandoned
  // one keeps generating (and billing) against a question nobody is waiting on any more.
  // The wait lives in `send` rather than at the call sites so it cannot be forgotten, and
  // the stored promise never rejects: a failed cancel must not strand the next turn, and
  // the fresh `send` re-cancels the old slot on the Rust side anyway.
  const requestCancel = useCallback((chatId: string) => {
    const cancelled = Promise.resolve(cancelStream(chatId)).then(
      () => undefined,
      () => undefined,
    );
    pendingCancel.current.set(chatId, cancelled);
    void cancelled.then(() => {
      if (pendingCancel.current.get(chatId) === cancelled) pendingCancel.current.delete(chatId);
    });
    return cancelled;
  }, []);

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
    setPartials(updates);
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
    clearPartial(chatId);
  }, []);

  const commitBufferAndFinish = useCallback(
    (chatId: string, commitEvenIfEmpty: boolean) => {
      const finalText = buffers.current.get(chatId) ?? "";
      if (commitEvenIfEmpty || finalText !== "") onCompleteRef.current(chatId, finalText);
      dropPartial(chatId);
      setStreamingFlag(chatId, false);
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
    const offError = onEvent("llm-error", ({ chatId, code, message, params }) => {
      if (!active.current.has(chatId)) return;
      active.current.delete(chatId);
      commitBufferAndFinish(chatId, false);
      notifyAppError({ code, message, params });
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
      beginStreamState(chatId, Date.now());
      ensureRevealLoop();
    },
    [ensureRevealLoop],
  );

  const failStream = useCallback(
    (chatId: string) => {
      active.current.delete(chatId);
      dropPartial(chatId);
      setStreamingFlag(chatId, false);
    },
    [dropPartial],
  );

  const send = useCallback(
    async (
      chatId: string,
      messages: ChatMessageDto[],
      system: string,
      model: string,
      options: RequestOptions,
    ) => {
      // Only yield when a cancellation is genuinely outstanding: an unconditional await
      // would push `beginStream` a microtask out on every send, so the chat would not
      // read as busy in the tick that started it.
      const cancelling = pendingCancel.current.get(chatId);
      if (cancelling) await cancelling;
      beginStream(chatId);
      try {
        await sendToClaude(messages, chatId, system, model, options);
      } catch (e) {
        failStream(chatId);
        notifyAppError(internalError(String(e)));
      }
    },
    [beginStream, failStream],
  );

  const stop = useCallback(
    (chatId: string) => {
      active.current.delete(chatId);
      void requestCancel(chatId);
      commitBufferAndFinish(chatId, false);
    },
    [commitBufferAndFinish, requestCancel],
  );

  // `stop` keeps what was generated — that is what the Stop button means. A barge-in
  // means the question it was answering is superseded, so the half-answer is dropped
  // instead: leaving it would put a reply to a stale question into both the visible
  // history and the next request's context.
  // The local reset is synchronous — the chat must stop looking busy the moment the turn
  // is superseded — while the returned promise settles once the backend has cancelled.
  const abandon = useCallback(
    (chatId: string) => {
      active.current.delete(chatId);
      const cancelled = requestCancel(chatId);
      dropPartial(chatId);
      setStreamingFlag(chatId, false);
      return cancelled;
    },
    [dropPartial, requestCancel],
  );

  return useMemo(() => ({ send, stop, abandon }), [send, stop, abandon]);
}
