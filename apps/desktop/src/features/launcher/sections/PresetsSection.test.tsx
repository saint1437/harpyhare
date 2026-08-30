import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptPreset } from "@/lib/presets";

const OFFICIAL_PRESET: PromptPreset = {
  id: "golang",
  name: "Golang",
  text: "Ты — senior Go-инженер на техническом собеседовании.",
};

vi.mock("@/hooks/useOfficialPresets", () => ({
  useOfficialPresets: () => [OFFICIAL_PRESET],
}));

import { PresetsSection, type PresetsUpdate } from "./PresetsSection";

const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());

function Harness({ initial }: { initial: PromptPreset[] }) {
  const [presets, setPresets] = useState(initial);
  return (
    <PresetsSection
      presets={presets}
      onChange={(update: PresetsUpdate) => {
        setPresets(update);
      }}
    />
  );
}

function officialToggle(): HTMLButtonElement {
  const toggle = screen.getByText(OFFICIAL_PRESET.name).closest("button");
  if (!toggle) throw new Error("строка встроенного пресета не найдена");
  return toggle;
}

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PresetsSection", () => {
  it("клик по встроенному пресету разворачивает и сворачивает полный текст", () => {
    render(<Harness initial={[]} />);
    expect(officialToggle().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(officialToggle());
    expect(officialToggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(OFFICIAL_PRESET.text)).not.toBeNull();
    fireEvent.click(officialToggle());
    expect(officialToggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("«Копировать текст» кладёт полный текст пресета в буфер обмена", () => {
    render(<Harness initial={[]} />);
    fireEvent.click(screen.getByTitle("Копировать текст"));
    expect(writeText).toHaveBeenCalledWith(OFFICIAL_PRESET.text);
  });

  it("«Скопировать в свои» создаёт редактируемую копию и открывает её редактор", () => {
    render(<Harness initial={[]} />);
    fireEvent.click(screen.getByTitle("Скопировать в свои"));
    const name = screen.getByLabelText<HTMLInputElement>("Имя пресета");
    const text = screen.getByLabelText<HTMLTextAreaElement>("Текст пресета");
    expect(name.value).toBe("Golang (копия)");
    expect(text.value).toBe(OFFICIAL_PRESET.text);
  });

  it("у копии свой id — встроенный оригинал не перекрывается", () => {
    const onChange = vi.fn<(update: PresetsUpdate) => void>();
    render(<PresetsSection presets={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTitle("Скопировать в свои"));
    const update = onChange.mock.calls[0]?.[0];
    if (!update) throw new Error("onChange не вызван");
    const copy = update([])[0];
    if (!copy) throw new Error("копия не создана");
    expect(copy.id).not.toBe(OFFICIAL_PRESET.id);
    expect(copy.text).toBe(OFFICIAL_PRESET.text);
  });
});
