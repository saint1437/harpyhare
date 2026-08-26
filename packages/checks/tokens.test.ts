import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkTokens } from "./index.js";
import { cleanupFixtures, fixture } from "./fixture.js";

afterAll(cleanupFixtures);

const CSS = `@import "tailwindcss";

:root {
  --brand: oklch(0.5 0.1 20);
  --ground: oklch(0.2 0.01 40);
}

@theme inline {
  --color-brand: var(--brand);
  --color-ground: var(--ground);
  --text-body: 13px;
  --font-display: "X", sans-serif;
  --shadow-pop: 0 1px 2px black;
}

.text-stroke {
  -webkit-text-stroke: 1px var(--brand);
}
`;

const SOURCE = `export const App = () => (
  <div className="bg-ground text-brand text-body text-display shadow-pop text-stroke">
    <span className="text-lg bg-cover border-2 border-t-transparent shadow-sm" />
    <span className="transition-[color,border-color] border-t-[1.5px] hover:text-brand/60" />
    {/* a comment may say text-nowhere without being a class */}
  </div>
);
`;

const run = (files: Record<string, string>, options = {}) => {
  const root = fixture({ "theme.css": CSS, "src/App.tsx": SOURCE, ...files });
  return checkTokens({ cssPath: join(root, "theme.css"), srcRoot: join(root, "src"), ...options });
};

describe("what a healthy palette looks like", () => {
  it("resolves colours, sizes, fonts, shadows and hand-written classes", () => {
    const result = run({});
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // A check that asserts nothing is green for the wrong reason. Every test
  // below is only meaningful because this number is not zero.
  it("actually measured something", () => {
    expect(run({}).checks).toBeGreaterThan(5);
  });
});

/**
 * The mutations. Each one is a way the palette can silently break in a real
 * app, and each has to come back red — otherwise this package is decoration.
 */
describe("a broken palette is caught", () => {
  it("catches a token renamed in the CSS", () => {
    const result = run({ "theme.css": CSS.replace("--color-brand:", "--color-brand-500:") });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("App.tsx:2  text-brand  →  no --color-brand");
  });

  it("catches a token that never existed", () => {
    const result = run({ "src/App.tsx": SOURCE.replace("bg-ground", "bg-nowhere") });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("no --color-nowhere");
  });

  it("catches a hand-written class deleted from the CSS", () => {
    const result = run({ "theme.css": CSS.replace(".text-stroke {", ".text-outline {") });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("text-stroke");
  });

  it("catches a size token removed from the theme", () => {
    const result = run({ "theme.css": CSS.replace("--text-body: 13px;", "") });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("text-body");
  });

  it("reports the file and the line, not just the class", () => {
    const [first] = run({ "src/App.tsx": `const a = 1;\nconst b = "bg-nowhere";\n` }).failures;
    expect(first).toMatch(/^App\.tsx:2 {2}bg-nowhere/);
  });

  it("looks inside every file of the tree, not only the first", () => {
    const result = run({ "src/deep/Nested.tsx": `export const x = "text-nowhere";\n` });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("deep/Nested.tsx");
  });
});

describe("what must not be flagged", () => {
  it("leaves Tailwind's own non-colour utilities alone", () => {
    expect(run({}).failures).toEqual([]);
  });

  it("takes project-specific utilities from extraClasses", () => {
    const files = { "src/App.tsx": SOURCE.replace("bg-ground", "bg-glass") };
    expect(run(files).ok).toBe(false);
    expect(run(files, { extraClasses: ["bg-glass"] }).ok).toBe(true);
  });

  it("skips the files it is told to skip", () => {
    const files = { "src/bindings.ts": `export const generated = "bg-nowhere";\n` };
    expect(run(files).ok).toBe(false);
    expect(run(files, { skipFiles: ["bindings.ts"] }).ok).toBe(true);
  });

  it("scans only what srcGlobs names", () => {
    const files = { "src/notes.md": "bg-nowhere\n" };
    expect(run(files).ok).toBe(true);
    expect(run(files, { srcGlobs: ["**/*.md"] }).ok).toBe(false);
  });
});

describe("the stylesheet has to be readable", () => {
  it("refuses a CSS file with no theme block rather than passing everything", () => {
    expect(() => run({ "theme.css": ":root { --brand: red; }\n" })).toThrow(/@theme inline/);
  });
});
