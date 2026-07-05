import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setPttSuspended = vi.fn<(s: boolean) => Promise<void>>(() => Promise.resolve());
vi.mock("@/ipc/commands", () => ({
  setPttSuspended: (s: boolean) => setPttSuspended(s),
}));

import { usePttSuspend } from "./usePttSuspend";

function focusTextarea() {
  const ta = document.createElement("textarea");
  document.body.appendChild(ta);
  ta.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  return ta;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("usePttSuspend", () => {
  it("буквенный хоткей глушится при фокусе в поле и возвращается на blur", () => {
    renderHook(() => {
      usePttSuspend("V");
    });
    const ta = focusTextarea();
    expect(setPttSuspended).toHaveBeenCalledWith(true);
    ta.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(setPttSuspended).toHaveBeenCalledWith(false);
  });

  it("F9 не глушится: запись стартует и при фокусе в поле промпта", () => {
    renderHook(() => {
      usePttSuspend("F9");
    });
    focusTextarea();
    expect(setPttSuspended).not.toHaveBeenCalled();
  });

  it("размонтирование с буквенным хоткеем снимает заглушку", () => {
    const { unmount } = renderHook(() => {
      usePttSuspend("V");
    });
    focusTextarea();
    unmount();
    expect(setPttSuspended).toHaveBeenLastCalledWith(false);
  });
});
