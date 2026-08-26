"use client";

import { useEffect } from "react";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/types";
import { MESSAGE_SCREEN_ACTION_CLASS, MessageScreen } from "./MessageScreen";

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
  const dict = dictionary(locale);

  useEffect(() => {
    // There is no error reporter on this site; the console is the only trace a
    // visitor's report can be matched against, and `digest` is what shows up in
    // the server logs for the same failure.
    console.error(error);
  }, [error]);

  return (
    <MessageScreen
      code="500"
      title={dict.error.title}
      text={dict.error.text}
      action={
        <button type="button" onClick={reset} className={MESSAGE_SCREEN_ACTION_CLASS}>
          {dict.error.retry}
        </button>
      }
    />
  );
}
