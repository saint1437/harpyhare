import { EyeOff } from "lucide-react";
import type { Dictionary } from "@/i18n/types";
import { SectionHeading } from "./SectionHeading";

function PanelLabel({ children }: { children: string }) {
  return (
    <p className="font-display text-[9px] font-medium tracking-[0.14em] text-fg-subtle uppercase sm:text-[10px]">
      {children}
    </p>
  );
}

/** The two panels are deliberately the same size and share one inner frame, so
 *  the only difference a reader sees is the window that is there — or is not. */
export function VisibilitySection({ dict }: { dict: Dictionary }) {
  const copy = dict.visibility;
  return (
    <section className="px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading title={copy.title} />
        <div className="mt-10 grid gap-8 sm:grid-cols-2 sm:gap-7">
          <div>
            <PanelLabel>{copy.yours}</PanelLabel>
            <div className="shadow-poster relative mt-3.5 h-[240px] border-2 border-fg bg-app-bg sm:h-[300px]">
              <div
                className="absolute inset-3.5 border border-app-border bg-app-surface"
                aria-hidden
              />
              <div className="absolute top-6 right-6 w-[62%] border-[1.5px] border-fg/80 bg-app-card px-4 py-3.5 shadow-[0_18px_44px_-12px_rgb(0_0_0/0.8)] sm:top-8 sm:right-8">
                <p className="text-app-hint text-app-muted">harpyhare</p>
                <p className="mt-2 text-app-body leading-relaxed text-app-fg">
                  {copy.sample}
                  <span className="caret text-app-recording">▍</span>
                </p>
              </div>
            </div>
          </div>
          <div>
            <PanelLabel>{copy.theirs}</PanelLabel>
            <div className="relative mt-3.5 h-[240px] border-2 border-dashed border-border-strong bg-ink/35 sm:h-[300px]">
              <div
                className="absolute inset-3.5 border border-app-border bg-app-surface"
                aria-hidden
              />
              <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
                <EyeOff className="size-7 text-fg/70" strokeWidth={1.8} aria-hidden />
                <p className="font-display text-[10px] font-medium tracking-[0.12em] text-fg/70 uppercase">
                  {copy.empty}
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-fg-subtle sm:text-[13.5px]">
          {copy.caveat}
        </p>
      </div>
    </section>
  );
}
