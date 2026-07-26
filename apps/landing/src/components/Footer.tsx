import Link from "next/link";
import { otherLocale } from "@/i18n";
import { LOCALE_HTML_LANG, LOCALE_PATH, type Dictionary } from "@/i18n/types";
import { RELEASES_PAGE } from "@/lib/release";
import { Logo } from "./Logo";
import { PlatformRequirements } from "./PlatformRequirements";
import { Bush } from "./Scenery";

export function Footer({ dict }: { dict: Dictionary }) {
  const other = otherLocale(dict.locale);
  return (
    <footer className="relative border-t border-border px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-fg-subtle sm:flex-row">
        <Logo showMark={false} />
        <PlatformRequirements />
        <div className="flex items-center gap-6">
          <Link
            href={LOCALE_PATH[other]}
            hrefLang={LOCALE_HTML_LANG[other]}
            className="transition-colors hover:text-fg"
          >
            {dict.footer.localeSwitch}
          </Link>
          <a
            href={RELEASES_PAGE}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-fg"
          >
            {dict.footer.github}
          </a>
        </div>
      </div>

      <Bush variant="front" width={72} className="right-[4%]" />
    </footer>
  );
}
