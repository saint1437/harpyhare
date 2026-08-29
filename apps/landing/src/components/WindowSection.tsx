import type { Dictionary } from "@/i18n/types";
import { AppDemoSection } from "./app-demo/AppDemoSection";

const RADIATE_MASK = "radial-gradient(115% 95% at 0% 45%, #000 18%, transparent 72%)";

export function WindowSection({ dict }: { dict: Dictionary }) {
  const copy = dict.window;
  return (
    <section className="relative overflow-hidden bg-ink px-6 py-20 sm:py-24">
      <img
        src="/linocut/sound-waves.svg"
        alt=""
        aria-hidden
        /* Below the fold, and 93 KB of it. React emits a `<link rel="preload"
           as="image">` for every server-rendered `<img>`, so eagerly this plate
           raced the hero image and the fonts; React skips the preload for a
           lazily loaded one. */
        loading="lazy"
        /* the arcs converge into a solid mass at the plate's right edge, so the
           motif is faded out from its sparse left side instead of being cropped */
        style={{ maskImage: RADIATE_MASK, WebkitMaskImage: RADIATE_MASK }}
        className="pointer-events-none absolute -top-20 -right-32 w-[380px] opacity-45 sm:w-[620px]"
      />
      <div className="relative mx-auto max-w-5xl">
        <h2 className="max-w-3xl font-display text-[26px] leading-[1.12] font-black text-balance uppercase sm:text-[44px]">
          {copy.titlePlain}
          <span className="text-stroke">{copy.titleOutline}</span>
        </h2>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fg-muted">{copy.sub}</p>

        {/* `dict.app` and not `dict`: props of a Client Component are serialised
            into the inline RSC payload, so passing the whole dictionary put the
            page's every string into the HTML for the sake of the one branch the
            demo reads. */}
        <AppDemoSection copy={dict.app} />

        <div className="mt-7 grid gap-3.5 sm:grid-cols-3">
          {copy.cards.map(({ title, text }) => (
            <article key={title} className="border-[1.5px] border-border-strong p-5 sm:p-6">
              <h3 className="font-display text-xs font-bold tracking-[0.08em] uppercase">
                {title}
              </h3>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-fg-muted">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
