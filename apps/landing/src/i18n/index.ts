import { en } from "./en";
import { ru } from "./ru";
import type { Dictionary, Locale } from "./types";

const DICTIONARIES: Record<Locale, Dictionary> = { ru, en };

export function dictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export function otherLocale(locale: Locale): Locale {
  return locale === "ru" ? "en" : "ru";
}
