import { Golos_Text, Unbounded } from "next/font/google";
import type { ReactNode } from "react";
import { dictionary } from "@/i18n";
import { LOCALE_HTML_LANG, type Locale } from "@/i18n/types";

const display = Unbounded({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "700", "900"],
  variable: "--font-unbounded",
});

const sans = Golos_Text({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-golos",
});

export function RootHtml({ locale, children }: { locale: Locale; children: ReactNode }) {
  const dict = dictionary(locale);
  return (
    <html lang={LOCALE_HTML_LANG[locale]} className={`${display.variable} ${sans.variable}`}>
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
