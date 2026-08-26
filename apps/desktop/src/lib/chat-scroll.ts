import type { ChatMessage } from "./chats";

/**
 * The chat's scroll rules, as decisions rather than as pixels.
 *
 * They used to live as three effects inside `AnswerPanel`, where nothing could
 * test them: jsdom has no layout, so every assertion about scrolling would have
 * been an assertion about a number that is always zero. What is testable is the
 * DECISION — "does this change ask the container to move, or only to re-check
 * the button" — and that is what lives here.
 *
 * The three rules, in full:
 *
 * - **Switching chats scrolls to the bottom, synchronously before paint.** Not
 *   here (that is a layout effect in `useChatScroll`), but the reason belongs
 *   with the rest: a passive effect lets the browser show one frame at the old
 *   position, which reads as the answer flying past from the top.
 * - **Sending YOUR OWN message scrolls to the bottom** — `shouldScrollToBottom`.
 * - **There is deliberately NO autoscroll during streaming.** Stick-to-bottom
 *   was irritating: the scroll ran away and only stopped when you scrolled up by
 *   hand. The growth of the revealed answer therefore only re-evaluates the
 *   "↓ Вниз" button, which is `jumpButtonVisible` and nothing else.
 */

/** Closer than this to the end counts as "already at the bottom". */
export const NEAR_BOTTOM_PX = 40;

/** What the scroll container can say about itself without any layout maths. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function isNearBottom(metrics: ScrollMetrics): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight < NEAR_BOTTOM_PX;
}

/**
 * The button offers to do what the user can already do by scrolling — so it
 * appears only when there is somewhere to go AND they are not already there.
 */
export function jumpButtonVisible(metrics: ScrollMetrics): boolean {
  return !isNearBottom(metrics) && metrics.scrollHeight > metrics.clientHeight;
}

/**
 * The history grew AND the new tail is the user's own message. An assistant
 * message appended at the end of a stream does not qualify: by then the answer
 * has been on screen for a while and the reader may be anywhere in it.
 */
export function shouldScrollToBottom(previous: ChatMessage[], next: ChatMessage[]): boolean {
  if (next.length <= previous.length) return false;
  return next[next.length - 1]?.role === "user";
}
