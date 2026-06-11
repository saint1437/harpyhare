import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPreviewHtml = vi.fn(() => Promise.resolve("<p>старт</p>"));
let previewHandler: ((html: string) => void) | null = null;
const offPreview = vi.fn();

vi.mock("@/ipc/commands", () => ({
  getPreviewHtml: () => getPreviewHtml(),
}));
vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: (p: string) => void) => {
    if (name === "preview-html") previewHandler = handler;
    return offPreview;
  },
}));

import { usePreviewHtml } from "./usePreviewHtml";

beforeEach(() => {
  getPreviewHtml.mockClear();
  offPreview.mockClear();
  previewHandler = null;
});

describe("usePreviewHtml", () => {
  it("на маунте забирает текущий HTML", async () => {
    const { result } = renderHook(() => usePreviewHtml());
    await waitFor(() => {
      expect(result.current).toBe("<p>старт</p>");
    });
  });

  it("обновляется по событию preview-html", async () => {
    const { result } = renderHook(() => usePreviewHtml());
    await waitFor(() => {
      expect(result.current).toBe("<p>старт</p>");
    });
    act(() => {
      previewHandler?.("<p>замена</p>");
    });
    expect(result.current).toBe("<p>замена</p>");
  });

  it("отписывается на unmount", () => {
    const { unmount } = renderHook(() => usePreviewHtml());
    unmount();
    expect(offPreview).toHaveBeenCalled();
  });
});
