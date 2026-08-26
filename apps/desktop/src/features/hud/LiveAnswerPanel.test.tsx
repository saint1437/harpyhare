import { cleanup, render } from "@testing-library/react";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerPanelProps } from "./AnswerPanel";

const answerPanelRenders = vi.fn<(props: AnswerPanelProps) => void>();

vi.mock("./AnswerPanel", () => ({
  AnswerPanel: (props: AnswerPanelProps) => {
    answerPanelRenders(props);
    return <div data-testid="answer-panel">{props.partial ?? "нет потока"}</div>;
  },
}));

import { beginStreamState, resetStreamState, setPartials } from "@/state/stream";
import { LiveAnswerPanel } from "./LiveAnswerPanel";

const CHAT_ID = "A";

const STABLE = {
  recordCombo: "Cmd+R",
  messages: [],
  scrollModifier: "Alt",
  onTogglePreview: () => undefined,
  onCopyMessage: () => undefined,
  onRemoveMessage: () => undefined,
  onResendMessage: () => undefined,
};

let bumpParent: () => void = () => undefined;

function Host() {
  const [, setTick] = useState(0);
  bumpParent = () => {
    setTick((t) => t + 1);
  };
  return <LiveAnswerPanel chatId={CHAT_ID} {...STABLE} />;
}

afterEach(() => {
  cleanup();
  resetStreamState();
  answerPanelRenders.mockClear();
});

describe("LiveAnswerPanel", () => {
  it("подписан на текст потока и показывает раскрытый префикс", () => {
    render(<Host />);
    act(() => {
      beginStreamState(CHAT_ID, 0);
    });
    act(() => {
      setPartials({ [CHAT_ID]: "привет" });
    });
    const last = answerPanelRenders.mock.calls.at(-1)?.[0];
    expect(last?.partial).toBe("привет");
    expect(last?.streaming).toBe(true);
  });

  // «Не стримим» — это не «стримим пустоту»: подсказка пустого чата различает.
  it("вне потока отдаёт null, а не пустую строку", () => {
    render(<Host />);
    expect(answerPanelRenders.mock.calls.at(-1)?.[0].partial).toBeNull();
  });

  // Черновик живёт в состоянии чата, поэтому КАЖДОЕ нажатие клавиши в композере
  // перерисовывает корень. Мемоизация — то, что не даёт этому дойти до списка
  // сообщений.
  it("перерисовка родителя с теми же пропсами не доходит до панели", () => {
    render(<Host />);
    const before = answerPanelRenders.mock.calls.length;
    act(() => {
      bumpParent();
    });
    act(() => {
      bumpParent();
    });
    expect(answerPanelRenders.mock.calls.length).toBe(before);
  });

  it("кадр потока панель перерисовывает — она единственный подписчик текста", () => {
    render(<Host />);
    act(() => {
      beginStreamState(CHAT_ID, 0);
    });
    const before = answerPanelRenders.mock.calls.length;
    act(() => {
      setPartials({ [CHAT_ID]: "п" });
    });
    act(() => {
      setPartials({ [CHAT_ID]: "пр" });
    });
    expect(answerPanelRenders.mock.calls.length).toBeGreaterThan(before + 1);
  });
});
