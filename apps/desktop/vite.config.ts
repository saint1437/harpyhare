import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const DEV_SERVER_PORT = 1420;
const HMR_PORT = DEV_SERVER_PORT + 1;

const host = process.env["TAURI_DEV_HOST"];

/**
 * Two windows share one build, and without this every dependency of either of
 * them landed in ONE chunk that both had to parse: 561 kB of it, including the
 * launcher paying for react-markdown and the HUD's Radix dialogs.
 *
 * The split is by owner, not by size: `vendor-react` is the only thing both
 * windows genuinely share; `vendor-markdown` and `vendor-highlight` belong to
 * the HUD's answer panel alone and are additionally behind a `lazy` boundary
 * (`features/hud/AnswerMarkdown`), so they are fetched when the first answer
 * needs them rather than at start.
 *
 * Matching is on the package folder inside node_modules — a substring test on
 * the whole path would put `react-markdown` into the react chunk. The flip side
 * of that precision: an umbrella package is a package of its own, so `radix-ui`
 * has to be named beside `"@radix-ui/*"` rather than being covered by it.
 */
const VENDOR_CHUNKS: Record<string, readonly string[]> = {
  "vendor-react": ["react", "react-dom", "scheduler", "react-is"],
  "vendor-highlight": ["highlight.js", "lowlight"],
  "vendor-markdown": [
    "react-markdown",
    "remark-gfm",
    "remark-parse",
    "remark-rehype",
    "unified",
    "vfile",
    "vfile-message",
    "bail",
    "trough",
    "devlop",
    "zwitch",
    "ccount",
    "escape-string-regexp",
    "markdown-table",
    "longest-streak",
    "html-url-attributes",
    "property-information",
    "space-separated-tokens",
    "comma-separated-tokens",
    "decode-named-character-reference",
    "estree-util-is-identifier-name",
  ],
  "vendor-radix": [
    "radix-ui",
    "@radix-ui/*",
    "@floating-ui/*",
    "aria-hidden",
    "react-remove-scroll",
    "react-remove-scroll-bar",
    "react-style-singleton",
    "use-sidecar",
    "use-callback-ref",
    "get-nonce",
    "detect-node-es",
    "tslib",
  ],
  "vendor-query": ["@tanstack/react-query", "@tanstack/query-core"],
  "vendor-icons": ["lucide-react"],
  "vendor-tauri": ["@tauri-apps/api", "@tauri-apps/plugin-global-shortcut"],
};

const PREFIX_VENDOR_CHUNKS: Record<string, readonly string[]> = {
  "vendor-markdown": ["micromark", "mdast-util-", "hast-util-", "unist-util-", "character-"],
};

function packageOf(id: string): string | null {
  const parts = id.split("node_modules/");
  const tail = parts[parts.length - 1];
  if (parts.length < 2 || tail === undefined) return null;
  const segments = tail.split("/");
  const scoped = segments[0]?.startsWith("@") === true;
  return segments.slice(0, scoped ? 2 : 1).join("/");
}

function manualChunks(id: string): string | undefined {
  const pkg = packageOf(id);
  if (pkg === null) return undefined;
  for (const [chunk, packages] of Object.entries(VENDOR_CHUNKS)) {
    // `"@radix-ui/*"` covers a whole scope; a bare name matches only itself, so
    // `react` cannot swallow `react-markdown`.
    if (
      packages.some((name) =>
        name.endsWith("/*") ? pkg.startsWith(name.slice(0, -1)) : name === pkg,
      )
    )
      return chunk;
  }
  for (const [chunk, prefixes] of Object.entries(PREFIX_VENDOR_CHUNKS)) {
    if (prefixes.some((prefix) => pkg.startsWith(prefix))) return chunk;
  }
  return undefined;
}

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    // The only runtimes are WKWebView and Evergreen WebView2, and tsconfig.json
    // already pins the source at ES2020 for the same reason; vite's default
    // matrix (edge88/firefox78/chrome87/safari14) downlevels for browsers that
    // never load this bundle.
    target: "es2022",
    // Every chunk is gzipped on every build purely to colour the size report,
    // and nothing — CI least of all — reads it.
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        launcher: path.resolve(__dirname, "launcher.html"),
      },
      output: { manualChunks },
    },
  },
  clearScreen: false,
  server: {
    port: DEV_SERVER_PORT,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: HMR_PORT } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
