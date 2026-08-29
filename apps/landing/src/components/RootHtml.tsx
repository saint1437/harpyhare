import type { ReactNode } from "react";
import { preload } from "react-dom";
import { dictionary } from "@/i18n";
import { LOCALE_HTML_LANG, type Locale } from "@/i18n/types";

/**
 * `fontVariables` and `fontPreloads` are threaded in rather than looked up here
 * on purpose: the declarations live in `lib/fonts-cyrillic.ts` and
 * `lib/fonts-latin.ts` and each locale's layout imports exactly one of them, so
 * that `/en` never has the Cyrillic subsets in its module graph.
 * `lib/fonts-latin.ts` explains why that is the only split that works, and why
 * the `<link rel="preload">` tags are emitted here instead of by `next/font`.
 *
 * `preload()` is the same call Next makes for its own font links
 * (`server/app-render/rsc/preloads.js`), with the same options, so the tag it
 * hoists into `<head>` is the one that used to be there — only the list is now
 * this locale's rather than the project's union.
 *
 * Development is left alone: the dev server hashes the font files differently,
 * and a preload naming a file `next dev` does not serve is a 404 at the highest
 * priority. The list is read out of a production build, so it is emitted in one.
 */
export function RootHtml({
  locale,
  fontVariables,
  fontPreloads,
  children,
}: {
  locale: Locale;
  fontVariables: string;
  fontPreloads: readonly string[];
  children: ReactNode;
}) {
  const dict = dictionary(locale);
  if (process.env.NODE_ENV === "production") {
    for (const href of fontPreloads) {
      preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
    }
  }
  return (
    <html lang={LOCALE_HTML_LANG[locale]} className={fontVariables}>
      <body className="isolate min-h-screen bg-bg font-sans text-fg antialiased">
        <a
          href="#content"
          className="sr-only border border-border-strong bg-ink px-4 py-2 text-sm text-fg focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100]"
        >
          {dict.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
