import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessageDto } from "@/ipc/types";
import type { RequestOptions } from "@/lib/chats";
import { createChat, type Chat } from "@/lib/chats";

const countChatTokens = vi.fn(
  (_messages: ChatMessageDto[], _system: string, _model: string, _options: RequestOptions) =>
    Promise.resolve(1234),
);

vi.mock("@/ipc/commands", () => ({
  countChatTokens: (
    messages: ChatMessageDto[],
    system: string,
    model: string,
    options: RequestOptions,
  ) => countChatTokens(messages, system, model, options),
}));

import { createQueryWrapper } from "@/test/query-wrapper";
import { useProjectedContextTokens } from "./useProjectedContextTokens";

function render(chat: Chat, system: string, streaming: boolean) {
  return renderHook(() => useProjectedContextTokens(chat, system, streaming), {
    wrapper: createQueryWrapper(),
  });
}

let chat: Chat;

beforeEach(() => {
  countChatTokens.mockClear();
  chat = createChat(1, "c1");
});

describe("useProjectedContextTokens", () => {
  it("отдаёт проекцию из count_tokens", async () => {
    const { result } = render(chat, "система", false);
    await waitFor(() => {
      expect(result.current).toBe(1234);
    });
  });

  // Материалы библиотеки уже в system, и их вес виден до первой отправки —
  // поэтому у пустого чата в историю идёт плейсхолдер, а не пустой массив.
  it("у пустого чата в запрос идёт плейсхолдер", async () => {
    render(chat, "система", false);
    await waitFor(() => {
      expect(countChatTokens).toHaveBeenCalled();
    });
    expect(countChatTokens.mock.calls[0]?.[0]).toEqual([{ role: "user", text: ".", images: [] }]);
  });

  it("непустая история уходит целиком", async () => {
    const withHistory: Chat = {
      ...chat,
      messages: [{ role: "user", text: "вопрос", images: [] }],
    };
    render(withHistory, "система", false);
    await waitFor(() => {
      expect(countChatTokens).toHaveBeenCalled();
    });
    expect(countChatTokens.mock.calls[0]?.[0]).toEqual([
      { role: "user", text: "вопрос", images: [] },
    ]);
  });

  it("во время стрима запрос не идёт", () => {
    const { result } = render(chat, "система", true);
    expect(countChatTokens).not.toHaveBeenCalled();
    expect(result.current).toBe(0);
  });

  // Ключ запроса пере-хешируется на КАЖДОМ рендере, поэтому системный промпт
  // едет в него дайджестом: мегабайтная библиотека в ключе стоила бы
  // JSON.stringify по ней шестьдесят раз в секунду.
  it("тот же промпт не создаёт нового запроса на каждом рендере", async () => {
    const { rerender } = render(chat, "длинный системный промпт", false);
    await waitFor(() => {
      expect(countChatTokens).toHaveBeenCalledTimes(1);
    });
    rerender();
    rerender();
    expect(countChatTokens).toHaveBeenCalledTimes(1);
  });
});
