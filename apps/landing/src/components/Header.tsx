import type { Dictionary } from "@/i18n/types";
import { cn } from "@/lib/cn";
import { RELEASES_PAGE, type ReleaseInfo } from "@/lib/release";
import { DownloadButton } from "./DownloadButton";
import { Logo } from "./Logo";

interface NavLink {
  href: string;
  label: string;
  show: string;
  external?: boolean;
}

function navLinks(dict: Dictionary): NavLink[] {
  return [
    { href: "#how", label: dict.nav.how, show: "sm:inline" },
    { href: "#features", label: dict.nav.features, show: "md:inline" },
    { href: "#faq", label: dict.nav.faq, show: "md:inline" },
    { href: RELEASES_PAGE, label: dict.nav.releases, show: "lg:inline", external: true },
  ];
}

export function Header({ dict, release }: { dict: Dictionary; release: ReleaseInfo | null }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border-strong bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:h-20">
        <Logo />
        <nav aria-label={dict.nav.label} className="flex items-center gap-6 sm:gap-7">
          {navLinks(dict).map((link) => (
            <a
              key={link.href}
              href={link.href}
              {...(link.external && { target: "_blank", rel: "noreferrer" })}
              className={cn(
                "hidden text-[13.5px] font-medium text-fg-muted transition-colors hover:text-fg",
                link.show,
              )}
            >
              {link.label}
            </a>
          ))}
          <DownloadButton release={release} label={dict.nav.download} />
        </nav>
      </div>
    </header>
  );
}
