/**
 * One announcer per window. Every transient message — an error, a recorder
 * transition, an audio-check verdict, a stolen hotkey — routes through it.
 *
 * Before this the app had exactly one `aria-live` in the whole codebase and six
 * error surfaces, none of them announced; the recorder's only state indicator was
 * `aria-hidden`. Keep it mounted permanently: a live region inserted at the same
 * moment as its text is not reliably announced.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <span role="status" aria-live="polite" aria-atomic className="sr-only">
      {message}
    </span>
  );
}
