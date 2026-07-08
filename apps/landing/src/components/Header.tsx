import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { RELEASES_PAGE } from "@/lib/release";
import { DownloadButton } from "./DownloadButton";
import { Logo } from "./Logo";

export function Header({ state }: { state: LatestReleaseState }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-5">
          <a
            href={RELEASES_PAGE}
            target="_blank"
            rel="noreferrer"
            className="hidden text-sm text-fg-muted hover:text-fg sm:inline"
          >
            Релизы
          </a>
          <DownloadButton state={state} size="sm" />
        </nav>
      </div>
    </header>
  );
}
