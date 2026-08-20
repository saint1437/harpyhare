import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/cn";
import { RELEASES_PAGE, type ReleaseInfo } from "@/lib/release";
import { DownloadChoice } from "./DownloadChoice";
import { EqBars } from "./EqBars";
import { VersionNote } from "./VersionNote";

const PLAQUE = "harpy hare · est. 2026";
const PERIOD = ".";

/** The closing period stays solid ink while the word itself is outlined — the
 *  accent the poster leans on. Lines without one simply render outlined. */
function OutlineLine({ text }: { text: string }) {
  const period = text.endsWith(PERIOD);
  return (
    <span className="block">
      <span className="text-stroke">{period ? text.slice(0, -1) : text}</span>
      {period && <span className="text-ink">{PERIOD}</span>}
    </span>
  );
}

function HeroArt({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <img
        src="/linocut/hero-hare.svg"
        alt=""
        aria-hidden
        draggable={false}
        className="shadow-poster sm:shadow-poster-lg block aspect-3/4 w-full border-2 border-fg object-cover"
      />
      <span className="absolute bottom-5 -left-2 bg-ink px-3 py-2 font-display text-[8.5px] font-medium tracking-[0.14em] uppercase sm:px-4 sm:text-[10px]">
        {PLAQUE}
      </span>
    </div>
  );
}

export function Hero({ dict, release }: { dict: Dictionary; release: ReleaseInfo | null }) {
  const copy = dict.hero;
  return (
    <section className="px-6 pt-24 pb-16 sm:pt-28 sm:pb-20">
      <div className="mx-auto grid max-w-6xl items-start gap-12 xl:grid-cols-12 xl:gap-10">
        <div className="fade-rise flex min-w-0 flex-col xl:col-span-8">
          <span className="inline-flex w-fit max-w-full items-center gap-2.5 border-[1.5px] border-border-strong px-3.5 py-2 font-display text-[9px] font-medium tracking-[0.1em] uppercase sm:px-4 sm:text-[10.5px]">
            <EqBars animated />
            <span className="min-w-0">{copy.badge}</span>
          </span>

          <h1 className="mt-6 font-display text-[clamp(1.5rem,9.2vw,4.6rem)] leading-[1] font-black tracking-[-0.015em] uppercase sm:mt-8">
            {copy.titleSolid.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            {copy.titleOutline.map((line) => (
              <OutlineLine key={line} text={line} />
            ))}
          </h1>

          <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-pretty text-fg/85 sm:text-[16.5px]">
            {copy.lead}
          </p>

          <DownloadChoice
            release={release}
            primaryPrefix={dict.download.primaryPrefix}
            className="mt-8"
          />

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <VersionNote release={release} />
            <a
              href={RELEASES_PAGE}
              target="_blank"
              rel="noreferrer"
              className="text-[12.5px] text-fg-subtle underline underline-offset-4 transition-colors hover:text-fg"
            >
              {copy.allVersions}
            </a>
          </div>

          <HeroArt className="mt-10 xl:hidden" />
        </div>

        <div className="fade-rise fade-rise-late hidden min-w-0 xl:col-span-4 xl:block xl:justify-self-end">
          <HeroArt />
        </div>
      </div>
    </section>
  );
}
