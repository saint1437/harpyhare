import type { Metadata } from "next";
import Link from "next/link";
import { MESSAGE_SCREEN_ACTION_CLASS, MessageScreen } from "@/components/MessageScreen";
import { RootHtml } from "@/components/RootHtml";
import { dictionary } from "@/i18n";
import { DEFAULT_LOCALE, LOCALE_PATH } from "@/i18n/types";
import "./globals.css";

export { viewport } from "@/lib/viewport";

// A 404 must never end up in the index, and it has no canonical of its own.
export const metadata: Metadata = { robots: { index: false, follow: true } };

/**
 * Both root layouts sit inside route groups, so an unmatched URL matches neither
 * and this file gets no layout at all — it has to render `<html>`/`<body>` itself
 * and pull in the stylesheet the groups' layouts normally import. The default
 * locale is the one `x-default` points at.
 */
export default function NotFound() {
  const dict = dictionary(DEFAULT_LOCALE);
  return (
    <RootHtml locale={DEFAULT_LOCALE}>
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
