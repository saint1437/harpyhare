import { describe, expect, it } from "vitest";
import { createChat, type Chat, type ChatMessage } from "./chats";
import { addDoc, addFolder, EMPTY_LIBRARY } from "./context-library";
import {
  chatSystemPrompt,
  draftImages,
  historyWithNewUserMessage,
  requestImages,
  requestMessages,
} from "./chat-request";
import type { PromptPreset } from "./presets";

const PRESETS: PromptPreset[] = [{ id: "p", name: "Пресет", text: "текст пресета" }];

function chatWith(extra: Partial<Chat> = {}): Chat {
  return { ...createChat(1, "c1"), ...extra };
}

const IMAGE = { id: "img1", media_type: "image/png", data: "AAAA" };

describe("chat-request", () => {
  it("картинки уходят байтами, без id", () => {
    expect(requestImages([IMAGE])).toEqual([{ media_type: "image/png", data: "AAAA" }]);
  });

  it("история переводится в DTO целиком — API не хранит состояние", () => {
    const messages: ChatMessage[] = [
      { role: "user", text: "вопрос", images: [IMAGE] },
      { role: "assistant", text: "ответ", images: [] },
    ];
    expect(requestMessages(messages)).toEqual([
      { role: "user", text: "вопрос", images: [{ media_type: "image/png", data: "AAAA" }] },
      { role: "assistant", text: "ответ", images: [] },
    ]);
  });

  it("отправляемое сообщение дописывается в хвост — в chat.messages его ещё нет", () => {
    const chat = chatWith({ messages: [{ role: "user", text: "старое", images: [] }] });
    const history = historyWithNewUserMessage(chat, "новое", []);
    expect(history).toHaveLength(2);
    expect(history[1]).toEqual({ role: "user", text: "новое", images: [] });
  });

  it("draftImages берёт картинки из вложений черновика", () => {
    const chat = chatWith({
      draftAttachments: [{ id: "a", payload: { media_type: "image/png", data: "X" }, preview: "" }],
    });
    expect(draftImages(chat)).toEqual([{ id: "a", media_type: "image/png", data: "X" }]);
  });

  it("системный промпт складывается из препромпта, материалов и контекста чата", () => {
    const lib = addDoc(
      addFolder(EMPTY_LIBRARY, "П", "f1"),
      { name: "Резюме", text: "текст резюме", folderId: "f1" },
      "d1",
    );
    const chat = chatWith({ presetId: "p", libraryDocIds: ["d1"], context: "вакансия" });
    const system = chatSystemPrompt(PRESETS, chat, lib);
    expect(system).toContain("текст пресета");
    expect(system).toContain("текст резюме");
    expect(system).toContain("вакансия");
    expect(system.split("\n\n")[0]).toBe("текст пресета");
  });

  it("пустые части не оставляют пустых абзацев", () => {
    const chat = chatWith({ presetId: "", libraryDocIds: [], context: "   " });
    expect(chatSystemPrompt(PRESETS, chat, EMPTY_LIBRARY)).toBe("");
  });
});
