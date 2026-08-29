"use client";

import { useEffect } from "react";
import type { Dictionary, Locale } from "@/i18n/types";
import { MESSAGE_SCREEN_ACTION_CLASS, MessageScreen } from "./MessageScreen";

/**
 * The three strings this screen needs, spelled out here instead of read from
 * `@/i18n`.
 *
 * The barrel pulls `ru.ts` and `en.ts`, and through them the whole demo copy —
 * ~95 KB of source. In a Client Component that import is a client import, so an
 * error boundary showing three lines used to add a 71 KB (21 KB gzip) script to
 * the eagerly loaded chunk group of *both* routes, on every visit, for a screen
 * almost nobody ever sees. `ErrorScreen.test.ts` asserts this table still equals
 * `dictionary(locale).error`, so the copy cannot drift out of the dictionaries.
 */
export const ERROR_COPY: Record<Locale, Dictionary["error"]> = {
  ru: {
    title: "Что-то сломалось",
    text: "Страница не отрисовалась. Попробуйте ещё раз — обычно этого хватает.",
    retry: "Попробовать снова",
  },
  en: {
    title: "Something broke",
    text: "The page failed to render. Try again — that usually settles it.",
    retry: "Try again",
  },
};

/**
 * The body of both route groups' `error.tsx`. An error boundary in the App Router
 * has to be a Client Component — React needs a class boundary on the client to
 * catch the throw and to hand back a `reset()` — so this file carries the
 * directive and the two `error.tsx` files stay one line each.
 */
export function ErrorScreen({
  locale,
  error,
  reset,
}: {
  locale: Locale;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const copy = ERROR_COPY[locale];

  useEffect(() => {
    // There is no error reporter on this site; the console is the only trace a
    // visitor's report can be matched against, and `digest` is what shows up in
    // the server logs for the same failure.
    console.error(error);
  }, [error]);

  return (
    <MessageScreen
      code="500"
      title={copy.title}
      text={copy.text}
      action={
        <button type="button" onClick={reset} className={MESSAGE_SCREEN_ACTION_CLASS}>
          {copy.retry}
        </button>
      }
    />
  );
}
