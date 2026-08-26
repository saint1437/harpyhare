/**
 * The window's announcer. Every transient message — an error, a recorder
 * transition, an audio-check verdict, a stolen hotkey — routes through one of
 * these rather than being left silent.
 *
 * Before this the app had exactly one `aria-live` in the whole codebase and six
 * error surfaces, none of them announced; the recorder's only state indicator was
 * `aria-hidden`. Keep it mounted permanently: a live region inserted at the same
 * moment as its text is not reliably announced. That is also what makes it
 * usable inside a flex column — `sr-only` is absolutely positioned, so an
 * announcer with nothing to say is not a flex item and costs no `gap`.
 *
 * The HUD mounts two, and they answer different questions: `StatusBar` announces
 * the capture state ("am I being heard?"), `NotificationStack` announces the
 * newest notification. Conflating them meant an error silencing the recorder's
 * own transitions for as long as it was on screen.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <span role="status" aria-live="polite" aria-atomic className="sr-only">
      {message}
    </span>
  );
}
