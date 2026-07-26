import { ChevronDown } from "lucide-react";
import type { Dictionary } from "@/i18n/types";
import { Cloud } from "./Sky";

export function Faq({ dict }: { dict: Dictionary }) {
  return (
    <section id="faq" className="relative border-t border-border px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-fg-subtle uppercase">
          {dict.faq.eyebrow}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {dict.faq.title}
        </h2>

        <div className="mt-10 divide-y divide-border border-y border-border">
          {dict.faq.items.map(({ question, answer }) => (
            <details key={question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-left">
                <h3 className="text-base font-semibold tracking-tight text-balance">{question}</h3>
                <ChevronDown
                  className="mt-0.5 size-5 shrink-0 text-fg-subtle transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-fg-muted">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </div>

      <Cloud
        variant="puffy"
        width={118}
        drift={42}
        className="top-[70px] left-[7%] hidden lg:block"
      />
    </section>
  );
}
