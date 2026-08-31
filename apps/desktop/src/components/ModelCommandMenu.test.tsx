import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ModelInfo } from "@/lib/models";
import { STT_PROVIDER_GROQ, STT_PROVIDER_OPENAI } from "@/lib/stt-providers";
import { ModelCommandMenu } from "./ModelCommandMenu";

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  cleanup();
});

const models: ModelInfo[] = [
  {
    id: "claude-opus-5",
    displayName: "Claude Opus 5",
    adaptive: true,
    alwaysThinks: false,
    codeExec: true,
    maxInputTokens: 500000,
  },
  {
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    adaptive: false,
    alwaysThinks: false,
    codeExec: false,
    maxInputTokens: 200000,
  },
];

const renderMenu = (overrides: Partial<Parameters<typeof ModelCommandMenu>[0]> = {}) => {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    sttProvider: STT_PROVIDER_GROQ,
    onSwitchSttProvider: vi.fn(),
    models,
    activeModelId: "claude-haiku-4-5",
    onSelectModel: vi.fn(),
    ...overrides,
  };
  render(<ModelCommandMenu {...props} />);
  return props;
};

describe("ModelCommandMenu", () => {
  it("показывает обе группы и все варианты", () => {
    renderMenu();
    expect(screen.getByText("Голосовая модель")).toBeTruthy();
    expect(screen.getByText("Модель ответа")).toBeTruthy();
    expect(screen.getByText("Groq · Whisper")).toBeTruthy();
    expect(screen.getByText("OpenAI · gpt-4o mini")).toBeTruthy();
    expect(screen.getByText("Opus 5")).toBeTruthy();
    expect(screen.getByText("Haiku 4.5")).toBeTruthy();
  });

  it("выбор голосовой модели переключает провайдер и закрывает меню", () => {
    const props = renderMenu();
    fireEvent.click(screen.getByText("OpenAI · gpt-4o mini"));
    expect(props.onSwitchSttProvider).toHaveBeenCalledWith(STT_PROVIDER_OPENAI);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onSelectModel).not.toHaveBeenCalled();
  });

  it("выбор модели ответа отдаёт id и закрывает меню", () => {
    const props = renderMenu();
    fireEvent.click(screen.getByText("Opus 5"));
    expect(props.onSelectModel).toHaveBeenCalledWith("claude-opus-5");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onSwitchSttProvider).not.toHaveBeenCalled();
  });

  it("модель чата вне каталога всё равно попадает в список", () => {
    renderMenu({ activeModelId: "claude-sonnet-4" });
    expect(screen.getByText("claude-sonnet-4")).toBeTruthy();
  });
});
