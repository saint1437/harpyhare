import Link from "next/link";
import { otherLocale } from "@/i18n";
import { LOCALE_HTML_LANG, LOCALE_PATH, type Dictionary } from "@/i18n/types";
import { RELEASES_PAGE } from "@/lib/release";
import { Logo } from "./Logo";
import { PlatformRequirements } from "./PlatformRequirements";

export function Footer({ dict }: { dict: Dictionary }) {
  const other = otherLocale(dict.locale);
  return (
    <footer className="bg-ink px-6 pb-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 border-t border-border pt-8 text-[12.5px] text-fg-subtle sm:flex-row sm:justify-between">
        <Logo />
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
    </footer>
  );
}
