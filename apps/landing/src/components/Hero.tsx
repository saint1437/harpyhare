import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { SUPPORTED_PLATFORMS_LABEL, type Platform } from "@/lib/platform";
import { RELEASES_PAGE } from "@/lib/release";
import { AppDemo } from "./app-demo/AppDemo";
import { DownloadChoice } from "./DownloadChoice";
import { EqBars } from "./EqBars";
import { Bush } from "./Scenery";
import { Cloud } from "./Sky";
import { VersionNote } from "./VersionNote";

interface HeroProps {
  state: LatestReleaseState;
  platform: Platform;
}

export function Hero({ state, platform }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-20 sm:pt-40 sm:pb-24">
      <div
        className="hero-tint pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        aria-hidden
      />

      <div className="fade-rise relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-2.5 rounded-full border border-border-strong bg-surface/60 px-4 py-1.5 text-[13px] font-medium text-fg-muted">
          <EqBars animated />
          Незаметный ассистент для {SUPPORTED_PLATFORMS_LABEL}
        </span>

        <h1 className="mt-8 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
          Слышит вопрос.
          <br />
          <span className="text-primary">Показывает ответ.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">
          Зажмите клавишу — harpyhare запишет звук из любого приложения, распознает речь и покажет
          ответ Claude поверх остальных окон. От вопроса до ответа — пара секунд.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <DownloadChoice state={state} platform={platform} />
          <a
            href={RELEASES_PAGE}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-border-strong px-7 py-3.5 text-base font-medium text-fg-muted transition-colors hover:bg-surface/60 hover:text-fg"
          >
            Все версии
          </a>
        </div>

        <VersionNote state={state} platform={platform} className="mt-4" />
      </div>

      <AppDemo />

      <Cloud
        variant="wide"
        width={200}
        drift={48}
        className="top-[120px] left-[6%] hidden sm:block"
      />
      <Cloud variant="small" width={104} drift={60} className="top-[64px] left-[34%]" />
      <Cloud
        variant="puffy"
        width={144}
        drift={38}
        className="top-[190px] right-[24%] hidden md:block"
      />

      <Bush variant="front" width={120} className="left-[5%] hidden sm:block" />
      <Bush variant="back" width={150} className="right-[7%]" />
      <Bush variant="front" width={95} className="right-[calc(7%+110px)] hidden sm:block" />
    </section>
  );
}
