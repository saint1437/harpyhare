import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { countChatTokens } from "@/ipc/commands";
import type { ChatMessageDto } from "@/ipc/types";
import { requestMessages } from "@/lib/chat-request";
import { chatRequestOptions, type ChatWithoutDraft } from "@/lib/chats";
import { digest } from "@/lib/digest";
import { queryKeys } from "@/lib/query-client";

/** An empty chat still has weight: the library materials are already in `system`. */
const TOKEN_COUNT_PLACEHOLDER_MESSAGE: ChatMessageDto = { role: "user", text: ".", images: [] };
const PROJECTED_TOKENS_STALE_MS = 10 * 60 * 1000;

/**
 * How much the NEXT request will cost, from the API rather than from a
 * hardcoded window (`count_tokens` is free and takes no lease on the proxy).
 * Disabled while streaming: the history is changing under it every frame.
 */
export function useProjectedContextTokens(
  chat: ChatWithoutDraft,
  system: string,
  streaming: boolean,
): number {
  // Both of these feed the query key, which react-query re-hashes on every
  // render — so neither may be rebuilt per render. The prompt goes in as a
  // digest and the history as a shape summary; the real values reach the
  // request through the queryFn closure.
  const systemDigest = useMemo(() => digest(system), [system]);
  const messagesKey = useMemo(
    () => chat.messages.map((m) => `${m.role}:${String(m.text.length)}`).join("|"),
    [chat.messages],
  );
  const { data } = useQuery({
    queryKey: queryKeys.countTokens(
      chat.model,
      chatRequestOptions(chat),
      systemDigest,
      messagesKey,
    ),
    queryFn: () => {
      const history: ChatMessageDto[] =
        chat.messages.length > 0
          ? requestMessages(chat.messages)
          : [TOKEN_COUNT_PLACEHOLDER_MESSAGE];
      return countChatTokens(history, system, chat.model, chatRequestOptions(chat));
    },
    enabled: !streaming,
    staleTime: PROJECTED_TOKENS_STALE_MS,
    placeholderData: (prev) => prev,
  });
  return data ?? 0;
}
