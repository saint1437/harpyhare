import { memo } from "react";
import { useIsStreaming, useStreamPartial, useStreamStartedAt } from "@/state/stream";
import { AnswerPanel, type AnswerPanelProps } from "./AnswerPanel";

export type LiveAnswerPanelProps = Omit<
  AnswerPanelProps,
  "partial" | "streaming" | "streamStartedAt"
> & {
  chatId: string;
};

/**
 * The one subscriber to the revealed text, and the reason the rest of the HUD
 * no longer re-renders sixty times a second. `AnswerPanel` itself stays
 * prop-driven — it is the component with the scroll invariants and the tests
 * that guard them; what changed is who reads the store.
 *
 * `partial` stays nullable below: «не стримим» is not the same as «стримим
 * пустоту», and the empty-chat hint depends on telling them apart.
 *
 * It is `memo`ised, and every prop the HUD passes it is stable by construction
 * (the combos are memoised, `messages` keeps its array identity through
 * `patchChat`, and the four callbacks are `useCallback`s reading refs). That is
 * what keeps a keystroke in the composer — which changes the draft, which lives
 * in the chat's state — from re-rendering the whole message list.
 */
export const LiveAnswerPanel = memo(function LiveAnswerPanel({
  chatId,
  ...rest
}: LiveAnswerPanelProps) {
  const streaming = useIsStreaming(chatId);
  const partial = useStreamPartial(chatId);
  const streamStartedAt = useStreamStartedAt(chatId);
  return (
    <AnswerPanel
      {...rest}
      chatId={chatId}
      partial={streaming ? partial : null}
      streaming={streaming}
      streamStartedAt={streamStartedAt}
    />
  );
});
