import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/types";
import type { ReleaseInfo } from "@/lib/release";
import { structuredData } from "@/lib/structured-data";
import { CtaSection } from "./CtaSection";
import { Faq } from "./Faq";
import { Features } from "./Features";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { Marquee } from "./Marquee";
import { VisibilitySection } from "./VisibilitySection";
import { WindowSection } from "./WindowSection";

const SCRIPT_UNSAFE_CHARACTER = /</g;
const SCRIPT_SAFE_ESCAPE = "\\u003c";

function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(SCRIPT_UNSAFE_CHARACTER, SCRIPT_SAFE_ESCAPE);
}

export function LandingPage({ locale, release }: { locale: Locale; release: ReleaseInfo | null }) {
  const dict = dictionary(locale);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData(dict, release)) }}
      />
      <Header dict={dict} release={release} />
      <main id="content" className="overflow-x-clip">
        <Hero dict={dict} release={release} />
        <Marquee items={dict.marquee} />
        <HowItWorks dict={dict} />
        <WindowSection dict={dict} />
        <VisibilitySection dict={dict} />
        <Features dict={dict} />
        <Faq dict={dict} />
        <CtaSection dict={dict} release={release} />
      </main>
      <Footer dict={dict} />
    </>
  );
}
