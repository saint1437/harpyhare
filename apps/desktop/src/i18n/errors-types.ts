import type { ErrorCode } from "@/lib/errors";

/**
 * A machine sub-key inside a code — the mirror of `error::subject` in Rust.
 *
 * Several codes cover more than one situation: `permission` alone is system
 * audio, the microphone and screen recording, and the app used to tell them
 * apart with a Russian sentence written at each site. The distinction travels
 * as a value now, and the phrase for it lives here. The list is exhaustive on
 * both sides — `i18n/errors.test.ts` holds it to Rust's `subject::ALL`.
 */
export const ERROR_SUBJECTS = [
  "systemAudioPermission",
  "systemAudioDevice",
  "microphone",
  "microphoneUnavailable",
  "screenRecording",
  "silenceGated",
  "silenceDevice",
  "pttBusy",
  "autoActive",
  "checkRunning",
  "clipboardDecode",
  "clipboardWrite",
  "updateInstalling",
  "updateMissing",
  "importUnsupported",
  "importPdfNoText",
  "importPdfParse",
  "importTooLarge",
  "redeemBadResponse",
  "redeemEmptyToken",
  "redeemFailed",
  "redeemUpstreamDown",
  "redeemTooMany",
  "requestTooLarge",
  "streamTruncated",
] as const;

export type ErrorSubject = (typeof ERROR_SUBJECTS)[number];

export interface ErrorsCopy {
  /**
   * The headline. Short by construction — it is the one part guaranteed to fit,
   * which is why the code and never the message decides it.
   */
  titles: Record<ErrorCode, string>;
  /**
   * The body, as a template over `AppError.params`. `{details}` is the upstream's
   * own text quoted inside the frame; a hole with no value is cut out, so a
   * template may name a parameter that only some branches carry.
   */
  bodies: Record<ErrorCode, string>;
  /** The finished sentence for a subject; it replaces the code's body entirely. */
  subjects: Record<ErrorSubject, string>;
}
