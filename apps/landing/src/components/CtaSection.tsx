import type { Dictionary } from "@/i18n/types";
import type { ReleaseInfo } from "@/lib/release";
import { DownloadChoice } from "./DownloadChoice";
import { VersionNote } from "./VersionNote";

export function CtaSection({ dict, release }: { dict: Dictionary; release: ReleaseInfo | null }) {
  const copy = dict.cta;
  return (
    <section className="bg-ink px-6 pt-20 pb-16 sm:pt-24 sm:pb-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <h2 className="font-display text-[clamp(1.8rem,7vw,3.5rem)] leading-[1.06] font-black text-balance uppercase">
            {copy.titlePlain}
            <span className="text-stroke">{copy.titleOutline}</span>
          </h2>
          <p className="mt-5 max-w-lg text-[14.5px] leading-relaxed text-fg-muted sm:text-[15px]">
            {copy.text}
          </p>
          <DownloadChoice
            release={release}
            primaryPrefix={dict.download.primaryPrefix}
            className="mt-8"
          />
          <VersionNote version={release?.version ?? null} className="mt-4 block" />
        </div>
        <div className="lg:col-span-5">
          <img
            src="/linocut/hare-leap.svg"
            alt=""
            aria-hidden
            draggable={false}
            /* The last section of the page. React emits a `<link rel="preload"
               as="image">` for every server-rendered `<img>`, and this plate is
               114 KB of decoration; eagerly it competed with the hero image and
               the four font files. React skips the preload once it is lazy. */
            loading="lazy"
            className="block aspect-3/2 w-full border-2 border-fg object-cover shadow-[8px_8px_0_var(--bg)] sm:shadow-[12px_12px_0_var(--bg)]"
          />
        </div>
      </div>
    </section>
  );
}
