import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioCheck, AudioSource } from "@/ipc/types";

type LevelHandler = (payload: { level: number }) => void;
const levelHandlers: LevelHandler[] = [];
const checkAudioSource = vi.fn<(source: AudioSource) => Promise<AudioCheck>>();

vi.mock("@/ipc/events", () => ({
  onEvent: (name: string, handler: LevelHandler) => {
    if (name === "audio-level") levelHandlers.push(handler);
    return () => {
      levelHandlers.length = 0;
    };
  },
}));
vi.mock("@/ipc/commands", () => ({
  checkAudioSource: (source: AudioSource) => checkAudioSource(source),
}));

import { useAudioCheck } from "@/hooks/useAudioCheck";
import { format, getDict } from "@/i18n";
import { errorTitle } from "@/i18n/errors";
import { dismissAllNotifications, getNotifications } from "@/lib/notifications";
import { AudioCheckCard } from "./AudioCheckCard";

// Хук поднят в LauncherPanel, чтобы шапка могла сказать «Слушаю», пока проверка
// открывает настоящий тап. Тест по-прежнему проверяет связку хук + карточка.
function Card({ autoModeEnabled }: { autoModeEnabled: boolean }) {
  return <AudioCheckCard autoModeEnabled={autoModeEnabled} check={useAudioCheck()} />;
}

function copy() {
  return getDict().launcher.audioCheck;
}

const SYSTEM_ROW = copy().sources.system.label;
const MIC_ROW = copy().sources.microphone.label;

function row(label: string) {
  const node = screen.getByText(label).closest("div[class*='grid']");
  if (!node) throw new Error(`строка «${label}» не найдена`);
  return within(node as HTMLElement);
}

function deferredCheck() {
  let resolve: (value: AudioCheck) => void = () => undefined;
  checkAudioSource.mockReturnValueOnce(
    new Promise<AudioCheck>((r) => {
      resolve = r;
    }),
  );
  return {
    resolve: (value: AudioCheck) => {
      resolve(value);
    },
  };
}

afterEach(() => {
  cleanup();
  dismissAllNotifications();
  levelHandlers.length = 0;
  vi.clearAllMocks();
});

describe("AudioCheckCard", () => {
  it("проверка системного звука показывает расслышанный текст", async () => {
    checkAudioSource.mockResolvedValueOnce({ heard: true, text: "раз, два, три" });
    render(<Card autoModeEnabled={false} />);
    fireEvent.click(row(SYSTEM_ROW).getByText(copy().run));
    expect(checkAudioSource).toHaveBeenCalledExactlyOnceWith("system");
    await waitFor(() => {
      expect(screen.getByText(format(copy().heard, { text: "раз, два, три" }))).not.toBeNull();
    });
  });

  it("тишина названа тишиной, а не молчаливым успехом", async () => {
    checkAudioSource.mockResolvedValueOnce({ heard: false, text: "" });
    render(<Card autoModeEnabled={false} />);
    fireEvent.click(row(SYSTEM_ROW).getByText(copy().run));
    await waitFor(() => {
      expect(screen.getByText(copy().silence)).not.toBeNull();
    });
  });

  it("звук есть, а речи нет — это отдельный ответ", async () => {
    checkAudioSource.mockResolvedValueOnce({ heard: true, text: "" });
    render(<Card autoModeEnabled={false} />);
    fireEvent.click(row(SYSTEM_ROW).getByText(copy().run));
    await waitFor(() => {
      expect(screen.getByText(copy().noSpeech)).not.toBeNull();
    });
  });

  // Текст отказа с бэкенда бывает длиннее самой строки настроек, поэтому он
  // уходит в уведомление, а подсказка возвращается к своему обычному виду.
  it("отказ уходит в уведомление, а подсказка строки не ломается", async () => {
    checkAudioSource.mockRejectedValueOnce({ code: "permission", message: "Нет доступа" });
    render(<Card autoModeEnabled={false} />);
    fireEvent.click(row(SYSTEM_ROW).getByText(copy().run));
    await waitFor(() => {
      expect(getNotifications()).toHaveLength(1);
    });
    expect(getNotifications()[0]?.title).toBe(errorTitle("permission", getDict()));
    expect(getNotifications()[0]?.detail).toBe("Нет доступа");
    expect(row(SYSTEM_ROW).getByText(copy().sources.system.hint)).not.toBeNull();
  });

  it("пока проверка идёт, второй запуск невозможен, а уровень виден", async () => {
    const pending = deferredCheck();
    render(<Card autoModeEnabled={false} />);
    fireEvent.click(row(SYSTEM_ROW).getByText(copy().run));
    const button = screen.getByText(copy().running).closest("button");
    expect(button?.disabled).toBe(true);

    levelHandlers.forEach((handler) => {
      handler({ level: 0.5 });
    });
    await waitFor(() => {
      expect(document.querySelector("span[style*='width: 50%']")).not.toBeNull();
    });

    pending.resolve({ heard: true, text: "слышно" });
    await waitFor(() => {
      expect(screen.getByText(format(copy().heard, { text: "слышно" }))).not.toBeNull();
    });
  });

  it("микрофон проверяется только там, где он нужен — при автослушании", () => {
    const { rerender } = render(<Card autoModeEnabled={false} />);
    expect(screen.queryByText(MIC_ROW)).toBeNull();
    rerender(<Card autoModeEnabled />);
    expect(screen.getByText(MIC_ROW)).not.toBeNull();
  });
});
