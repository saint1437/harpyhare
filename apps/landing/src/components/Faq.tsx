import type { Dictionary } from "@/i18n/types";
import { SectionHeading } from "./SectionHeading";

export function Faq({ dict }: { dict: Dictionary }) {
  const copy = dict.faq;
  return (
    <section id="faq" className="px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading title={copy.title} />
        <div className="mt-8 grid items-start border-t border-border sm:grid-cols-2 sm:gap-x-14">
          {copy.items.map(({ question, answer }) => (
            <details key={question} className="group border-b border-border py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-5 text-left">
                <h3 className="text-[14.5px] leading-snug font-semibold text-balance sm:text-[16px]">
                  {question}
                </h3>
                <span
                  className="relative mt-2 size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-45"
                  aria-hidden
                >
                  <span className="absolute top-1/2 left-0 h-[2px] w-4 -translate-y-1/2 bg-current" />
                  <span className="absolute top-0 left-1/2 h-4 w-[2px] -translate-x-1/2 bg-current" />
                </span>
              </summary>
              <p className="mt-3 text-[13px] leading-relaxed text-pretty text-fg-muted sm:text-[13.5px]">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
