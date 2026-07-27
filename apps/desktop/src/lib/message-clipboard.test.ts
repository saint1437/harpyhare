import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./chats";
import {
  imagePngBase64,
  isMessageCopyable,
  messageCopyImage,
  messageCopyText,
} from "./message-clipboard";

const PNG = { media_type: "image/png", data: "iVBORw0K" };

function message(text: string, images: ChatMessage["images"] = []): ChatMessage {
  return { role: "user", text, images };
}

describe("что копируется из сообщения", () => {
  it("текст копируется без обрамляющих пробелов", () => {
    expect(messageCopyText(message("  вопрос \n"))).toBe("вопрос");
  });

  it("при непустом тексте картинка не подменяет его", () => {
    expect(messageCopyImage(message("что тут не так?", [PNG]))).toBeNull();
  });

  it("у сообщения из одной картинки копируется картинка", () => {
    expect(messageCopyImage(message("", [PNG]))).toEqual(PNG);
    expect(messageCopyImage(message("   ", [PNG]))).toEqual(PNG);
  });

  it("копировать нечего только у пустого сообщения без картинок", () => {
    expect(isMessageCopyable(message(""))).toBe(false);
    expect(isMessageCopyable(message("", [PNG]))).toBe(true);
    expect(isMessageCopyable(message("текст"))).toBe(true);
  });
});

describe("imagePngBase64", () => {
  it("готовый PNG отдаётся как есть, без перекодирования через холст", async () => {
    await expect(imagePngBase64(PNG)).resolves.toBe(PNG.data);
  });
});
