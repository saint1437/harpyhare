import type { Metadata } from "next";
import Link from "next/link";
import { MESSAGE_SCREEN_ACTION_CLASS, MessageScreen } from "@/components/MessageScreen";
import { RootHtml } from "@/components/RootHtml";
import { dictionary } from "@/i18n";
import { DEFAULT_LOCALE, LOCALE_PATH } from "@/i18n/types";
import { FONT_VARIABLES } from "@/lib/fonts-cyrillic";
import "./globals.css";

export { viewport } from "@/lib/viewport";

// A 404 must never end up in the index, and it has no canonical of its own.
export const metadata: Metadata = { robots: { index: false, follow: true } };

/**
 * Both root layouts sit inside route groups, so an unmatched URL matches neither
 * and this file gets no layout at all — it has to render `<html>`/`<body>` itself
 * and pull in the stylesheet the groups' layouts normally import. The default
 * locale is the one `x-default` points at.
 *
 * **It preloads nothing, deliberately.** Next renders this file into the
 * not-found boundary of EVERY route, not only of a 404 — measured: `/en`'s HTML
 * carries this page's markup — so a `preload()` here fires on `/en` too, and the
 * default locale's Cyrillic pair would land straight back on the one route the
 * split in `lib/fonts-latin.ts` exists to keep it off. Preloading the Latin pair
 * instead does work, but it drags `lib/fonts-latin.ts` into this file's graph and
 * Turbopack then merges the two font stylesheets into one chunk, which puts the
 * 8 KB Cyrillic `@font-face` block back on `/en` — a worse trade than a 404 that
 * swaps its fonts in.
 */
export default function NotFound() {
  const dict = dictionary(DEFAULT_LOCALE);
  return (
    <RootHtml locale={DEFAULT_LOCALE} fontVariables={FONT_VARIABLES} fontPreloads={[]}>
      <MessageScreen
        code="404"
        title={dict.notFound.title}
        text={dict.notFound.text}
        action={
          <Link href={LOCALE_PATH[DEFAULT_LOCALE]} className={MESSAGE_SCREEN_ACTION_CLASS}>
            {dict.notFound.home}
          </Link>
        }
      />
    </RootHtml>
  );
}
