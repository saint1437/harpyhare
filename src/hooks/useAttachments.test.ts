import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/composer", async (orig) => {
  const real = await orig<typeof import("@/lib/composer")>();
  return { ...real };
});

import { useAttachments } from "./useAttachments";

function imgItem(type = "image/png"): DataTransferItem {
  return {
    kind: "file",
    type,
    getAsFile: () => new File([new Uint8Array(8)], "s.png", { type }),
  } as unknown as DataTransferItem;
}
function clipboard(items: DataTransferItem[]): DataTransferItemList {
  return items as unknown as DataTransferItemList;
}

describe("useAttachments", () => {
  it("добавляет вложение из вставки (мелкий файл — без даунскейла)", async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.addFromPaste(clipboard([imgItem()]));
    });
    expect(result.current.attachments.length).toBe(1);
    expect(result.current.attachments[0].payload.media_type).toBe("image/png");
  });

  it("не превышает лимит 5", async () => {
    const { result } = renderHook(() => useAttachments());
    const many = Array.from({ length: 7 }, () => imgItem());
    await act(async () => {
      await result.current.addFromPaste(clipboard(many));
    });
    expect(result.current.attachments.length).toBe(5);
  });

  it("remove удаляет по индексу, clear очищает", async () => {
    const { result } = renderHook(() => useAttachments());
    await act(async () => {
      await result.current.addFromPaste(clipboard([imgItem(), imgItem()]));
    });
    act(() => result.current.remove(0));
    expect(result.current.attachments.length).toBe(1);
    act(() => result.current.clear());
    expect(result.current.attachments.length).toBe(0);
  });

  it("игнорирует вставку без картинок", async () => {
    const { result } = renderHook(() => useAttachments());
    const textItem = { kind: "string", type: "text/plain", getAsFile: () => null } as unknown as DataTransferItem;
    await act(async () => {
      await result.current.addFromPaste(clipboard([textItem]));
    });
    expect(result.current.attachments.length).toBe(0);
  });
});
