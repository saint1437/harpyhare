import { RELEASES_PAGE } from "@/lib/release";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-fg-subtle sm:flex-row">
        <Logo />
        <span>macOS 14.2+ · Apple Silicon</span>
        <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className="hover:text-fg">
          GitHub
        </a>
      </div>
    </footer>
  );
}
