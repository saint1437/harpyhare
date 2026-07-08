import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { RELEASES_PAGE } from "@/lib/release";
import { DownloadButton } from "./DownloadButton";
import { EqBars } from "./EqBars";

function versionLine(state: LatestReleaseState): string {
  if (state.status === "ready") return `v${state.release.version} · macOS 14.2+ · Apple Silicon`;
  if (state.status === "loading") return "Проверяем последнюю версию…";
  return "macOS 14.2+ · Apple Silicon";
}

export function Hero({ state }: { state: LatestReleaseState }) {
  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-[520px]" aria-hidden />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface/60 px-3.5 py-1.5 text-xs font-medium text-fg-muted">
          <EqBars animated />
          Плавающий HUD для macOS
        </span>

        <h1 className="mt-7 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
          Слушает, распознаёт и <span className="text-primary">отвечает</span>
        </h1>

        <p className="mt-6 max-w-xl text-base leading-relaxed text-pretty text-fg-muted sm:text-lg">
          Зажми клавишу — harpyhare захватит системный звук, расшифрует речь через Whisper и стримит
          ответ Claude прямо в окне поверх всего. Не отрываясь от экрана.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <DownloadButton state={state} />
          <span className="text-sm text-fg-subtle">{versionLine(state)}</span>
          <a
            href={RELEASES_PAGE}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Все версии на GitHub →
          </a>
        </div>
      </div>
    </section>
  );
}
