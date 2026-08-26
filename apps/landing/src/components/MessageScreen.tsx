import type { ReactNode } from "react";

/**
 * The one full-height screen behind both `not-found.tsx` and `error.tsx`. They
 * differ only in the copy and in whether the action is a link or a button, and
 * `error.tsx` has to be a Client Component while `not-found.tsx` does not — which
 * is exactly why the shared markup lives here instead of in either of them.
 */
export function MessageScreen({
  code,
  title,
  text,
  action,
}: {
  code: string;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <main
      id="content"
      className="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center"
    >
      <span
        className="font-display text-[clamp(4rem,22vw,10rem)] leading-none font-black text-transparent"
        style={{ WebkitTextStroke: "2px var(--fg)" }}
        aria-hidden
      >
        {code}
      </span>
      <h1 className="mt-8 font-display text-[clamp(1.4rem,5vw,2.25rem)] leading-tight font-black text-balance uppercase">
        {title}
      </h1>
      <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-fg-muted">{text}</p>
      <div className="mt-8">{action}</div>
    </main>
  );
}

export const MESSAGE_SCREEN_ACTION_CLASS =
  "shadow-poster inline-flex items-center justify-center bg-fg px-7 py-4 text-center font-display text-[12px] font-bold tracking-[0.03em] text-bg-deep uppercase transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg sm:px-8 sm:text-[13.5px]";
