import {
  AudioLines,
  EyeOff,
  KeyRound,
  Languages,
  ScrollText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/i18n/types";
import { FEATURES_STARS } from "@/lib/stars";
import { Hare } from "./Hare";
import { Bush } from "./Scenery";
import { StarField } from "./Sky";

const FEATURE_ICONS: LucideIcon[] = [AudioLines, Languages, Sparkles, EyeOff, ScrollText, KeyRound];

export function Features({ dict }: { dict: Dictionary }) {
  return (
    <section id="features" className="relative border-t border-border px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-fg-subtle uppercase">
          {dict.features.eyebrow}
        </p>
        <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {dict.features.title}
        </h2>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dict.features.items.map(({ title, text }, index) => {
            const Icon = FEATURE_ICONS[index] ?? AudioLines;
            return (
              <article key={title} className="rounded-2xl border border-border bg-surface/40 p-6">
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="size-5" strokeWidth={2} aria-hidden />
                </span>
                <h3 className="mt-5 text-base font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{text}</p>
              </article>
            );
          })}
        </div>
      </div>

      <StarField stars={FEATURES_STARS} />
      <Bush width={90} className="left-[6%]" />
      <Hare
        height={52}
        idleMs={[7000, 14000]}
        range={[-24, 150]}
        className="left-[calc(6%+98px)]"
      />
      <Bush variant="front" width={64} className="right-[10%] hidden sm:block" />
    </section>
  );
}
