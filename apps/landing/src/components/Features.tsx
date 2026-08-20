import type { Dictionary } from "@/i18n/types";
import { SectionHeading } from "./SectionHeading";

export function Features({ dict }: { dict: Dictionary }) {
  const copy = dict.features;
  return (
    <section id="features" className="px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading title={copy.title} />
        <ul className="mt-9 border-t-[1.5px] border-border-strong">
          {copy.items.map(({ title, text }, index) => (
            <li
              key={title}
              className="flex flex-col gap-2 border-b border-border py-5 sm:flex-row sm:items-baseline sm:gap-8 sm:py-6"
            >
              <span
                className="shrink-0 font-display text-[22px] leading-none font-black text-transparent sm:w-16 sm:text-[34px]"
                style={{ WebkitTextStroke: "1.1px var(--fg)" }}
                aria-hidden
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display text-[12px] font-bold tracking-[0.04em] uppercase sm:w-[340px] sm:shrink-0 sm:text-[15px]">
                {title}
              </h3>
              <p className="text-[13.5px] leading-relaxed text-fg-muted sm:text-[14.5px]">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
