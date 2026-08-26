import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  /** Re-check the button — the `onScroll` handler and the stream's growth. */
  syncJump: () => void;
}

const NO_MESSAGES: ChatMessage[] = [];

export function useChatScroll(
  scroller: ChatScroller,
  chatId: string | undefined,
  messages: ChatMessage[],
  partial: string | null,
): ChatScroll {
  const [showJump, setShowJump] = useState(false);

  const syncJump = useCallback(() => {
    const metrics = scroller.metrics();
    if (metrics === null) return;
    setShowJump(jumpButtonVisible(metrics));
  }, [scroller]);

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
    if (shouldScrollToBottom(previous, messages)) jumpToBottom();
    else syncJump();
  }, [messages, jumpToBottom, syncJump]);

  /**
   * The revealed answer growing moves the BUTTON, never the container: there is
   * deliberately no stick-to-bottom while streaming (see `lib/chat-scroll`).
   */
  useEffect(() => {
    syncJump();
  }, [partial, syncJump]);

  return { showJump, jumpToBottom, syncJump };
}
