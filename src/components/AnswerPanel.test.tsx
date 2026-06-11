import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerPanel } from "./AnswerPanel";
import type { ChatMessage } from "@/lib/chats";

vi.mock("@/ipc/commands", () => ({
  openExternal: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const userMsg: ChatMessage = { role: "user", text: "напиши тетрис", images: [] };

describe("AnswerPanel — индикатор ожидания", () => {
  it("показывает «Думает…», пока стрим без текста", () => {
    const { getByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        partial=""
        streaming={true}
        onCopy={() => undefined}
        onOpenPreview={() => undefined}
      />,
    );
    expect(getByText(/Думает…/)).toBeTruthy();
  });

  it("не показывает индикатор, когда пошёл текст ответа", () => {
    const { queryByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        partial="Привет"
        streaming={true}
        onCopy={() => undefined}
        onOpenPreview={() => undefined}
      />,
    );
    expect(queryByText(/Думает…/)).toBeNull();
  });

  it("не показывает индикатор без стрима", () => {
    const { queryByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        partial={null}
        streaming={false}
        onCopy={() => undefined}
        onOpenPreview={() => undefined}
      />,
    );
    expect(queryByText(/Думает…/)).toBeNull();
  });
});
