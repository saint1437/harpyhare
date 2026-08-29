import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePersistedStore, type PersistedStoreOptions } from "./usePersistedStore";

const DEBOUNCE_MS = 500;

interface Doc {
  items: string[];
}

const EMPTY: Doc = { items: [] };

function options(overrides: Partial<PersistedStoreOptions<Doc>> = {}): PersistedStoreOptions<Doc> {
  return {
    initial: EMPTY,
    load: () => Promise.resolve('{"items":["a"]}'),
    save: () => Promise.resolve(),
    restore: (json) => (json === "" ? EMPTY : (JSON.parse(json) as Doc)),
    serialize: (value) => JSON.stringify(value),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePersistedStore", () => {
  it("читает файл, принимает его и сообщает об этом", async () => {
    const onLoaded = vi.fn();
    const { result } = renderHook(() => usePersistedStore(options({ onLoaded })));
    await waitFor(() => {
      expect(result.current.loaded.current).toBe(true);
    });
    expect(result.current.value).toEqual({ items: ["a"] });
    expect(onLoaded).toHaveBeenCalledWith({ items: ["a"] });
  });

  it("не пишет ничего, пока файл не прочитан", async () => {
    const save = vi.fn(() => Promise.resolve());
    let release: (json: string) => void = () => {
      throw new Error("load не начался");
    };
    const load = () =>
      new Promise<string>((resolve) => {
        release = resolve;
      });
    renderHook(() => usePersistedStore(options({ load, save })));
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 3);
      await Promise.resolve();
    });
    // The startup state is empty; writing it here is how the real chats file
    // used to be replaced by nothing.
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      release('{"items":["a"]}');
      await Promise.resolve();
    });
  });

  it("пишет изменение с дебаунсом и один раз на серию", async () => {
    const save = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => usePersistedStore(options({ save })));
    await waitFor(() => {
      expect(result.current.loaded.current).toBe(true);
    });
    save.mockClear();
    act(() => {
      result.current.setValue({ items: ["a", "b"] });
    });
    act(() => {
      result.current.setValue({ items: ["a", "b", "c"] });
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('{"items":["a","b","c"]}');
  });

  // The reason Rust stopped answering "" for a failed read: an unreadable file
  // is not an empty one, and the debounce must never get the chance to "fix" it.
  it("отказ чтения не даёт записать пустое состояние поверх файла", async () => {
    const save = vi.fn(() => Promise.resolve());
    const onLoadError = vi.fn();
    const { result } = renderHook(() =>
      usePersistedStore(
        options({
          load: () => Promise.reject(new Error("нет доступа")),
          save,
          onLoadError,
        }),
      ),
    );
    await waitFor(() => {
      expect(onLoadError).toHaveBeenCalled();
    });
    act(() => {
      result.current.setValue({ items: ["новое"] });
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 3);
      await Promise.resolve();
    });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.loaded.current).toBe(false);
  });

  it("hydrate, вернувший null, отменяет загрузку целиком", async () => {
    const save = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      usePersistedStore(options({ save, hydrate: () => Promise.resolve(null) })),
    );
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 3);
      await Promise.resolve();
    });
    expect(result.current.loaded.current).toBe(false);
    expect(result.current.value).toEqual(EMPTY);
    expect(save).not.toHaveBeenCalled();
  });

  // Сериализация документа неизбежна, а вот круг IPC и запись на диск — нет:
  // библиотека контекста доходит до сотни материалов по 200 000 символов.
  it("документ, совпавший с последним записанным, не пишется второй раз", async () => {
    const save = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => usePersistedStore(options({ save })));
    await waitFor(() => {
      expect(result.current.loaded.current).toBe(true);
    });
    save.mockClear();

    act(() => {
      result.current.setValue({ items: ["b"] });
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);

    // Новая ссылка, тот же документ: React перерисуется, диск — нет.
    act(() => {
      result.current.setValue({ items: ["b"] });
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setValue({ items: ["b", "c"] });
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  // Упавшая запись — не запись: иначе повтор той же правки пропустили бы как
  // «уже сохранено», и на диске не осталось бы ничего.
  it("после отказа записи такой же документ пишется снова", async () => {
    const save = vi.fn(() => Promise.reject(new Error("диск полон")));
    const onSaveError = vi.fn();
    const { result } = renderHook(() => usePersistedStore(options({ save, onSaveError })));
    await waitFor(() => {
      expect(result.current.loaded.current).toBe(true);
    });
    save.mockClear();

    act(() => {
      result.current.setValue({ items: ["b"] });
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(onSaveError).toHaveBeenCalled();
    });
    expect(save).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setValue({ items: ["b"] });
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("отказ записи уходит в onSaveError, а не в неперехваченный промис", async () => {
    const onSaveError = vi.fn();
    const { result } = renderHook(() =>
      usePersistedStore(
        options({ save: () => Promise.reject(new Error("диск полон")), onSaveError }),
      ),
    );
    await waitFor(() => {
      expect(result.current.loaded.current).toBe(true);
    });
    act(() => {
      result.current.setValue({ items: ["b"] });
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(onSaveError).toHaveBeenCalledWith("Error: диск полон");
    });
  });
});
