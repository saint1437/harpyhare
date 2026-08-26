/**
 * The palette is measured, not eyeballed — on the landing page too.
 *
 * The desktop app has had this check since the redesign; the landing page had
 * only the token check, so its poster palette and its embedded app replica were
 * never held to AA by anything. The mechanic is `@harpyhare/checks`; the scopes
 * and the requirements below are this page's, read off globals.css.
 *
 * SCOPES. The page ground is one `:root`. The demo replica is four: the HUD and
 * the launcher (`.app-launcher` re-bases the surface steps) times the two
 * `[data-app-theme]` values a visitor can switch between. Selectors are listed
 * in file order, which for equal specificity IS the cascade — `[data-app-theme]`
 * and `.app-launcher` both score (0,1,0), and the pair selector that beats both
 * comes last.
 *
 * THE `--app-*` VALUES ARE NOT WRITTEN HERE ANY MORE. They are generated into
 * `globals.css` from `@harpyhare/tokens` by `scripts/sync-app-tokens.mjs`, which
 * `npm test` runs in `--check` mode before this file. That is what turned the
 * paragraph below from a list of excuses into a list of pairs.
 *
 * WHAT IS HELD TO WHAT.
 *   • `--fg`, `--fg-muted`, `--fg-subtle` are the page's text, on every ground
 *     it is ever painted on (`--bg`, `--bg-lift` and `--bg-deep` are the three
 *     stops of the fixed body gradient; `--ink` is the full-bleed block). 4.5:1.
 *     The muted pair only means anything because the check composites alpha:
 *     both are `--fg` at 78% and 60%.
 *   • `--border`, `--border-strong` are hairlines the poster layout leans on
 *     structurally — a 2px rule IS the section divider here — and `--primary`
 *     is the accent mark. 3:1, per WCAG 1.4.11.
 *   • `--ink` on `--primary` is the one reverse pair: the accent is used as a
 *     fill with near-black type on it.
 *   • In the demo, `DEMO_GROUNDS` is now the app's own four surface steps —
 *     they became opaque lightness steps with the palette, so they are grounds
 *     a ratio can be taken against at all; as `oklch(1 0 0 / n%)` tints they
 *     were not. `--app-fg`, `--app-muted-fg`, `--app-destructive` and
 *     `--app-recording` are text on all four (4.5:1); `--app-primary-mark` is
 *     the mark (3:1); each fill carries its own label (`--app-primary-fg` on
 *     `--app-primary`, `--app-destructive-fg` on `--app-destructive` — the
 *     app's dark danger is a LIGHT red and takes dark type, which is the pair
 *     the old replica got wrong).
 *
 * `--app-primary` AS A MARK: the shortfall that is now fixed. It used to paint
 * the status dots, the caret, the equaliser bars and the toggle at 1.56–2.48:1
 * against the demo's surfaces — colour as the only carrier of meaning, with no
 * label to fall back on — and this header used to argue that no lightness could
 * fix it. That is true of ONE token: an oxblood that clears 3:1 on a card cannot
 * also carry its own label at 4.5:1, because the two pull luminance apart. It is
 * not true of two, which is why the app has `--accent-mark` beside `--accent`
 * and why the replica now has `--app-primary-mark` beside `--app-primary`.
 * Every mark moved to it; `--app-primary` stays where it belongs, under a label
 * (the buttons, the selected preset chip), which is the WCAG 1.4.11 exemption
 * used correctly rather than as an excuse.
 *
 * DELIBERATELY NOT CHECKED, and why:
 *   • `--app-primary` and `--app-surface-active` as marks. The first is a fill
 *     identified by its label, per the paragraph above; the second is a hover
 *     tint and a slider track with no state to carry on its own.
 *   • `--app-border`, `--surface`. Hairlines and tints with no structural duty —
 *     the demo's frame is carried by the surface step, not by its border. The
 *     border is opaque now, but a 1px separator between two surfaces that
 *     already differ is not a graphical object under 1.4.11.
 *   • The focus ring and the selection ring at partial alpha
 *     (`focus-within:ring-app-primary-mark/50`, and the `black` theme's shaded
 *     surfaces they sit on). The token is checked at full strength; the alpha is
 *     a decision of the markup, and the check has no way to see a utility.
 *   • Contrast between two state colours: see the note in the package.
 *
 * Run: node scripts/check-contrast.mjs
 */
import { checkContrast, report } from "@harpyhare/checks";

const PAGE_GROUNDS = ["bg", "bg-lift", "bg-deep", "ink"];
/** The demo's four surface steps — the app's `base`/`surface`/`elevated`/`inset`. */
const DEMO_GROUNDS = ["app-bg", "app-card", "app-surface", "app-code"];

process.exit(
  report(
    checkContrast({
      cssPath: new URL("../src/app/globals.css", import.meta.url).pathname,
      scopes: {
        page: [":root"],
        "demo · light": [":root"],
        "demo · light · launcher": [":root", ".app-launcher"],
        "demo · black": [":root", ".app-launcher", '[data-app-theme="black"]'],
        "demo · black · launcher": [
          ":root",
          ".app-launcher",
          '[data-app-theme="black"]',
          '[data-app-theme="black"] .app-launcher',
        ],
      },
      pairs: [
        { fg: ["fg", "fg-muted", "fg-subtle"], bg: PAGE_GROUNDS, min: 4.5 },
        { fg: ["border", "border-strong", "primary"], bg: PAGE_GROUNDS, min: 3 },
        { fg: "ink", bg: "primary", min: 4.5 },
        {
          fg: ["app-fg", "app-muted-fg", "app-destructive", "app-recording"],
          bg: DEMO_GROUNDS,
          min: 4.5,
        },
        { fg: ["app-primary-mark", "app-destructive", "app-recording"], bg: DEMO_GROUNDS, min: 3 },
        { fg: "app-primary-fg", bg: "app-primary", min: 4.5 },
        { fg: "app-destructive-fg", bg: "app-destructive", min: 4.5 },
      ],
    }),
  ),
);
