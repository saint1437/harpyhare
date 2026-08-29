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

/**
 * `bg-bg/95` and no `backdrop-blur-md`.
 *
 * The bar is fixed and full width, so a backdrop filter re-blurred a strip of
 * the viewport on every scroll frame — and what it blurred was the fixed
 * `body::before` layer, a `feTurbulence` noise tile over a gradient. That is a
 * reliable way to lose frames on an integrated GPU. Five more points of opacity
 * carry the separation the blur was there for: the ground behind the header is
 * the same `--bg` family, so at 95% the content scrolling under it reads as a
 * faint shadow rather than a smear, which is what it looked like at 85% anyway.
 */
export function Header({ dict, release }: { dict: Dictionary; release: ReleaseInfo | null }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border-strong bg-bg/95">
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
