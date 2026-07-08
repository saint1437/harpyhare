import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { RELEASES_PAGE } from "@/lib/release";
import { DownloadButton } from "./DownloadButton";
import { Logo } from "./Logo";

export function Header({ state }: { state: LatestReleaseState }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-6">
          <a
            href="#how"
            className="hidden text-sm text-fg-muted transition-colors hover:text-fg sm:inline"
          >
            Как работает
          </a>
          <a
            href="#features"
            className="hidden text-sm text-fg-muted transition-colors hover:text-fg sm:inline"
          >
            Возможности
          </a>
          <a
            href={RELEASES_PAGE}
            target="_blank"
            rel="noreferrer"
            className="hidden text-sm text-fg-muted transition-colors hover:text-fg md:inline"
          >
            Релизы
          </a>
          <DownloadButton state={state} size="sm" />
        </nav>
      </div>
    </header>
  );
}
