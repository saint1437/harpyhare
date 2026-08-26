import { cleanup, act, render } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/commands", () => ({
  openExternal: vi.fn(),
}));

import { createChat } from "@/lib/chats";
import { adoptChats, getActiveChatId, patchChat, resetChatsState } from "@/state/chats";
import { beginStreamState, resetStreamState, setPartials } from "@/state/stream";
import { ChatTabs } from "./ChatTabs";
import { LiveAnswerPanel } from "./LiveAnswerPanel";

/**
 * The point of the two module stores, measured rather than asserted in prose.
 *
 * Both of them exist because the HUD used to re-render whole: the draft lived
 * in the chat's state, so a keystroke rebuilt the chats and every panel with
 * them; the revealed answer lived in the root, so every frame of the rAF reveal
 * did the same. A `Profiler` fires only when something INSIDE it commits, which
 * makes "did this panel re-render" a number instead of an opinion.
 */
function commitCounter(): { onRender: ProfilerOnRenderCallback; count: () => number } {
  let commits = 0;
  return {
    onRender: () => {
      commits += 1;
    },
    count: () => commits,
  };
}

const NOOP = () => undefined;

function renderHud(
  tabsProfiler: ProfilerOnRenderCallback,
  answerProfiler: ProfilerOnRenderCallback,
) {
  return render(
    <>
      <Profiler id="tabs" onRender={tabsProfiler}>
        <ChatTabs onStopStream={NOOP} duplicateCombo="Cmd+Shift+N" />
      </Profiler>
      <Profiler id="answer" onRender={answerProfiler}>
        <LiveAnswerPanel
          chatId={getActiveChatId()}
          messages={[]}
          recordCombo="Cmd+R"
          scrollModifier="Alt"
          onTogglePreview={NOOP}
          onCopyMessage={NOOP}
          onRemoveMessage={NOOP}
          onResendMessage={NOOP}
        />
      </Profiler>
    </>,
  );
}

beforeEach(() => {
  adoptChats([createChat(1, "c1")], "c1");
});

afterEach(() => {
  cleanup();
  resetChatsState();
  resetStreamState();
});

describe("HUD — что чей рендер задевает", () => {
  it("набор текста в композере не перерисовывает ни панель ответа, ни вкладки", () => {
    const tabs = commitCounter();
    const answer = commitCounter();
    renderHud(tabs.onRender, answer.onRender);
    const before = { tabs: tabs.count(), answer: answer.count() };

    for (const draft of ["п", "пр", "при", "прив", "привет"]) {
      act(() => {
        patchChat("c1", { draft });
      });
    }

    expect(tabs.count()).toBe(before.tabs);
    expect(answer.count()).toBe(before.answer);
  });

  it("дельта стрима перерисовывает панель ответа и не трогает вкладки", () => {
    const tabs = commitCounter();
    const answer = commitCounter();
    renderHud(tabs.onRender, answer.onRender);

    // Старт стрима зажигает точку на вкладке — это ОДИН коммит на ответ,
    // а не шестьдесят в секунду. Считаем всё, что после него.
    act(() => {
      beginStreamState("c1", 0);
    });
    const before = { tabs: tabs.count(), answer: answer.count() };

    for (const partial of ["О", "От", "Отв", "Отве", "Ответ"]) {
      act(() => {
        setPartials({ c1: partial });
      });
    }

    expect(tabs.count()).toBe(before.tabs);
    expect(answer.count()).toBeGreaterThanOrEqual(before.answer + 5);
  });

  // Обратная сторона мемоизации: она обязана пропускать то, что действительно
  // изменилось, иначе «не перерисовывается» превращается в «не обновляется».
  it("новые сообщения проходят сквозь memo панели ответа", () => {
    const tabs = commitCounter();
    const answer = commitCounter();
    const { rerender } = renderHud(tabs.onRender, answer.onRender);
    const before = answer.count();

    rerender(
      <>
        <Profiler id="tabs" onRender={tabs.onRender}>
          <ChatTabs onStopStream={NOOP} duplicateCombo="Cmd+Shift+N" />
        </Profiler>
        <Profiler id="answer" onRender={answer.onRender}>
          <LiveAnswerPanel
            chatId="c1"
            messages={[{ role: "user", text: "вопрос", images: [] }]}
            recordCombo="Cmd+R"
            scrollModifier="Alt"
            onTogglePreview={NOOP}
            onCopyMessage={NOOP}
            onRemoveMessage={NOOP}
            onResendMessage={NOOP}
          />
        </Profiler>
      </>,
    );

    expect(answer.count()).toBeGreaterThan(before);
  });
});
