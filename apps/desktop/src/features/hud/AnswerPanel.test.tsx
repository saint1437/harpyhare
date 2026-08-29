import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dictionary } from "@/i18n";
import { AnswerPanel } from "./AnswerPanel";
import type { ChatMessage } from "@/lib/chats";

const hud = dictionary("ru").hud;

vi.mock("@/ipc/commands", () => ({
  openExternal: vi.fn(),
}));

const { dataUrlBuilds, copyableChecks } = vi.hoisted(() => ({
  dataUrlBuilds: { count: 0 },
  copyableChecks: { count: 0 },
}));

/** Called once per rendered message row — the cheapest render counter there is. */
vi.mock("@/lib/message-clipboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/message-clipboard")>();
  return {
    ...actual,
    isMessageCopyable: (message: Parameters<typeof actual.isMessageCopyable>[0]) => {
      copyableChecks.count += 1;
      return actual.isMessageCopyable(message);
    },
  };
});

vi.mock("@/lib/composer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/composer")>();
  return {
    ...actual,
    imageDataUrl: (image: Parameters<typeof actual.imageDataUrl>[0]) => {
      dataUrlBuilds.count += 1;
      return actual.imageDataUrl(image);
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const userMsg: ChatMessage = { role: "user", text: "напиши тетрис", images: [] };

/**
 * The markdown pipeline is behind `lazy`, so the first paint of an answer is its
 * raw text; awaiting the dynamic import is what these tests are really waiting
 * for. `Suspense` keeps the user's own bubbles on screen throughout — see the
 * data-URL test below, which would double its count if the boundary wrapped the
 * whole list.
 */
async function settleMarkdown(): Promise<void> {
  await act(async () => {
    await import("./AnswerMarkdown");
  });
}

describe("AnswerPanel — подсветка кода", () => {
  it("код с языком получает hljs-токены", async () => {
    const assistant: ChatMessage = {
      role: "assistant",
      text: 'Вот:\n\n```js\nconst a = "строка"; // комментарий\n```\n',
      images: [],
    };
    const { container } = render(
      <AnswerPanel
        messages={[assistant]}
        recordCombo="Cmd+R"
        partial={null}
        streaming={false}
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />,
    );
    await settleMarkdown();
    expect(container.querySelector("code.hljs")).toBeTruthy();
    expect(container.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(container.querySelector(".hljs-string")).toBeTruthy();
    expect(container.querySelector(".hljs-comment")).toBeTruthy();
  });

  it("код без языка автоопределяется", async () => {
    const assistant: ChatMessage = {
      role: "assistant",
      text: "```\ndef main():\n    return 42\n```\n",
      images: [],
    };
    const { container } = render(
      <AnswerPanel
        messages={[assistant]}
        recordCombo="Cmd+R"
        partial={null}
        streaming={false}
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />,
    );
    await settleMarkdown();
    expect(container.querySelector(".hljs-keyword")).toBeTruthy();
  });

  it("```html остаётся чипом превью, а не подсвеченным кодом", async () => {
    const assistant: ChatMessage = {
      role: "assistant",
      text: "```html\n<h1>привет</h1>\n```\n",
      images: [],
    };
    const { container, getByText } = render(
      <AnswerPanel
        messages={[assistant]}
        recordCombo="Cmd+R"
        partial={null}
        streaming={false}
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />,
    );
    await settleMarkdown();
    expect(getByText(new RegExp(hud.htmlBlock.openPreview))).toBeTruthy();
    expect(container.querySelector("code.hljs")).toBeNull();
  });
});

describe("AnswerPanel — индикатор ожидания", () => {
  it("показывает «Думает…», пока стрим без текста", () => {
    const { getByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        recordCombo="Cmd+R"
        partial=""
        streaming={true}
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />,
    );
    expect(getByText(hud.thinking.label)).toBeTruthy();
  });

  it("не показывает индикатор, когда пошёл текст ответа", () => {
    const { queryByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        recordCombo="Cmd+R"
        partial="Привет"
        streaming={true}
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />,
    );
    expect(queryByText(hud.thinking.label)).toBeNull();
  });

  it("не показывает индикатор без стрима", () => {
    const { queryByText } = render(
      <AnswerPanel
        messages={[userMsg]}
        recordCombo="Cmd+R"
        partial={null}
        streaming={false}
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />,
    );
    expect(queryByText(hud.thinking.label)).toBeNull();
  });
});

describe("AnswerPanel — картинки в сообщении пользователя", () => {
  const withImage: ChatMessage = {
    role: "user",
    text: "что тут не так?",
    images: [{ id: "00000000000000aa.png", media_type: "image/png", data: "iVBORw0K" }],
  };

  function renderMessages(messages: ChatMessage[]) {
    return render(
      <AnswerPanel
        messages={messages}
        recordCombo="Cmd+R"
        partial={null}
        streaming={false}
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />,
    );
  }

  it("отправленная картинка видна в пузыре, а не только уходит в запрос", () => {
    const { container } = renderMessages([withImage]);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,iVBORw0K");
  });

  it("текст сообщения остаётся рядом с картинкой", () => {
    const { container } = renderMessages([withImage]);
    expect(container.textContent).toContain("что тут не так?");
  });

  it("сообщение без картинок не рисует пустых img", () => {
    const { container } = renderMessages([userMsg]);
    expect(container.querySelector("img")).toBeNull();
  });

  it("data-URL не пересобирается на каждый кадр стрима", () => {
    const messages = [withImage];
    const panel = (partial: string) => (
      <AnswerPanel
        messages={messages}
        recordCombo="Cmd+R"
        partial={partial}
        streaming
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />
    );
    const { rerender } = render(panel("от"));
    const afterFirstFrame = dataUrlBuilds.count;
    expect(afterFirstFrame).toBeGreaterThan(0);

    rerender(panel("отв"));
    rerender(panel("ответ"));

    expect(dataUrlBuilds.count).toBe(afterFirstFrame);
  });

  it("картинка без текста показывается сама по себе", () => {
    const { container } = renderMessages([{ ...withImage, text: "" }]);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
});

describe("AnswerPanel — кнопки сообщений", () => {
  const assistant: ChatMessage = { role: "assistant", text: "Ответ", images: [] };

  function renderPanel(messages: ChatMessage[]) {
    return render(
      <AnswerPanel
        messages={messages}
        recordCombo="Cmd+R"
        partial={null}
        streaming={false}
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />,
    );
  }

  // Раньше под кнопки держался постоянный жёлоб в 54px — на каждой строке
  // каждого ответа, всегда. В узком окне это пятая часть ширины, и текст ответа
  // оказывался заметно уже своих же сообщений.
  it("у ответа кнопки не занимают ширину", () => {
    const { container } = renderPanel([assistant]);
    const chip = container.querySelector(".absolute.right-0.bottom-0");
    expect(chip).not.toBeNull();
    expect(container.querySelector("[class*='pr-13.5']")).toBeNull();
  });

  // Поток и история должны совпадать по правому краю: пока жёлоб существовал,
  // его ширину приходилось дублировать в StreamingAssistant вручную, и любая
  // добавленная кнопка молча разъезжала их.
  it("поток и дописанный ответ выровнены одинаково", () => {
    const streamed = render(
      <AnswerPanel
        messages={[]}
        recordCombo="Cmd+R"
        partial="Ответ"
        streaming
        scrollModifier="Alt"
        onTogglePreview={() => undefined}
        onCopyMessage={() => undefined}
        onRemoveMessage={() => undefined}
        onResendMessage={() => undefined}
      />,
    );
    const streamingProse = streamed.container.querySelector(".prose-answer")?.className ?? "";
    cleanup();
    const { container } = renderPanel([assistant]);
    const historyProse = container.querySelector(".prose-answer")?.className ?? "";
    expect(streamingProse).toBe(historyProse);
  });

  // У своего сообщения свободная зона слева есть, и там кнопки ничего не отнимают.
  it("у своего сообщения кнопки остаются в потоке слева", () => {
    const { container } = renderPanel([userMsg]);
    expect(container.querySelector(".absolute.right-0.bottom-0")).toBeNull();
  });

  // Позиции разные по необходимости, но выглядеть они обязаны одинаково.
  it("подложка кнопок одна и та же у обеих сторон", () => {
    const mine = renderPanel([userMsg]);
    const minePlate = mine.container.querySelector(".bg-elevated\\/95")?.className ?? "";
    cleanup();
    const theirs = renderPanel([assistant]);
    const theirsPlate = theirs.container.querySelector(".bg-elevated\\/95")?.className ?? "";
    expect(minePlate).not.toBe("");
    for (const shared of ["rounded-md", "p-0.5", "bg-elevated/95", "shadow-pop"]) {
      expect(minePlate).toContain(shared);
      expect(theirsPlate).toContain(shared);
    }
  });
});

describe("AnswerPanel — что переживает кадр потока", () => {
  const STABLE = "Начало\n\n```js\nconst a = 1;\n```\n\n";
  const NOTHING: ChatMessage[] = [];
  const HISTORY: ChatMessage[] = [
    userMsg,
    { role: "assistant", text: "Прошлый ответ", images: [] },
  ];
  // Ровно то, чем они являются в HUD: useCallback-и, стабильные между кадрами.
  const NOOP = () => undefined;

  function streamPanel(partial: string, messages: ChatMessage[] = NOTHING) {
    return (
      <AnswerPanel
        messages={messages}
        recordCombo="Cmd+R"
        partial={partial}
        streaming
        scrollModifier="Alt"
        onTogglePreview={NOOP}
        onCopyMessage={NOOP}
        onRemoveMessage={NOOP}
        onResendMessage={NOOP}
      />
    );
  }

  // `components` собирался в теле рендера, и вместе с объектом заново рождался
  // ТИП компонента `pre`: memo(MarkdownChunk) не попадал никогда, устоявшийся
  // префикс переразбирался, а каждый код-блок перемонтировался — шестьдесят раз
  // в секунду. Тождество узла <pre> и есть проверка, что memo держит.
  it("код-блок в устоявшемся префиксе не перемонтируется на каждом кадре", async () => {
    const { container, rerender } = render(streamPanel(STABLE + "Хвост"));
    await settleMarkdown();
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(container.querySelector("code.hljs")).toBeTruthy();

    rerender(streamPanel(STABLE + "Хвост подлиннее"));
    rerender(streamPanel(STABLE + "Хвост ещё длиннее"));

    expect(container.querySelector("pre")).toBe(pre);
  });

  it("история не перерисовывается, пока растёт ответ", async () => {
    const { rerender } = render(streamPanel("от", HISTORY));
    await settleMarkdown();
    copyableChecks.count = 0;

    rerender(streamPanel("отв", HISTORY));
    rerender(streamPanel("ответ", HISTORY));

    expect(copyableChecks.count).toBe(0);
  });
});
