import type { LatestReleaseState } from "@/hooks/useLatestRelease";
import { cn } from "@/lib/cn";
import type { Platform } from "@/lib/platform";
import { RELEASES_PAGE } from "@/lib/release";
import { DownloadButton } from "./DownloadButton";
import { Logo } from "./Logo";

const NAV = [
  { href: "#how", label: "Как работает", show: "sm:inline" },
  { href: "#features", label: "Возможности", show: "sm:inline" },
  { href: RELEASES_PAGE, label: "Релизы", show: "md:inline", external: true },
];

export function Header({ state, platform }: { state: LatestReleaseState; platform: Platform }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-6">
          {NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              {...(link.external && { target: "_blank", rel: "noreferrer" })}
              className={cn(
                "hidden text-sm text-fg-muted transition-colors hover:text-fg",
                link.show,
              )}
            >
              {link.label}
            </a>
          ))}
          <DownloadButton state={state} platform={platform} />
        </nav>
      </div>
    </header>
  );
}
