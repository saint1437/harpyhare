# 03 — Visual language & theming audit (analyst C)

All paths relative to the git root `harpyhare/`. Every number below was measured, not estimated.
Theme source of truth: **`apps/desktop/src/index.css`, 374 lines** — there is no second theme file.

## Summary

- 23 colour-carrying custom properties, declared 45 times across 4 scopes; 23 `--color-*` aliases in `@theme inline`.
- The whole semantic palette lives on **three hues**: neutral 285 (C 0.005–0.008), red 18–30, and one blue outlier 245 (`--ring` in the launcher only). Nothing else has chroma.
- 12 raw `oklch()` colour literals sit outside any token (`index.css:217,232,237,245,250,258,263,272,275,301,366,370`); 10 more are baked inside the 4 shadow tokens; 2 `color-mix()` expressions.
- Components are clean: **0** hex/`rgb()`/`hsl()`/`oklch()` literals in `.ts`/`.tsx`; exactly **4 sites / 5 Tailwind palette classes** remain — the repo map's count is confirmed.
- `--recording` (`#e54058`) and `--destructive` (`#e23534`) are **1.09:1 apart** (OKLab ΔE 0.039). "Capturing audio" and "error" are the same red.
- The only "we are recording" signal in the app is `EqBars` animation state (`StatusBar.tsx:60-63`) — and `.eq-bar` is silenced by `prefers-reduced-motion`, collapsing recording and error into an identical static glyph.
- `--primary` `#a51c36` is 2.16:1 on the HUD background and 2.38:1 on a launcher card — below the 3:1 WCAG non-text floor everywhere it is used as a fill or an icon colour.
- Type scale is fully enforced: 98 uses across 5 steps, **0** raw `text-sm/xs/lg/[13px]` leaks. This is the healthiest part of the system.
- 3 shadcn primitives are dead (`badge` 43, `scroll-area` 53, `tooltip` 52 lines); `--secondary`, `--accent`, `--accent-foreground`, `--card-foreground` are effectively unreachable tokens.
- `prefers-color-scheme` appears **0 times** in the entire desktop app; the launcher window is hard-pinned `tauri::Theme::Dark` (`src-tauri/src/window.rs:67`).

---

## Colour inventory

### (a) Colour custom properties, by scope

`R` = `:root` (`index.css:6-38`) · `B` = `:root[data-theme="black"]` (`40-50`) · `L` = `body.launcher` (`112-124`) · `LB` = `:root[data-theme="black"] body.launcher` (`126-132`).
"util" = Tailwind utility call sites in `.tsx`/`.ts` (exact-token match, sub-tokens excluded); "var()" = direct `var(--x)` references.

| Token | R (`:root`) | B (black) | L (launcher) | LB (black·launcher) | Role | util | var() |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| `--background` | `0.25 0.005 285` | `0.16 0.005 285` | `0.17 0.005 285` | `0.12 0.005 285` | window ground; HUD only through `.app-shell` `color-mix` | 2 | 3 |
| `--foreground` | `0.95 0 0` | — | — | — | all body text; **identical in both windows** | 46 | 5 |
| `--card` | `0.29 0.005 285` | `0.2 0.005 285` | `0.21 0.005 285` | `0.16 0.005 285` | form cards, composer, transcript | 6 | 1 |
| `--card-foreground` | `0.95 0 0` | — | — | — | **0 consumers — dead** | 0 | 1 |
| `--popover` | `0.3 0.005 285` | `0.21 0.005 285` | `0.245 0.006 285` | `0.19 0.006 285` | menus, select, dialog (`DialogContent` uses it, not `--background`) | 5 | 1 |
| `--popover-foreground` | `0.95 0 0` | — | — | — | popover/select text | 2 | 1 |
| `--muted` | `0.33 0.005 285` | `0.23 0.005 285` | — | — | **1 consumer**: `AudioCheckCard.tsx:60` meter track | 1 | 1 |
| `--muted-foreground` | `0.71 0.008 285` | `0.68 0.008 285` | — | — | secondary text + the "checking/not set" dot | 89 | 4 |
| `--primary` | `0.47 0.17 18` | — | — | — | oxblood: button fill, dots, eq bars, list markers, active rail | 33 | 4 |
| `--primary-foreground` | `0.97 0.01 30` | — | — | — | label on primary fill; switch thumb when on | 4 | 1 |
| `--secondary` | `0.33 0.005 285` | `0.23 0.005 285` | — | — | only `button` + `badge` `secondary` variants — **never rendered** | 5 | 1 |
| `--secondary-foreground` | `0.95 0 0` | — | — | — | same — **never rendered** | 2 | 1 |
| `--accent` | `0.35 0.02 18` | `0.25 0.02 18` | — | — | **1 consumer**: `dialog.tsx:62` `data-[state=open]:bg-accent` (state never set) | 1 | 1 |
| `--accent-foreground` | `0.95 0 0` | — | — | — | **0 consumers — dead** | 0 | 1 |
| `--destructive` | `0.6 0.21 27` | — | — | — | blockers, errors, delete, context-gauge ≥80% | 33 | 1 |
| `--destructive-foreground` | `0.97 0.01 30` | — | — | — | label on destructive fill | 2 | 1 |
| `--border` | `1 0 0 / 10%` | `1 0 0 / 9%` | `1 0 0 / 8%` | — | hairlines; also the global `* { border-color }` | 23 | 5 |
| `--input` | `1 0 0 / 12%` | `1 0 0 / 11%` | `1 0 0 / 10%` | — | field border + `bg-input/20` fill + switch off track | 13 | 1 |
| `--ring` | `0.58 0.14 18` | — | **`0.74 0.1 245`** | — | focus. **Hue changes 18 → 245 between windows** | 26 | 1 |
| `--surface` | `1 0 0 / 6%` (alpha) | — | `0.25 0.006 285` (opaque) | `0.2 0.006 285` | hover/chip ground. **Alpha in the HUD, opaque in the launcher** | 25 | 1 |
| `--surface-active` | `1 0 0 / 11%` (alpha) | — | `0.3 0.007 285` (opaque) | `0.25 0.007 285` | pressed/selected ground | 19 | 1 |
| `--code-surface` | `0 0 0 / 30%` | — | — | — | `<pre>` ground + `HtmlBlockChip` | 1 | 2 |
| `--recording` | `0.62 0.2 18` | — | — | — | **the only capture colour**; 3 consumer lines, all HUD | 4 | 1 |

Non-colour properties in the same block: `--app-opacity: 0.9` (`:7`), `--chat-font-size: 13.5px` (`:8`), `--radius: 0.5rem` (`:10`), `--window-radius` (`:89` = 22px, `:115` = 0px in the launcher).

`@theme inline` (`index.css:52-98`) publishes 23 `--color-*` aliases (one per token above), the radius ladder `sm/md/lg/xl` (`:76-79`), `--font-sans`/`--font-mono` (`:80-83`), 5 text steps (`:84-88`), `--window-radius` (`:89`) and 4 shadows (`:90-97`). Note `--window-radius` is **not** in Tailwind's `--radius-*` namespace, so it generates no utility — which is why three files carry `rounded-[var(--window-radius)]` literals.

**Reachability verdict:** 4 of 23 tokens (`--card-foreground`, `--accent-foreground`, `--secondary`, `--secondary-foreground`) have no live render path; `--accent` and `--muted` have exactly one each. **6 of 23 (26%) of the palette is dead or near-dead weight.**

### (b) Raw colour literals inside `index.css`, not behind a custom property

67 `oklch()` occurrences in total; 55 are inside a `--token:` declaration. The remaining **12 are free literals**:

| Line | Value | Hex | What it paints |
| ---: | --- | --- | --- |
| 217 | `oklch(0.8 0.09 18)` | `#f2a6a9` | inline `<code>` text — a *pink* that no token defines |
| 232 | `oklch(0.85 0.01 285)` | `#cdcdd5` | `<pre> <code>` base text |
| 237 | `oklch(0.6 0.01 285)` | `#7f7f87` | `hljs-comment`, `hljs-quote` |
| 245 | `oklch(0.72 0.14 15)` | `#ef7d89` | `hljs-keyword/selector-tag/tag/name/meta` |
| 250 | `oklch(0.76 0.09 140)` | `#93c08a` | `hljs-string/regexp/addition` |
| 258 | `oklch(0.79 0.1 70)` | `#e4af73` | `hljs-number/literal/built_in/type/class` |
| 263 | `oklch(0.8 0.06 220)` | `#93c7d9` | `hljs-title/function_/section` |
| 272 | `oklch(0.8 0.05 320)` | `#cdb4d3` | `hljs-attr/variable/property/selector-*` |
| 275 | `oklch(0.68 0.16 20)` | `#ea696f` | `hljs-deletion` |
| 301 | `oklch(1 0 0 / 4%)` | white 4% | `.prose-answer th` ground |
| 366 | `oklch(1 0 0 / 14%)` | white 14% | scrollbar thumb |
| 370 | `oklch(1 0 0 / 28%)` | white 28% | scrollbar thumb :hover |

Plus **10 `oklch()` alphas baked inside the 4 shadow tokens** (`:90` ×2, `:91` ×2, `:93-94` ×3, `:96-97` ×3) — the shadow colours are hardcoded white/black, not derived from `--foreground`/`--background`, so a light theme cannot re-tint them.

Plus **2 `color-mix()` expressions**: `:162` (`.app-shell` = `--background` × `--app-opacity`) and `:216` (inline-code ground = `--primary` at 14%).

**The un-named alpha ladder.** Counting `oklch(1 0 0 / N%)` and `oklch(0 0 0 / N%)` across tokens, shadows and free literals, the file uses **10 distinct white alphas** (4, 5, 6, 8, 9, 10, 11, 12, 14, 28%) and **6 distinct black alphas** (20, 30, 32, 35, 50, 55%). None of the 16 is named. This is a second, undocumented elevation scale running in parallel with the 4 shadow tokens.

### (c) Hardcoded colours in components

Independently verified. `.ts`/`.tsx` under `apps/desktop/src`:

- hex / `rgb()` / `hsl()` / `oklch()` literals: **0**
- arbitrary colour values (`text-[#…]`, `bg-[rgb(…)]`, `[color-mix(…)]`): **0**
- Tailwind palette classes: **4 sites, 5 class tokens** — exactly the set the repo map lists, nothing extra, including nothing extra in `components/ui/*`:

| File:line | Class(es) | Why |
| --- | --- | --- |
| `apps/desktop/src/components/PreviewPanel.tsx:17` | `bg-white` | the HTML-preview iframe must be a white page ground |
| `apps/desktop/src/components/AttachmentChip.tsx:17` | `bg-black/75` `text-white` | remove badge over an arbitrary thumbnail |
| `apps/desktop/src/components/Teleprompter.tsx:120` | `bg-black/85` | teleprompter scrim over the transparent HUD |
| `apps/desktop/src/components/ui/dialog.tsx:31` | `bg-black/55` | dialog overlay scrim |

All four are *scrims and foreign content* — cases where a semantic token genuinely is not the right answer, but where a `--scrim-*` / `--surface-inverted` token would be. Note `dialog.tsx:31` is the sole use of `bg-black/55` and it is also where `rounded-[var(--window-radius)]` is needed, so the overlay is already half-tokenised.

Also uncounted by the palette-class grep but worth listing as inverted-surface hardcoding: `components/ui/tooltip.tsx:40,46` uses `bg-foreground text-background` / `fill-foreground` — a colour inversion expressed as token-swapping rather than as a token. That file is dead (below), so it costs nothing today.

### (d) Semantic tokens → sRGB hex (before-values for the redesign)

| Token | Scope | oklch | Hex |
| --- | --- | --- | --- |
| `--background` | `:root` (HUD gray) | `0.25 0.005 285` | `#212124` |
| `--background` | black | `0.16 0.005 285` | `#0d0d0f` |
| `--background` | launcher | `0.17 0.005 285` | `#0f0f12` |
| `--background` | launcher·black | `0.12 0.005 285` | `#060607` |
| `--foreground` | all | `0.95 0 0` | `#eeeeef` |
| `--card` | HUD gray / black / launcher / launcher·black | `0.29` / `0.2` / `0.21` / `0.16` | `#2b2b2e` / `#161618` / `#18181b` / `#0d0d0f` |
| `--popover` | HUD gray / black / launcher / launcher·black | `0.3` / `0.21` / `0.245` / `0.19` | `#2d2d30` / `#18181b` / `#202023` / `#131317` |
| `--muted` | gray / black | `0.33` / `0.23` | `#353538` / `#1d1d1f` |
| `--muted-foreground` | gray / black | `0.71 0.008 285` / `0.68 0.008 285` | `#a1a1a7` / `#97989e` |
| `--primary` | all | `0.47 0.17 18` | **`#a51c36`** |
| `--primary-foreground` | all | `0.97 0.01 30` | `#fcf3f2` |
| `--secondary` | gray / black | `0.33` / `0.23` | `#353538` / `#1d1d1f` |
| `--accent` | gray / black | `0.35 0.02 18` / `0.25 0.02 18` | `#443637` / `#2b1e1e` |
| `--destructive` | all | `0.6 0.21 27` | **`#e23534`** |
| `--destructive-foreground` | all | `0.97 0.01 30` | `#fcf3f2` |
| `--ring` | HUD | `0.58 0.14 18` | `#bf525b` |
| `--ring` | launcher | `0.74 0.1 245` | **`#73b1e6`** |
| `--recording` | all | `0.62 0.2 18` | **`#e54058`** |
| `--code-surface` | all | `0 0 0 / 30%` | black @30% (→ `#171719` over HUD ground) |
| `--surface` | HUD | `1 0 0 / 6%` | white @6% (→ `#2e2e31` over HUD ground) |
| `--surface-active` | HUD | `1 0 0 / 11%` | white @11% (→ `#39393c`) |
| `--surface` / `--surface-active` | launcher | `0.25 0.006` / `0.3 0.007` | `#212125` / `#2d2d31` |
| `--border` | gray / black / launcher | white @10 / 9 / 8% | → `#404043` / `#2b2b2d` / `#2a2a2d` on their cards |
| `--input` | gray / black / launcher | white @12 / 11 / 10% | → `#444447` / — / `#2f2f32` |

**Measured contrast (WCAG, at `--app-opacity: 1`):**

| Pair | Ratio |
| --- | ---: |
| `--foreground` on launcher `--background` | 16.50:1 |
| `--foreground` on HUD `--background` | 13.85:1 |
| `--muted-foreground` on launcher `--card` | 6.89:1 |
| `--muted-foreground` on HUD `--card` | 5.49:1 |
| `--primary-foreground` on `--primary` (button label) | 6.83:1 |
| **`--primary` fill on launcher `--card`** | **2.38:1** |
| **`--primary` as icon colour on HUD ground** (`ScreenShareIndicator.tsx:8`) | **2.16:1** |
| `--destructive` on launcher `--card` | 4.04:1 |
| `--destructive/75` fill on launcher `--card` | 2.76:1 |
| `--recording` on HUD ground (`AutoModeIndicator.tsx:9`) | 3.98:1 |
| HUD `--ring` `#bf525b` on HUD ground | 3.50:1 |
| launcher `--ring` `#73b1e6` on launcher ground | 8.35:1 |
| Switch ON (`--primary`) vs OFF (`--input` over card) | **1.79:1** |
| Launch button **disabled** fill vs header ground | **1.44:1** |
| Hairline `--border` vs the card it sits on (launcher) | **1.24:1** |
| **`--recording` vs `--destructive`** | **1.09:1** (OKLab ΔE 0.039) |

OKLab separations between the state colours: `primary↔destructive` 0.139 (the deliberate split documented in `CLAUDE.md:151` — it works), `primary↔recording` 0.153, **`destructive↔recording` 0.039** (it does not), `primary↔ring(HUD)` 0.114.

---

## Typography, spacing, radii, shadows, icons

### Type scale

Five steps, all in `@theme inline` (`index.css:84-88`) and all registered as a `font-size` group in `apps/desktop/src/lib/utils.ts:7` so `cn()` can dedupe them:

| Step | Value | Uses | Files | Where |
| --- | --- | ---: | ---: | --- |
| `--text-hint` | 10.5px | 12 | 9 | `SectionLabel`, brand line, counters, breadcrumbs, `select` group label |
| `--text-caption` | 11.5px | 48 | 28 | the workhorse: chips, status lines, hints, `Button size="xs"/"compact"` |
| `--text-body` | 12.5px | 34 | 22 | default control text: `Button`, `Input`, `Textarea`, `Label`, `SelectItem` |
| `--text-chat` | `var(--chat-font-size)` (10–20px, default 13.5) | **2** | 1 | `AnswerPanel.tsx:61` (assistant prose), `:309` (user bubble) |
| `--text-title` | 15px | **2** | 2 | `ScreenShell.tsx:17` (screen heading), `dialog.tsx:111` (dialog title) |

**Raw Tailwind text sizes remaining: 0.** No `text-sm`, `text-xs`, `text-lg`, `text-[13px]`. The invariant at `CLAUDE.md:425` holds exactly.

The scale's actual working range is 10.5 → 12.5px — a 2px span carrying 94 of 98 uses. `--text-title` at 15px is the only real step up and it is used twice. There is **no heading scale**: `ScreenShell`'s `<h2>` and a dialog's title are the same size, and `.prose-answer h1/h2/h3` (`index.css:193-201`) reintroduce a *relative* scale (1.25em/1.14em/1.05em of `--text-chat`) that lives outside the token system entirely.

**Font stacks** (`index.css:80-83`):
```
--font-sans: ui-sans-serif, -apple-system, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```
Set explicitly for a stated reason (`CLAUDE.md:151`): *"without an explicit stack, WebView2 serves classic Segoe UI with no optical sizing."* `font-mono` is applied 14 times — always paired with `tabular-nums` (11 uses) for versions, percentages, token counts and hotkey glyphs, plus the brand line.

**Weights** — 16 explicit declarations total; everything else inherits 400:
`font-medium` ×11 (7 of them inside `components/ui/*`), `font-semibold` ×4 (`LaunchBar.tsx:100`, `ScreenShell.tsx:17`, `SectionLabel.tsx:8`, `dialog.tsx:111`), `font-normal` ×1 (`fields.tsx:47`, cancelling `Label`'s `font-medium`).

**Line heights** — 6 declarations: `leading-relaxed` ×3 (`AnswerPanel.tsx:61`, `UpdatesScreen.tsx:93`, `UpdateDialog.tsx:110`), `leading-none` ×2 (`label.tsx:10`, `dialog.tsx:111`), `leading-[1.7]` ×1 — **`Teleprompter.tsx:129` is the only arbitrary line-height literal in the codebase.**
**Tracking** — 5: `tracking-wider` ×2 (both uppercase steps), `tracking-tight` ×2 (both title steps), `tracking-wide` ×1 (`Teleprompter.tsx:129`).

**Uppercase**: exactly 2 sites, as the invariant demands — `SectionLabel.tsx:8` and the brand line `LaunchBar.tsx:100`.

### Spacing

276 spacing utilities counted (`p/px/py/pt/pr/pb/pl/m/mx/my/mt/mr/mb/ml/gap/gap-x/gap-y/space-x/space-y`). Distribution by step:

| Step | Count | | Step | Count |
| --- | ---: | --- | --- | ---: |
| `2` (8px) | **61** | | `4` (16px) | 13 |
| `1.5` (6px) | **55** | | `7`, `5`, `0` | 3 each |
| `1` (4px) | **43** | | `px`, `3.5` | 2 each |
| `3` (12px) | **35** | | `8`, `6`, `16`, `13.5` | **1 each** |
| `2.5` (10px) | **31** | | | |
| `0.5` (2px) | 21 | | | |

Six steps (0.5, 1, 1.5, 2, 2.5, 3) carry **246 of 276 = 89%**. Top three utilities: `gap-2` (32), `gap-1.5` (31), `px-3` (19).
Once-only steps and their one caller: `p-5` (`dialog.tsx:53`), `px-6` (`ConnectivityOverlay`), `pl-16` (`LaunchBar.tsx:12` — the macOS traffic-light inset), `pr-13.5` (`AnswerPanel`, the computed assistant gutter documented at `CLAUDE.md:165`). Three of the four are load-bearing arithmetic, not drift.

The de-facto rhythm is a **2px grid running 2→12px** with a hard ceiling: nothing between 16px and the two computed insets. There is no "section" or "page" spacing step at all — screens are spaced by the same `gap-2`/`gap-3` as buttons inside a row.

### Radii

`--radius: 0.5rem` (`index.css:10`) → ladder at `:76-79`: `sm` 4 / `md` 6 / `lg` 8 / `xl` 12 (`--radius-xl` set explicitly, per `CLAUDE.md:151`, or `rounded-xl` would unhook to Tailwind's fixed 12px).

| Utility | Uses | Meaning in practice |
| --- | ---: | --- |
| `rounded-full` | **29** | dots, pills, meters, switch, slider, eq bars, avatars-of-nothing |
| `rounded-lg` (8) | 17 | cards, popover, select content |
| `rounded-md` (6) | 16 | controls: buttons, inputs, sidebar items |
| `rounded-sm` (4) | 9 | badges, select items, dialog close |
| `rounded-xl` (12) | 3 | composer card, dialog content, preview iframe |
| arbitrary | 5 | `rounded-[var(--window-radius)]` ×3 (`App.tsx:778`, `ConnectivityOverlay.tsx:8`, `dialog.tsx:31`), `rounded-[inherit]` ×1 (`scroll-area.tsx:18`), **`rounded-[2px]` ×1 (`tooltip.tsx:46`)** |

`rounded-full` outnumbers every ladder step. `rounded-[2px]` is a literal that escaped the "not a single `rounded-[Npx]` left" claim at `CLAUDE.md:151` — it is in a dead file, but it is still there.

### Shadows

Four tokens (`index.css:90-97`), 13 token call sites, plus 2 that bypass them:

| Token | Uses | Sites |
| --- | ---: | --- |
| `--shadow-raise` | 6 | `fields.tsx:26`, `ContextLibraryPanel.tsx:330,557`, `StartScreen.tsx:193`, `AutoTranscript.tsx:56`, `Composer.tsx:561` |
| `--shadow-pop` | 4 | `LauncherSearch.tsx:118`, `AnswerPanel.tsx:63`, `popover.tsx:26`, `select.tsx:58` |
| `--shadow-btn` | 2 | `button.tsx:12,14` (only the `default` and `destructive` fills) |
| `--shadow-modal` | 1 | `dialog.tsx:53` |
| **`shadow-sm` (stock Tailwind)** | **2** | **`slider.tsx:50`, `switch.tsx:25`** — both thumbs |

`shadow-sm` is a direct violation of the rule at `CLAUDE.md:151` ("Shadows are `@theme` tokens as well… shadcn's stock `shadow-xs` has been stripped from every field and is not coming back"). It survived on the two Radix thumbs.

**Two competing hairline systems.** 36 plain `border` uses (coloured implicitly by the global `* { border-color: var(--border) }` at `index.css:169-172`) against 20 `ring-1 ring-inset` uses. Cards use rings (`fields.tsx:26`, `StartScreen.tsx:193`, `Composer.tsx:561`); popovers/dialogs/selects/inputs use borders. Same visual result, two mechanisms, chosen per-file.

**Focus.** 18 `focus-visible:ring-2` — the invariant mostly holds. **Two exceptions in one line: `components/ui/slider.tsx:50` uses `hover:ring-4` and `focus-visible:ring-4`.** Ring *alphas* are not unified either: `ring-ring/60` ×15, `ring-ring/40` ×5, `ring-destructive/30` ×6, `ring-destructive/40` ×2, `ring-primary/40` ×2, `ring-border/50` ×1, `ring-foreground/10` ×1.
The 6 `ring-destructive/30` + `aria-invalid:border-destructive` rules in 5 primitives are dead — **`aria-invalid` is never set anywhere in the app.**

### Icons

lucide-react ^1.17.0, **58 distinct glyphs, 91 import entries, 29 import sites**. Global stroke `svg.lucide { stroke-width: 1.75 }` (`index.css:174-176`) — no per-icon `strokeWidth` prop exists anywhere. Sizes come from the button recipe (`[&_svg:not([class*='size-'])]:size-4`, `size-3` at `xs`) plus 12 explicit `size-3`/`size-3.5`/`size-4.5` overrides.

Inconsistencies, with citations:

| Problem | Evidence |
| --- | --- |
| **Two glyphs, one meaning ("retry")** | `RotateCcw` = "Повторить распознавание" (`Composer.tsx:378`) vs `RotateCw` = resend a message (`AnswerPanel.tsx:169`). Mirror images at 14px, in the same window, ~90px apart. |
| **One glyph, two meanings ("reset" vs "retry")** | `RotateCcw` also = reset hotkey to default (`HotkeysSection.tsx:41`) and reset teleprompter scroll (`Teleprompter.tsx:143`). |
| **One glyph, two "stop" scopes** | `Square` = stop the answer stream, destructive-filled (`Composer.tsx:389`) and = stop the HUD / return to launcher, ghost (`StatusBar.tsx:103`). |
| **One glyph, two "play" scopes** | `Play` = launch the app (`LaunchButton.tsx:28`) and = resume teleprompter scroll (`Teleprompter.tsx:151`). |
| **One glyph, three meanings** | `Mic` = microphone permission (`permission-rows.ts:1`), = mic source in the audio check (`AudioCheckCard.tsx:1`), = the "Речь" settings tab (`settings-tabs.ts:12`). |
| **One glyph, two meanings** | `SlidersHorizontal` = the "Настройки" screen (`screens.ts:34`) and = "Параметры запроса" popover (`Composer.tsx:261`). |
| **Near-identical glyphs, unrelated meanings** | `MessageSquareText` = the "Пресеты" screen (`screens.ts:27`) vs `MessagesSquare` = the empty-chat state (`AnswerPanel.tsx:283`). |
| **`Minus` carries three meanings** | hide the window (`StatusBar.tsx:88`), decrease teleprompter font (`Teleprompter.tsx:197`), the literal `-` key glyph (`HotkeysPopover.tsx:11`). |
| **Import-name drift** | `components/ui/*` uses shadcn's `*Icon` aliases (`XIcon`, `CheckIcon`, `ChevronDownIcon`, `ChevronUpIcon`) while every app component uses the bare name (`X` ×4, `Check` ×3). Two names for one glyph in one bundle. |

**No tooltip system.** `components/ui/tooltip.tsx` is never imported. Hover explanation is the **native `title=` attribute — 63 occurrences across 31 files**, including every `IconButton` (whose `title` prop is *required*, `IconButton.tsx:5`) and every icon-only sidebar item. In an `alwaysOnTop`, frameless, content-protected HUD, that means the app's entire explanatory layer is an unstyled OS popup with a ~1s delay that the app cannot theme, position or capture-protect.

**Dead primitives.** `badge.tsx` (43 lines, 5 variants, 0 renders), `scroll-area.tsx` (53 lines, 0 imports), `tooltip.tsx` (52 lines, 0 imports) = **148 of 742 lines (20%) of `components/ui/` is unrendered**, and knip cannot see it (`knip.json` excludes `src/components/ui/**`).
**Unused variants.** `Button` declares 5 variants and 10 sizes; renders use `ghost` ×29, `outline` ×3, `destructive` ×1, `default` implicitly. `secondary` is never used. Sizes used: `sm` ×23, `icon-compact` ×8, `compact` ×7, `xs` ×1 — `icon`, `icon-xs`, `icon-sm`, `icon-lg` are never used, and **`icon` and `icon-sm` are byte-identical (`size-8`)** (`button.tsx:27,30`).

---

## Dark / light

**There is no light theme and no path to one.**

- Two themes exist, both dark: `"gray"` (default) and `"black"`. `Settings.theme: String` (`src-tauri/src/settings.rs:178`), default `THEME_GRAY` (`:79`), clamped to the two literals or reset (`:254-255`).
- `applyTheme(root, theme)` (`apps/desktop/src/lib/window-controls.ts:42-44`) does one thing: `root.setAttribute("data-theme", theme === "black" ? "black" : "gray")`. Anything not `"black"` becomes `"gray"` — the mirror of the Rust clamp. It is called from `AppearanceSection.tsx:24` on change and through `useSettingsStore`'s apply callback on load.
- `@custom-variant dark (&)` (`index.css:4`) makes every shadcn `dark:` unconditional. Zero `dark:` classes remain in markup, so this variant is currently a *trap*, not a feature: any `dark:` pasted from a shadcn snippet silently overrides the class beside it.
- **`prefers-color-scheme` occurs 0 times** in `apps/desktop` (`.css`, `.ts`, `.tsx`, `.rs`, `.html`, `.json` all searched).
- `body { color-scheme: dark }` (`index.css:109`) tells the engine to render form controls, scrollbars and the caret in dark UA styling. It is the only thing making native widgets (select popups on Windows, the text caret, `::selection` fallback) match. It is unconditional — under a light theme it would have to become dynamic.
- The launcher window is built with `.theme(Some(tauri::Theme::Dark))` (`apps/desktop/src-tauri/src/window.rs:67`) — that pins the *native* frame, title bar and scrollbars dark regardless of OS setting. The `main` window (`window.rs:75-100`) sets no theme, because it has no decorations to theme.

**What breaks if a light theme is introduced** — concretely:

1. **The alpha ladder inverts wrong.** `--surface` (white 6%), `--surface-active` (white 11%), `--border` (white 8–10%), `--input` (white 10–12%), `.prose-answer th` (white 4%), the two scrollbar alphas and the 4 shadow tokens' `inset 0 1px 0 oklch(1 0 0 / …)` all assume *lighter = raised on a dark ground*. On a light ground every one of them becomes invisible; all 16 alpha values must be replaced, and 10 of them are not tokens at all.
2. **`.app-shell`'s `color-mix` breaks the HUD.** `index.css:161-167` computes `color-mix(in oklch, var(--background) calc(var(--app-opacity) * 100%), transparent)`. That is the *only* thing painting the transparent HUD. A light `--background` mixed to 20% alpha over an arbitrary desktop gives no legible ground at all, whereas dark-at-20% at least darkens whatever is behind it.
3. **`bg-background` must stay banned globally.** `CLAUDE.md:345`: *"Do not override `.bg-background` globally: its only remaining consumer is `ConnectivityOverlay`, and that one must be opaque, otherwise the chat shows through the 'no network' overlay."* Verified: `bg-background` appears exactly once, `ConnectivityOverlay.tsx:8`. Everything else that needs a ground goes through `--card`/`--popover`/`--surface` or the `.app-shell` mix. A light theme cannot relax this — a transparent window still has no ground to inherit.
4. **`color-scheme: dark` becomes a lie**, and with it the caret colour, the native scrollbar fallback and Windows' native select popup.
5. **`tauri::Theme::Dark` on the launcher** would fight the content: light content in a dark native frame with dark traffic-light rendering.
6. **The shadow tokens are un-retintable** — their colours are literals inside the token values, not references.
7. **Contrast collapses for `--primary`.** `#a51c36` is already 2.38:1 on a *dark* card. On a light card it would rise to ~5:1 as a fill but `--primary-foreground` `#fcf3f2` on it stays at 6.83:1 — the pair happens to survive. `--muted-foreground` `#a1a1a7` on a light ground would land at ~2.6:1 and fail outright.

**The transparency problem is bigger than the theme problem.** `window_opacity` is user-controlled, clamped `min 0.2, default 0.9, max 1.0` (`src-tauri/src/settings.rs:89`, mirrored in `window-controls.ts:3-4`). Measured against a white backdrop:

| `--app-opacity` | effective shell | `--foreground` contrast | `--muted-foreground` contrast |
| ---: | --- | ---: | ---: |
| 1.0 | `#212124` | 13.85:1 | 6.25:1 |
| 0.9 (default) | `#37373a` | 10.23:1 | 4.62:1 |
| 0.5 | `#909092` | 2.75:1 | 1.24:1 |
| 0.2 (min) | `#d3d3d3` | 1.29:1 | 1.72:1 |

**At the permitted minimum the HUD has no legible text at all**, and `--muted-foreground` crosses below 3:1 somewhere around opacity 0.75. Every contrast number in this report is a *best case*.

---

## Motion

**Three `@keyframes` blocks**, all in `index.css`:

| Keyframe | Line | Driver class | Duration | Where |
| --- | ---: | --- | --- | --- |
| `launcher-rise` | 134-143 | `.launcher-rise` (`:145-147`) | 0.38s `cubic-bezier(0.22, 1, 0.36, 1)` `both` | `LauncherPanel.tsx:137,167,176`, staggered by `RISE_STEP_MS` = 50ms |
| `eq` | 325-333 | `.eq-bar` (`:320-323`) | 1.1s ease-in-out **infinite** | `EqBars.tsx:17`, 5 bars staggered 0.12s |
| `thinking-shimmer` | 349-356 | `.thinking-shimmer` (`:335-347`) | 2s linear **infinite** | `ThinkingIndicator.tsx:36` |

**tw-animate-css 1.4.0** utilities: `animate-in` ×9, `animate-out` ×5, `fade-in-0` ×8, `fade-out-0` ×5, `zoom-in-95` ×4, `zoom-out-95` ×4, `slide-in-from-bottom-1` ×5, `-top-1` ×4, `-right-1` ×3, `-left-1` ×3, `fade-in` ×1. Durations: `duration-150` ×7 (menus, popovers, screen/tab switch), `duration-200` ×3 (dialog + its overlay — paired deliberately, `CLAUDE.md:353`), `duration-300` ×1 (`StatusBar.tsx:44`, the context gauge width).

**Tailwind built-ins:** `animate-pulse` ×4 (`UpdatesScreen.tsx:48`, `UpdateDialog.tsx:130`, `ChatTabs.tsx:93`, `StatusBar.tsx:121`) — all infinite; `animate-spin` ×1 (`ConnectivityOverlay.tsx:10`) — infinite.

**Transitions** — 28 total, and **the property is always named**: `transition-colors` ×18, `transition-[color,box-shadow,border-color]` ×4, `transition-[width]` ×3, `transition-[box-shadow]` ×2, `transition-transform` ×1.

**`transition-opacity`: 0 occurrences in `.ts`, `.tsx` and `.css`.** The rule at `CLAUDE.md:163-164` — *"in a transparent frameless window an opacity animation promotes the element into a separate WKWebView compositing layer, and when that layer collapses, unflushed pixels remain"* — is verified as still holding. Hover-reveal is done instead with bare `opacity-0` → `group-hover:opacity-100` (5 / 3 / 3 sites) plus `pointer-events-none` lifted by the same variant.

**`prefers-reduced-motion` coverage is partial.** The block at `index.css:149-155` names exactly three selectors: `.launcher-rise`, `.eq-bar`, `.thinking-shimmer`. Not covered:

- **5 Radix primitives with enter/exit animations and no `motion-reduce:` guard**: `popover.tsx:26`, `dialog.tsx:31`, `dialog.tsx:53`, `tooltip.tsx:40`, `select.tsx:58`. Verified that **`tw-animate-css` 1.4.0 ships zero `prefers-reduced-motion` rules** (`grep -c` on `node_modules/tw-animate-css/dist/tw-animate.css` → 0), so nothing silences them.
- **4 `animate-pulse` + 1 `animate-spin`** — all infinite, all uncovered.
- Only 4 sites carry `motion-reduce:animate-none` (`LauncherPanel`, `LauncherSearch`, `SettingsScreen`, `ThinkingIndicator`).

So: **3 of 13 animation sources are honoured under reduced motion.** And the one that *is* honoured — `.eq-bar` — is the app's only recording indicator (see below).

---

## Critique

**What it communicates.** Oxblood `#a51c36` on near-black neutrals of hue 285 is the palette of a terminal emulator, a poker client, or a pentesting tool. It reads as *covert, technical, slightly transgressive* — and given that the product deliberately ships as "Audio System" with `contentProtected` on by default, one can argue that is honest. But it is the wrong register for the thing the user actually needs to feel: that an always-on process holding a rolling system-audio buffer is **safe, legible and under control**. Deep red at 2.16–2.38:1 against black does not read as calm; it reads as *dim*. Every affirmative state in the app — "ready to launch" (`LaunchBar.tsx:42`), "permission granted" (`PermissionsScreen.tsx:21`), "step done" (`StartScreen.tsx:40`), "update available" (`StatusBar.tsx:121`) — is painted in a colour whose everyday semantic is *danger*, and painted so darkly that it barely separates from the ground. The palette has one hue family and asks it to mean brand, success, recording, error and focus simultaneously.

**Where it is generic.** The launcher is default shadcn `new-york`/neutral with `--primary` swapped. Concretely: `fields.tsx:26` is the stock settings-card recipe (`divide-y` + `rounded-lg` + `bg-card` + a hairline); `SettingsTabsRail`/`Sidebar` are the stock icon-rail; `LauncherSearch.tsx:118` is the stock command-palette dropdown; `button.tsx` is unmodified shadcn CVA down to the dead `aria-invalid:ring-destructive/30` on every variant. Nothing in the launcher — not a shape, not a rhythm, not a mark — would identify the product if you removed the two words of brand text. And that brand text is itself set to disappear: `LaunchBar.tsx:100` renders `harpyhare.ai` at `text-hint` (10.5px), `font-mono`, `uppercase`, `text-foreground/55`. The product's name is the single lowest-contrast, smallest piece of type in its own front door.

The HUD fares better, and for a structural reason rather than a stylistic one: it is a 22px-rounded translucent slab with no chrome, and that silhouette is distinctive. The distinctiveness comes from `--window-radius`, `--app-opacity` and the native corner clip, not from colour.

**Where it is confusing.** Take the three questions in order.

*Can a user distinguish the state vocabulary at 6px?* Partly. The `destructive`↔`primary` split documented at `CLAUDE.md:151` genuinely works: OKLab ΔE 0.139 with ΔL 0.13, and at `size-1.5` the blocker dot is visibly brighter than the ready dot. But the vocabulary has a third term, `muted-foreground/40` for "checking/not set", and it is used inconsistently: `LaunchBar.tsx:41` uses `bg-muted-foreground/40` for busy, `StatusBar.tsx:63` uses `bg-muted-foreground/50` for idle, `StatusBar.tsx:45` uses `bg-muted-foreground/60` for the context gauge. Three alphas of the same grey meaning three different neutral states, none of them named.

*Is "listening" visually distinct from "brand accent" anywhere?* **No — and it is worse than that: the same glyph carries both meanings.** `EqBars` is rendered in the launcher header at `LaunchBar.tsx:99` with `barClass="bg-primary"` as the **brand mark**, and in the HUD at `StatusBar.tsx:90` with `barClass="bg-recording"` as the **capture indicator**. Five bars, same component, same shape; the only difference between "this is our logo" and "your microphone is open" is which red it is filled with — and those two reds are `#a51c36` and `#e54058`.

*Does anything in the palette mean "the app is capturing audio right now"?* `--recording` exists and is supposed to. It fails on three counts:

1. **It is not distinguishable from error.** `--recording` `#e54058` vs `--destructive` `#e23534` is 1.09:1, OKLab ΔE 0.039. In `StatusBar.indicatorProps` (`StatusBar.tsx:60-63`) those two states are rendered by the *same five bars in effectively the same colour*; the only carrier of the difference is the boolean `animated`.
2. **That single carrier is switched off by an OS setting.** `.eq-bar` is in the `prefers-reduced-motion` block (`index.css:151`). A user with reduced motion enabled sees identical static red bars for "recording", "auto-listening" and "error". This is a colour-alone signal that isn't even reliably colour.
3. **It does not exist in the launcher at all.** `--recording` has exactly three consumer lines, all in the HUD (`StatusBar.tsx:60,62`, `AutoModeIndicator.tsx:9`). The launcher opens a live audio tap during "Проверка звука" and paints the live level meter `bg-primary` (`AudioCheckCard.tsx:62`) — brand red, not capture red — over a `bg-muted` track.

One more confusion worth naming: **focus changes hue between the two windows of one app.** `--ring` is `#bf525b` (hue 18) in the HUD and `#73b1e6` (hue 245) in the launcher (`index.css:32` vs `:123`). The reason is documented and legitimate (`CLAUDE.md:424`: *"a burgundy ring at 50% alpha was practically invisible in the settings window"*), but the fix introduced the **only blue in the entire product** and attached it to keyboard focus — the one affordance that most needs to be learnable across surfaces. It is also the highest-contrast chromatic element anywhere: 8.35:1, against `--primary`'s 2.38:1. The accessibility patch is currently more visually prominent than the brand colour.

And the switch: ON is `--primary`, OFF is `--input` over the card — **1.79:1 apart** (`switch.tsx:17,25`). In a settings screen made almost entirely of toggles, on and off are separated by a dark-red-vs-dark-grey difference plus 14px of thumb travel.

**What is genuinely worth keeping.** Four things, and they are not small.

1. **The token discipline.** Zero colour literals in 27 components and 12 primitives; 4 remaining Tailwind palette classes, all of them scrims over foreign content, all of them defensible. That is an unusually clean baseline and it means a palette swap is a single-file edit. Protect it.
2. **The type scale.** Five steps, `cn`-aware via `lib/utils.ts:7`, **zero raw Tailwind sizes**, one uppercase step, two title uses. The reason given at `CLAUDE.md:425` — that shared primitives cannot hold two scales, so the HUD inherited the launcher's — is the correct architectural call. The *values* need work (a 2px working range, no heading step); the *mechanism* should survive untouched.
3. **Surface-by-lightness in the launcher, alpha in the HUD.** `body.launcher` overriding `--surface`/`--surface-active`/`--card`/`--popover` to opaque steps, with `--popover` (0.245) deliberately *above* `--card` (0.21), is the single most sophisticated decision in the stylesheet. It is why a dropdown does not dissolve into the card it hangs over. `CLAUDE.md:424` explains it; keep the principle even if every value changes.
4. **The launcher/HUD separation as one document with two scopes.** One stylesheet, one set of primitives, one type scale, and exactly one seam (`body.launcher`). It has stayed clean — nothing in `:root` is edited for the launcher's sake. That constraint is what makes this redesign tractable at all.

Also worth keeping: the named-property transitions (28 of them, never a bare `transition-all`), the global icon stroke, the `--window-radius` ↔ Rust `WINDOW_CORNER_RADIUS_LOGICAL_PX` coupling, and the empty `transition-opacity` grep.

---

## Problems

### P0 — blocks the target outcome

**P0-1. "Recording" is colour-alone, and the colour is wrong.**
`--recording` `#e54058` vs `--destructive` `#e23534` = 1.09:1 / ΔE 0.039 (`index.css:27,37`). The states are rendered by the same 5-bar glyph in `StatusBar.tsx:60-63`, separated only by the `animated` flag, and `.eq-bar` is disabled under `prefers-reduced-motion` (`index.css:151`). Under that OS setting, *capturing audio* and *something failed* are pixel-identical. Nothing else in the UI — no shape, no border, no window-frame treatment, no text — carries "capturing".

**P0-2. The capture state does not exist outside the HUD.**
`--recording` has 3 consumer lines, all in `main`. The launcher opens a real system-audio tap for 5 s during "Проверка звука" and shows the live level in `bg-primary` (`AudioCheckCard.tsx:62`). A user watching the launcher has no way to learn what "we are listening" looks like before it matters.

**P0-3. The brand mark and the capture indicator are the same component.**
`EqBars` = brand at `LaunchBar.tsx:99` (`bg-primary`), = capture at `StatusBar.tsx:90` (`bg-recording`). Whatever the new palette is, this glyph cannot mean both.

**P0-4. `--primary` is below every contrast floor in the roles it actually occupies.**
2.16:1 as an icon colour on the HUD ground (`ScreenShareIndicator.tsx:8`, the app's pivotal privacy indicator, and the state it marks is "you ARE visible on the screen share"); 2.38:1 as a fill on a launcher card; 1.79:1 as a switch ON state; 1.44:1 when the Launch button is `disabled:opacity-50`. WCAG's non-text minimum is 3:1. A palette cannot be "intentional and calm" while its primary is simply too dark to see.

**P0-5. No contrast guarantee exists in the HUD at all.**
`window_opacity` min is 0.2 (`src-tauri/src/settings.rs:89`). At that setting over a light backdrop, `--foreground` measures 1.29:1. The redesign must decide whether that is a supported configuration or whether the floor moves.

### P1

**P1-1. Reduced motion covers 3 of 13 animation sources.** 5 Radix primitives, 4 `animate-pulse` and 1 `animate-spin` are unguarded; `tw-animate-css` 1.4.0 ships no `prefers-reduced-motion` rules. The invariant at `CLAUDE.md:367` is written as if the `index.css` block were sufficient; it is not.

**P1-2. `--ring` changes hue between the two windows** (`#bf525b` HUD / `#73b1e6` launcher). One app, two focus colours, and the launcher's is the only blue in the product.

**P1-3. Sixteen un-named alpha values form a shadow palette.** 10 white steps (4/5/6/8/9/10/11/12/14/28%) and 6 black steps (20/30/32/35/50/55%) scattered across tokens, the 4 shadow definitions and 12 free literals. Hairlines land at 1.19–1.33:1 against their own surface — barely visible at 100% opacity, gone below ~0.7.

**P1-4. 12 raw colour literals in `index.css`** (`:217,232,237,245,250,258,263,272,275,301,366,370`), of which 9 are the syntax palette — a fully independent 7-hue scheme (green 140, amber 70, cyan 220, violet 320, two reds) that shares nothing with the semantic tokens and will visibly clash with any new palette.

**P1-5. 26% of the colour palette is dead.** `--card-foreground` and `--accent-foreground` have 0 consumers; `--secondary`/`--secondary-foreground` only reach unused variants; `--accent` reaches one never-triggered `data-[state=open]`; `--muted` has 1 consumer.

### P2

**P2-1. `shadow-sm` bypasses the four shadow tokens** at `slider.tsx:50` and `switch.tsx:25`.
**P2-2. `focus-visible:ring-4` / `hover:ring-4`** at `slider.tsx:50` breaks the one-focus-treatment rule.
**P2-3. `rounded-[2px]`** at `tooltip.tsx:46` is a literal radius outside the ladder.
**P2-4. Nine icon collisions** (retry×2 glyphs, `RotateCcw`×2 meanings, `Square`×2, `Play`×2, `Mic`×3, `SlidersHorizontal`×2, `MessageSquareText`/`MessagesSquare`, `Minus`×3, `*Icon` vs bare naming).
**P2-5. 148 dead lines in `components/ui/`** (`badge`, `scroll-area`, `tooltip`), invisible to knip; plus 6 unused `Button` sizes, two of which (`icon`, `icon-sm`) are identical.
**P2-6. Two hairline mechanisms** — 36 `border` vs 20 `ring-1 ring-inset` — chosen per file with no rule.
**P2-7. The explanatory layer is 63 native `title=` attributes.** Unstyleable, undelayed-configurable, and rendered by the OS outside the content-protected window.

### P3

**P3-1. The brand line is the least visible type in the app** (10.5px / mono / uppercase / 55% alpha, `LaunchBar.tsx:100`).
**P3-2. No heading scale.** `--text-title` is used twice; `.prose-answer h1/h2/h3` re-invent a relative scale (`index.css:193-201`) outside the tokens.
**P3-3. `--surface` has two incompatible representations** — alpha in `:root`, opaque in `body.launcher` — so `bg-surface/50` (`PresetsSection.tsx`) means different things per window.
**P3-4. Three neutral-dot alphas** (`/40`, `/50`, `/60`) for the same "neutral state" term of the dot vocabulary.
**P3-5. `--window-radius` generates no utility** because it is not in the `--radius-*` namespace, forcing 3 `rounded-[var(--window-radius)]` literals.
**P3-6. `AppearanceSection` describes itself as "Оформление основного окна с чатом"** (`AppearanceSection.tsx:17`) while `applyTheme` visibly repaints the launcher too.
**P3-7. 5 dead `aria-invalid:` rule sets** — `aria-invalid` is never set anywhere.

---

## Opportunities

1. **A capture identity, not a capture colour.** The redesign can make "listening" a *composite*: a dedicated hue that is nowhere else in the system, plus a shape change (the window hairline, not a 12px glyph), plus a word. `--window-radius` and the `.app-shell` `color-mix` already give a frame-level surface to work with, and the native corner clip means a frame treatment will not tear during resize.
2. **The token swap is genuinely one file.** With 0 colour literals in components and 4 scrim classes to convert, a whole new palette is `index.css:6-132` plus four `bg-black/*`→`bg-scrim-*` edits. Very few redesigns start from this position.
3. **Name the alpha ladder.** Replacing 16 ad-hoc alphas with 3–4 named elevation tokens (`--hairline`, `--surface-1/2`, `--scrim`) removes the largest untracked surface in the stylesheet and makes a light theme mechanically possible.
4. **Free the primary from success duty.** Four sites currently use `--primary` to mean "fine/done/granted" (`LaunchBar.tsx:42`, `Sidebar.tsx:62`, `StartScreen.tsx:40`, `PermissionsScreen.tsx:21`). A separate positive token would fix both the semantics and the 2.38:1 contrast in one move.
5. **Split `EqBars` into two components.** A brand mark and a capture meter that merely happen to be bars today. Cheap, and it unblocks P0-3.
6. **Rename `--window-radius` → `--radius-window`** and three arbitrary-value classes become `rounded-window`.
7. **Delete 148 lines.** Removing `badge`/`scroll-area`/`tooltip` (or committing to a real tooltip and deleting the other two) shrinks the surface the new palette has to cover — and if `tooltip` is adopted, 63 native `title=` attributes become themeable.
8. **Extend the `prefers-reduced-motion` block to `[data-slot]` selectors** or add `motion-reduce:animate-none` to the 5 primitives; either closes P1-1 in a handful of lines.
9. **Re-derive the syntax palette from the new hues.** Nine literals, one place (`index.css:235-276`), currently the loudest chromatic surface in the app.
10. **The 89%-in-six-steps spacing rhythm is already a system** — it just needs a top end. Adding one or two section-level steps would let screens breathe without touching 246 existing call sites.

---

## Open questions for the human

1. **Is the covert register intentional as *visual identity*, or only as *process identity*?** The bundle disguises itself as "Audio System" by design (`CLAUDE.md:363`), but the UI is seen only by its owner. Should the palette keep signalling "clandestine tool", or should the visible surface be calm and ordinary while the *process* stays disguised?
2. **What is the contrast floor, and does `window_opacity: 0.2` survive it?** At the minimum the HUD measures 1.29:1. Options: raise the min, make the shell ground opaque and let only the *frame* be translucent, or accept it as an expert setting. This decision constrains every colour value chosen afterwards.
3. **Is the `"gray" | "black"` pair worth keeping?** It costs 9 + 5 override declarations and a `Settings` field, and the two differ by ~0.05 L. Would one dark theme plus a future light theme be the better shape? (Changing the enum touches `settings.rs:254`, `window-controls.ts:39-44` and `AppearanceSection.tsx`.)
4. **Should a light theme be a target of this redesign or only unblocked by it?** Item 4 above lists what breaks. Designing the tokens *as if* light were coming costs little now and a great deal later.
5. **Can "listening" claim a frame-level treatment?** The strongest available signal is the window's own edge (`--window-radius` + `.app-shell`), but the HUD is `alwaysOnTop` and `contentProtected` and the frame is also what `clip_native_window_corners` controls in Rust. Is a coloured/animated window edge acceptable, given the no-`transition-opacity` constraint (`CLAUDE.md:163`)?
6. **Does the launcher need a mark at all?** Today the brand is 10.5px of 55%-alpha mono. Either it should be a real mark or the space should go to the readiness status, which is the launcher's actual job.
7. **Does the syntax-highlight palette get redesigned too, or is it out of scope?** It is 9 hues, entirely independent, and it is the most colourful thing a user ever sees in this product.
8. **Should `tooltip.tsx` be adopted or deleted?** 63 native `title=` attributes are the current answer. In an always-on-top, content-protected window, native tooltips may leak outside the protected surface — worth checking before deciding.
9. **How much of `apps/landing/src/components/app-demo/*` drift is acceptable?** It is a static copy of this UI (`00-repo-map.md:56-58`) and will be wrong the day this ships. Flagged as follow-up, not fixed here.
