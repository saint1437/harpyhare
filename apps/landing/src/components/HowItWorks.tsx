import type { Dictionary } from "@/i18n/types";
import { HOW_STARS } from "@/lib/stars";
import { BushWatcher } from "./Scenery";
import { StarField } from "./Sky";

export function HowItWorks({ dict }: { dict: Dictionary }) {
  return (
    <section id="how" className="relative border-t border-border px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-fg-subtle uppercase">
          {dict.how.eyebrow}
        </p>
        <h2 className="mt-3 max-w-md text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {dict.how.title}
        </h2>

        <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {dict.how.steps.map(({ number, title, text }) => (
            <li key={number}>
              <span className="font-mono text-sm font-medium text-primary">{number}</span>
              <h3 className="mt-3 text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>

      <StarField stars={HOW_STARS} />
      <BushWatcher className="right-[8%]" />
    </section>
  );
}
