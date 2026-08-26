import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeStreams } from "@/hooks/useClaudeStream";
import { createChat, type Chat } from "@/lib/chats";
import { EMPTY_LIBRARY, type ContextLibrary } from "@/lib/context-library";
import type { PromptPreset } from "@/lib/presets";
import { adoptChats, getActiveChat, resetChatsState } from "@/state/chats";
import { beginStreamState, resetStreamState } from "@/state/stream";
import { useSendPipeline } from "./useSendPipeline";

const PRESETS: PromptPreset[] = [{ id: "p", name: "Пресет", text: "текст пресета" }];

function streams(): ClaudeStreams {
  return {
    send: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    abandon: vi.fn(() => Promise.resolve()),
  };
}

/** The busy flag lives in the stream store, not on the hook's return. */
function markStreaming(chatId: string): void {
  beginStreamState(chatId, Date.now());
}

/**
 * The chats live in a module store now, so a case seeds THAT rather than
 * injecting a fake api — which is also why the assertions look at the chat
 * itself instead of at a mocked setter.
 */
function setup(chat: Chat, stream: ClaudeStreams, library: ContextLibrary = EMPTY_LIBRARY) {
  adoptChats([chat], chat.id);
  const { result } = renderHook(() =>
    useSendPipeline({ current: stream }, { current: PRESETS }, { current: library }),
  );
  return { stream, pipeline: result.current };
}

function setupStreaming(active: Chat) {
  markStreaming(active.id);
  return setup(active, streams());
}

let chat: Chat;

beforeEach(() => {
  resetStreamState();
  resetChatsState();
  chat = { ...createChat(1, "c1"), presetId: "p" };
});

describe("useSendPipeline", () => {
  it("dispatchSend кладёт сообщение в чат и стартует поток с собранным системным промптом", () => {
    const { stream, pipeline } = setup(chat, streams());
    pipeline.dispatchSend("  вопрос  ");
    expect(getActiveChat().messages).toEqual([{ role: "user", text: "вопрос", images: [] }]);
    expect(stream.send).toHaveBeenCalledWith(
      "c1",
      [{ role: "user", text: "вопрос", images: [] }],
      "текст пресета",
      chat.model,
      { thinking: false, webSearch: false },
    );
  });

  it("пустая отправка не уходит вовсе", () => {
    const { stream, pipeline } = setup(chat, streams());
    pipeline.dispatchSend("   ");
    expect(getActiveChat().messages).toEqual([]);
    expect(stream.send).not.toHaveBeenCalled();
  });

  it("пока чат стримит, второй запрос не начинается", () => {
    const { stream, pipeline } = setupStreaming(chat);
    pipeline.dispatchSend("вопрос");
    expect(stream.send).not.toHaveBeenCalled();
  });

  // Быстрое действие никогда не трогает черновик, а вложения подмешивает только
  // по флагу — иначе ⌘1 утащит забытый в поле скриншот.
  it("dispatchQuickAction идёт своим путём и подмешивает вложения только по флагу", () => {
    const withAttachment: Chat = {
      ...chat,
      draftAttachments: [{ id: "a", payload: { media_type: "image/png", data: "X" }, preview: "" }],
    };
    const { pipeline } = setup(withAttachment, streams());
    pipeline.dispatchQuickAction("короче", false);
    expect(getActiveChat().messages).toEqual([{ role: "user", text: "короче", images: [] }]);

    const second = setup(withAttachment, streams());
    second.pipeline.dispatchQuickAction("короче", true);
    expect(getActiveChat().messages).toEqual([
      { role: "user", text: "короче", images: [{ id: "a", media_type: "image/png", data: "X" }] },
    ]);
  });

  it("doSend отправляет черновик активного чата", () => {
    const { stream, pipeline } = setup({ ...chat, draft: "из поля" }, streams());
    pipeline.doSend();
    expect(getActiveChat().messages).toEqual([{ role: "user", text: "из поля", images: [] }]);
    expect(stream.send).toHaveBeenCalled();
  });

  // Новая реплика во время генерации не встаёт в очередь: прошлый ответ уже
  // устарел, поэтому он отменяется, а на его место идёт свежее окно.
  it("dispatchAutoTurn во время стрима отменяет прошлый и отправляет заново", () => {
    const { stream, pipeline } = setupStreaming(chat);
    expect(pipeline.dispatchAutoTurn("реплика")).toBe(true);
    expect(stream.abandon).toHaveBeenCalledWith("c1");
    expect(getActiveChat().messages).toEqual([{ role: "user", text: "реплика", images: [] }]);
  });

  it("пустая реплика не отправляется", () => {
    const { stream, pipeline } = setup(chat, streams());
    expect(pipeline.dispatchAutoTurn("   ")).toBe(false);
    expect(getActiveChat().messages).toEqual([]);
    expect(stream.send).not.toHaveBeenCalled();
  });

  it("dispatchAutoTurn на свободном чате отправляет и не трогает черновик", () => {
    const { stream, pipeline } = setup({ ...chat, draft: "не трогать" }, streams());
    expect(pipeline.dispatchAutoTurn("реплика")).toBe(true);
    expect(getActiveChat().messages).toEqual([{ role: "user", text: "реплика", images: [] }]);
    expect(getActiveChat().draft).toBe("не трогать");
    expect(stream.send).toHaveBeenCalled();
  });

  it("resendFromMessage обрезает историю по указанному сообщению пользователя", () => {
    const withHistory: Chat = {
      ...chat,
      messages: [
        { role: "user", text: "первый", images: [] },
        { role: "assistant", text: "ответ", images: [] },
        { role: "user", text: "второй", images: [] },
      ],
    };
    const { stream, pipeline } = setup(withHistory, streams());
    pipeline.resendFromMessage(0);
    expect(getActiveChat().messages).toEqual([{ role: "user", text: "первый", images: [] }]);
    expect(stream.send).toHaveBeenCalledWith(
      "c1",
      [{ role: "user", text: "первый", images: [] }],
      "текст пресета",
      chat.model,
      { thinking: false, webSearch: false },
    );
  });

  it("resendFromMessage не перезапускает ответ ассистента", () => {
    const withHistory: Chat = {
      ...chat,
      messages: [
        { role: "user", text: "первый", images: [] },
        { role: "assistant", text: "ответ", images: [] },
      ],
    };
    const { stream, pipeline } = setup(withHistory, streams());
    pipeline.resendFromMessage(1);
    expect(stream.send).not.toHaveBeenCalled();
  });
});
