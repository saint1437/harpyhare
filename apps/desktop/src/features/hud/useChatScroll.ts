import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { jumpButtonVisible, shouldScrollToBottom, type ScrollMetrics } from "@/lib/chat-scroll";
import type { ChatMessage } from "@/lib/chats";

/**
 * Everything the scroll rules need from whatever owns the scroll container. It
 * is an interface rather than a DOM ref on purpose: the panel supplies a plain
 * `div`, and a virtualiser — which takes the container over — would supply its
 * own imperative equivalent without a single rule changing. It is also what
 * makes the rules testable at all, since jsdom has no layout to measure.
 */
export interface ChatScroller {
  /** Jump to the end. Called from a layout effect, so it must be synchronous. */
  toBottom: () => void;
  /** The container's geometry, or `null` while it is not mounted. */
  metrics: () => ScrollMetrics | null;
}

export interface ChatScroll {
  showJump: boolean;
  /** The "↓ Вниз" button, and the reset on a chat switch. */
  jumpToBottom: () => void;
  /** Re-check the button from `onScroll`, coalesced to one call per frame. */
  syncJump: () => void;
}

const NO_MESSAGES: ChatMessage[] = [];

/**
 * Re-checking the button is not free: it reads `scrollTop`/`scrollHeight`/
 * `clientHeight` off the live container — a forced layout — and then sets
 * state. Both of the frequent callers below therefore go through a scheduler,
 * and they need DIFFERENT ones.
 */

/**
 * A trackpad delivers scroll events faster than the display delivers frames, so
 * `onScroll` measured and set state twice for every pixel anyone could see.
 * One call per frame is the most that can matter.
 */
function useFrameCoalesced(run: () => void): () => void {
  const latest = useLatestRef(run);
  const frame = useRef(0);

  useEffect(
    () => () => {
      if (frame.current !== 0) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return useCallback(() => {
    if (frame.current !== 0) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      latest.current();
    });
  }, [latest]);
}

/**
 * The stream's growth is ALREADY frame-paced (the rAF reveal loop in
 * `useClaudeStream`), so coalescing it to a frame would save nothing — a
 * throttle here has to be longer than a frame to be a throttle at all. Leading
 * edge, so the first sync of a burst is immediate; trailing call, so the button
 * is right when the stream STOPS and not merely right most of the time.
 */
function useThrottled(run: () => void, intervalMs: number): () => void {
  const latest = useLatestRef(run);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ranAt = useRef(Number.NEGATIVE_INFINITY);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(() => {
    if (timer.current !== null) return;
    const wait = intervalMs - (Date.now() - ranAt.current);
    if (wait <= 0) {
      ranAt.current = Date.now();
      latest.current();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      ranAt.current = Date.now();
      latest.current();
    }, wait);
  }, [intervalMs, latest]);
}

/** Roughly seven re-checks a second instead of sixty. */
const STREAM_SYNC_INTERVAL_MS = 150;

export function useChatScroll(
  scroller: ChatScroller,
  chatId: string | undefined,
  messages: ChatMessage[],
  partial: string | null,
): ChatScroll {
  const [showJump, setShowJump] = useState(false);

  const measureJump = useCallback(() => {
    const metrics = scroller.metrics();
    if (metrics === null) return;
    setShowJump(jumpButtonVisible(metrics));
  }, [scroller]);

  const syncJump = useFrameCoalesced(measureJump);
  const syncJumpWhileStreaming = useThrottled(measureJump, STREAM_SYNC_INTERVAL_MS);

  const jumpToBottom = useCallback(() => {
    scroller.toBottom();
    setShowJump(false);
  }, [scroller]);

  /**
   * Switching chats scrolls BEFORE paint. A passive effect lets the browser
   * show one frame at the previous chat's offset, and that frame reads as the
   * whole conversation flying past from the top.
   */
  useLayoutEffect(() => {
    jumpToBottom();
  }, [chatId, jumpToBottom]);

  const previousMessages = useRef<ChatMessage[]>(NO_MESSAGES);
  useEffect(() => {
    const previous = previousMessages.current;
    previousMessages.current = messages;
    // A message lands once, not sixty times a second: this one measures at once.
    if (shouldScrollToBottom(previous, messages)) jumpToBottom();
    else measureJump();
  }, [messages, jumpToBottom, measureJump]);

  /**
   * The revealed answer growing moves the BUTTON, never the container: there is
   * deliberately no stick-to-bottom while streaming (see `lib/chat-scroll`).
   */
  useEffect(() => {
    syncJumpWhileStreaming();
  }, [partial, syncJumpWhileStreaming]);

  return { showJump, jumpToBottom, syncJump };
}
