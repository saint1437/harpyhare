import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { DownloadButton } from "./DownloadButton";
import { HareScene } from "./HareScene";
import { Bush } from "./Scenery";
import { CTA_STARS, StarField } from "./Sky";
import { VersionNote } from "./VersionNote";

export function CtaSection({ state }: { state: LatestReleaseState }) {
  return (
    <section className="relative border-t border-border px-6 pt-20 pb-48 sm:pt-28 sm:pb-52">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Попробуйте на следующем созвоне
        </h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-pretty text-fg-muted">
          Приложение бесплатное — понадобятся только ваши API-ключи Groq и Anthropic.
        </p>
        <DownloadButton state={state} className="mt-8" />
        <VersionNote state={state} className="mt-4" />
      </div>
      <StarField stars={CTA_STARS} />
      <Bush width={115} className="right-[9%] hidden sm:block" />
      <HareScene />
    </section>
  );
}
