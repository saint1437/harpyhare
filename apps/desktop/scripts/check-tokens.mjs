/**
 * Every colour utility in the source must resolve to a token declared in
 * index.css's `@theme inline`.
 *
 * Why this exists: a Tailwind class that names a token which does not exist is
 * not an error anywhere — Tailwind simply generates nothing and the element
 * renders unstyled. Neither `tsc` nor eslint can see it, and in a two-window
 * Tauri app you would only find it by opening the window it lives in. This
 * check is the reason a palette rename is safe to do mechanically.
 *
 * The mechanic is `@harpyhare/checks` — the landing page runs the same one over
 * its own, deliberately different, palette. What is left here is the data: which
 * stylesheet, which tree, and the one generated file to leave out.
 *
 * Run: node scripts/check-tokens.mjs
 */
import { checkTokens, report } from "@harpyhare/checks";

process.exit(
  report(
    checkTokens({
      cssPath: new URL("../src/index.css", import.meta.url).pathname,
      srcRoot: new URL("../src/", import.meta.url).pathname,
      // Generated from Rust — whatever it names is not the palette's business.
      skipFiles: ["bindings.ts"],
    }),
  ),
);
