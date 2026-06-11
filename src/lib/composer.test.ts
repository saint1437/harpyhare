import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_LIMIT,
  MAX_IMAGE_BYTES,
  acceptedNewAttachments,
  downscaleFactor,
  extractImageItems,
  toImagePayload,
} from "./composer";

const item = (type: string) =>
  ({ kind: "file", type, getAsFile: () => new File([new Uint8Array(4)], "x", { type }) }) as unknown as DataTransferItem;

describe("extractImageItems", () => {
  it("берёт только image/*", () => {
    const files = extractImageItems([item("image/png"), item("text/plain"), item("image/jpeg")]);
    expect(files.map((f) => f.type)).toEqual(["image/png", "image/jpeg"]);
  });

  it("пустой список → пусто", () => {
    expect(extractImageItems([])).toEqual([]);
  });

  it("svg и не-поддерживаемые image-типы отфильтровываются", () => {
    const files = extractImageItems([item("image/svg+xml"), item("image/webp"), item("image/gif")]);
    expect(files.map((f) => f.type)).toEqual(["image/webp", "image/gif"]);
  });
});

describe("acceptedNewAttachments", () => {
  it("режет по лимиту 5", () => {
    expect(acceptedNewAttachments(0, 3)).toBe(3);
    expect(acceptedNewAttachments(4, 3)).toBe(1);
    expect(acceptedNewAttachments(5, 1)).toBe(0);
    expect(ATTACHMENT_LIMIT).toBe(5);
  });
});

describe("downscaleFactor", () => {
  it("маленькое изображение не трогаем", () => {
    expect(downscaleFactor(1024)).toBe(1);
  });
  it("большое — масштаб по площади с запасом 0.95", () => {
    const f = downscaleFactor(MAX_IMAGE_BYTES * 4);
    expect(f).toBeLessThan(0.5); // sqrt(1/4)*0.95 = 0.475
    expect(f).toBeGreaterThan(0.4);
  });
});

describe("toImagePayload", () => {
  it("формирует {media_type, data} c чистым base64 без dataURL-префикса", () => {
    const p = toImagePayload("data:image/png;base64,QUJD", "image/png");
    expect(p).toEqual({ media_type: "image/png", data: "QUJD" });
  });
  it("строка без запятой возвращается как есть", () => {
    const p = toImagePayload("QUJD", "image/png");
    expect(p.data).toBe("QUJD");
  });
});
