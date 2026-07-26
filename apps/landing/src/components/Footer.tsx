import { PLATFORM_REQUIREMENTS, type Platform } from "@/lib/platform";
import { RELEASES_PAGE } from "@/lib/release";
import { Logo } from "./Logo";
import { Bush } from "./Scenery";

export function Footer({ platform }: { platform: Platform }) {
  return (
    <footer className="relative border-t border-border px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-fg-subtle sm:flex-row">
        <Logo showMark={false} />
        <span>{PLATFORM_REQUIREMENTS[platform]}</span>
        <a
          href={RELEASES_PAGE}
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-fg"
        >
          GitHub
        </a>
      </div>

      <Bush variant="front" width={72} className="right-[4%]" />
    </footer>
  );
}
