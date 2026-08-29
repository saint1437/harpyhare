/**
 * `{name}` substitution, the same shape the desktop app uses
 * (`apps/desktop/src/i18n/format.ts`).
 *
 * It exists because the demo's copy carries the app's own templates — "{count}
 * строк", "Контекст чата: {used} из {max} токенов" — and a template is only
 * translatable while the holes stay inside the string. Building the same
 * sentence by concatenating JSX fixes the word order to Russian's, which is
 * exactly what a second language then cannot follow.
 *
 * A hole with no value is REMOVED rather than left as literal braces, and any
 * punctuation left dangling in front of it goes with it. That rule is the app's
 * and it is not decorative: `"Проверьте интернет или VPN. {details}"` has to
 * read as a finished sentence when the provider gave no details.
 */

/**
 * A private-use codepoint standing in for "this hole had no value". It never
 * occurs in copy, so the second pass can find the holes again without having to
 * re-parse the braces it has already consumed.
 */
const MISSING = "\uE000";

export function format(template: string, values: Record<string, string | number>): string {
  const filled = template.replace(/\{(\w+)\}/g, (_whole: string, key: string) => {
    const value = values[key];
    return value === undefined ? MISSING : String(value);
  });
  if (!filled.includes(MISSING)) return filled;
  return filled.replace(/\s*[:\u2014\u2013-]?\s*\uE000/g, "").trim();
}
