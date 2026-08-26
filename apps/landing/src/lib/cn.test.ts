import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("drops falsy parts", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn()).toBe("");
  });

  it("collapses conflicting utilities to the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("rounded-full", "rounded-md")).toBe("rounded-md");
    expect(cn("h-8", "h-7")).toBe("h-7");
    expect(cn("size-7", "size-6")).toBe("size-6");
  });

  it("keeps utilities that only look alike", () => {
    // Different breakpoints never conflict — Header relies on this for `hidden sm:inline`.
    expect(cn("hidden", "sm:inline")).toBe("hidden sm:inline");
    // Width and colour of a ring are separate groups; ContentScreens combines them.
    expect(cn("ring-1 ring-inset", "ring-app-primary/60")).toBe(
      "ring-1 ring-inset ring-app-primary/60",
    );
    expect(cn("border", "border-app-border")).toBe("border border-app-border");
  });

  /**
   * The reason `cn` had to be extended rather than plugged straight into twMerge:
   * `text-app-chat` is a font size declared in globals.css, but tailwind-merge only
   * knows its own scale and would file it under text-colour — and then drop it as
   * soon as a real text colour turned up in the same call.
   */
  it("treats the app text tokens as font sizes, not colours", () => {
    expect(cn("text-app-chat", "text-app-fg/80")).toBe("text-app-chat text-app-fg/80");
    expect(cn("text-app-body", "text-app-muted")).toBe("text-app-body text-app-muted");
    expect(cn("text-app-caption", "text-app-fg")).toBe("text-app-caption text-app-fg");
    expect(cn("text-app-title", "text-app-hint")).toBe("text-app-hint");
  });

  it("still merges the page's own arbitrary sizes", () => {
    expect(cn("text-[13.5px]", "text-[15px]")).toBe("text-[15px]");
    expect(cn("text-[12.5px] text-fg-subtle", "text-fg")).toBe("text-[12.5px] text-fg");
  });
});
