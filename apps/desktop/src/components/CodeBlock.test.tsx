import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeBlock } from "./CodeBlock";

const CODE = "func main() {\n\tprintln(1)\n}\n";

afterEach(cleanup);

function renderBlock(language: string | null = "go") {
  return render(
    <CodeBlock language={language} code={CODE}>
      <code>{CODE}</code>
    </CodeBlock>,
  );
}

describe("CodeBlock", () => {
  it("подписывает язык и число строк", () => {
    renderBlock();
    expect(screen.getByText("go")).toBeTruthy();
    expect(screen.getByText("3 строки")).toBeTruthy();
  });

  it("без распознанного языка подпись не пустует", () => {
    renderBlock(null);
    expect(screen.getByText("код")).toBeTruthy();
  });

  it("копирует сырой текст блока, а не разметку", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderBlock();
    fireEvent.click(screen.getByTitle("Копировать блок"));
    expect(writeText).toHaveBeenCalledWith(CODE);
    await vi.waitFor(() => {
      expect(screen.getByTitle("Скопировано")).toBeTruthy();
    });
    vi.unstubAllGlobals();
  });

  it("переключает перенос длинных строк", () => {
    const { container } = renderBlock();
    const block = container.querySelector(".code-block");
    expect(block?.getAttribute("data-wrap")).toBe("false");
    fireEvent.click(screen.getByTitle("Переносить длинные строки"));
    expect(block?.getAttribute("data-wrap")).toBe("true");
    expect(screen.getByTitle("Не переносить строки")).toBeTruthy();
  });
});
