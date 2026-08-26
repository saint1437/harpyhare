/**
 * Every colour utility on this page must resolve to a token declared in
 * globals.css, and every custom class must actually exist there.
 *
 * This file used to be a 220-line near-duplicate of
 * `apps/desktop/scripts/check-tokens.mjs` and said so in its own header. The
 * mechanic now lives in `@harpyhare/checks`; what is left here is the DATA that
 * makes it this app's check — which stylesheet, which tree. The two palettes
 * stay different on purpose (see the monorepo CLAUDE.md), and nothing below
 * assumes the desktop's.
 *
 * Run: node scripts/check-tokens.mjs
 */
import { checkTokens, report } from "@harpyhare/checks";

process.exit(
  report(
    checkTokens({
      cssPath: new URL("../src/app/globals.css", import.meta.url).pathname,
      srcRoot: new URL("../src/", import.meta.url).pathname,
    }),
  ),
);
