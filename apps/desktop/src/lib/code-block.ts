const TRAILING_NEWLINE = /\n$/;
const LANGUAGE_CLASS_PREFIX = "language-";
const HIGHLIGHT_META_LANGUAGES = new Set(["hljs", "undefined", "plaintext", "text"]);

const LINE_FORMS = ["строка", "строки", "строк"] as const;
const TEENS_START = 11;
const TEENS_END = 14;
const LAST_DIGIT_ONE = 1;
const LAST_DIGIT_FEW_END = 4;
const DECIMAL = 10;
const HUNDRED = 100;

export function codeLineCount(code: string): number {
  return code.replace(TRAILING_NEWLINE, "").split("\n").length;
}

/** «1 строка», «3 строки», «12 строк» — иначе число под кодом читается как опечатка. */
export function linesLabel(count: number): string {
  const withinHundred = count % HUNDRED;
  const lastDigit = count % DECIMAL;
  const isTeen = withinHundred >= TEENS_START && withinHundred <= TEENS_END;
  const form = isTeen
    ? LINE_FORMS[2]
    : lastDigit === LAST_DIGIT_ONE
      ? LINE_FORMS[0]
      : lastDigit > LAST_DIGIT_ONE && lastDigit <= LAST_DIGIT_FEW_END
        ? LINE_FORMS[1]
        : LINE_FORMS[2];
  return `${String(count)} ${form}`;
}

/**
 * `language-go` из класса код-элемента. rehype-highlight дописывает туда же
 * служебные токены (`hljs`) и подставляет `plaintext` там, где язык не опознан,
 * — такие подписи бесполезны и отбрасываются.
 */
export function languageFromClassName(className: string | undefined): string | null {
  if (className === undefined) return null;
  for (const token of className.split(/\s+/)) {
    if (!token.startsWith(LANGUAGE_CLASS_PREFIX)) continue;
    const language = token.slice(LANGUAGE_CLASS_PREFIX.length).toLowerCase();
    if (language !== "" && !HIGHLIGHT_META_LANGUAGES.has(language)) return language;
  }
  return null;
}
