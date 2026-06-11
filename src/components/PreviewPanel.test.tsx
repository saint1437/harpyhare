import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setPreviewHtml = vi.fn<(_h: string) => Promise<void>>(() => Promise.resolve());
vi.mock("@/ipc/commands", () => ({
  setPreviewHtml: (h: string) => setPreviewHtml(h),
}));
vi.mock("@/ipc/env", () => ({ isTauri: () => true }));

import { PreviewPanel } from "./PreviewPanel";

beforeEach(() => {
  setPreviewHtml.mockClear();
});

describe("PreviewPanel", () => {
  it("шлёт html в set_preview_html и грузит iframe с preview://-src", async () => {
    const { container } = render(<PreviewPanel html="<p>hi</p>" onClose={() => undefined} />);
    await waitFor(() => {
      expect(setPreviewHtml).toHaveBeenCalledWith("<p>hi</p>");
    });
    await waitFor(() => {
      const src = container.querySelector("iframe")?.getAttribute("src");
      expect(src).toMatch(/^preview:\/\/localhost\/\?v=\d+$/);
    });
  });

  it("пустой html — заглушка, без iframe", () => {
    const { container, getByText } = render(<PreviewPanel html="" onClose={() => undefined} />);
    expect(container.querySelector("iframe")).toBeNull();
    getByText("Нет содержимого");
  });
});
