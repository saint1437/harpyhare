import type { ReactNode } from "react";
import { dictionary } from "@/i18n";
import { LOCALE_HTML_LANG, type Locale } from "@/i18n/types";

export function RootHtml({ locale, children }: { locale: Locale; children: ReactNode }) {
  const dict = dictionary(locale);
  return (
    <html lang={LOCALE_HTML_LANG[locale]}>
      <body className="isolate min-h-screen bg-bg">
        <a
          href="#content"
          className="sr-only rounded-full border border-border-strong bg-bg-elevated px-4 py-2 text-sm text-fg focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100]"
        >
          {dict.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
