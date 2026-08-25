import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StateBadge, type StateTone } from "./StateBadge";

const TONES: StateTone[] = ["success", "danger", "warning", "listening", "neutral"];

describe("StateBadge", () => {
  // Правило «цвет никогда не единственный носитель» держится этим тестом, а не
  // договорённостью: success и danger обязаны проходить 3:1 по одному и тому же
  // фону, поэтому неизбежно оказываются близки по светлоте и неразличимы при
  // красно-зелёной слепоте. Глиф и слово — то, что их на самом деле разделяет.
  it("каждый тон несёт и глиф, и слово", () => {
    for (const tone of TONES) {
      const { container, unmount } = render(<StateBadge tone={tone} label={`метка-${tone}`} />);
      expect(screen.getByText(`метка-${tone}`)).toBeTruthy();
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("глифы разных тонов отличаются друг от друга", () => {
    const glyphs = TONES.map((tone) => {
      const { container, unmount } = render(<StateBadge tone={tone} label="x" />);
      const cls = container.querySelector("svg")?.getAttribute("class") ?? "";
      unmount();
      return cls;
    });
    expect(new Set(glyphs).size).toBe(TONES.length);
  });

  it("labelHidden прячет слово от глаз, но не от скринридера", () => {
    render(<StateBadge tone="success" label="выдан" labelHidden />);
    const word = screen.getByText("выдан");
    expect(word.className).toContain("sr-only");
  });

  // Единственная анимация в словаре состояний — и она не должна быть
  // единственным носителем: кольцо остаётся на месте при reduced-motion.
  it("только «слушаю» дышит", () => {
    for (const tone of TONES) {
      const { container, unmount } = render(<StateBadge tone={tone} label="x" />);
      const breathing = container.querySelector(".listening-breath");
      expect(Boolean(breathing)).toBe(tone === "listening");
      unmount();
    }
  });
});
