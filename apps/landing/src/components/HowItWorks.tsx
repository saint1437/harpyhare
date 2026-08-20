import type { Dictionary } from "@/i18n/types";
import { SectionHeading } from "./SectionHeading";

export function HowItWorks({ dict }: { dict: Dictionary }) {
  const copy = dict.how;
  return (
    <section id="how" className="px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading title={copy.title} hint={copy.hint} />
        <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-10">
          {copy.steps.map(({ number, title, text }) => (
            <li key={number}>
              <span
                className="block font-display text-[64px] leading-none font-black text-transparent sm:text-[92px]"
                style={{ WebkitTextStroke: "1.4px var(--fg)" }}
                aria-hidden
              >
                {number}
              </span>
              <h3 className="mt-5 font-display text-[13.5px] font-bold tracking-[0.04em] uppercase sm:text-[16.5px]">
                {title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-fg-muted sm:text-[14.5px]">
                {text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
