/**
 * Substitution for the dictionary's templates, and the only thing that stands
 * between a Rust `AppError.params` and a sentence on screen.
 *
 * A template names its holes `{likeThis}`; the values come from `ErrorParams`,
 * which Rust guarantees holds machine values only. A hole with no value is
 * REMOVED rather than printed — the parameters an error carries depend on which
 * branch produced it (`details` is there for an upstream failure and absent for
 * a local one), so a template written for the richer case must degrade to a
 * clean sentence instead of leaking `{details}` at the user.
 */
const PLACEHOLDER = /\{(\w+)\}/gu;

/** What is left dangling once an empty hole is cut out of the middle or the end. */
const TRAILING_PUNCTUATION = /[\s:—–-]+$/u;
const DOUBLE_SPACE = / {2,}/gu;

export type FormatParams = Readonly<Record<string, string>>;

export function format(template: string, params: FormatParams = {}): string {
  const filled = template.replace(PLACEHOLDER, (_, name: string) => params[name] ?? "");
  return filled.replace(DOUBLE_SPACE, " ").replace(TRAILING_PUNCTUATION, "").trim();
}
