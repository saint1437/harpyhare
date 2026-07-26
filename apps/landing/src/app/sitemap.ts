import type { MetadataRoute } from "next";
import { LOCALE_HTML_LANG, LOCALE_PATH, LOCALES } from "@/i18n/types";
import { localeUrl } from "@/lib/site";

const CHANGE_FREQUENCY = "weekly";
const RU_PRIORITY = 1;
const EN_PRIORITY = 0.8;

function languageAlternates(): Record<string, string> {
  return Object.fromEntries(LOCALES.map((locale) => [LOCALE_HTML_LANG[locale], localeUrl(locale)]));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = languageAlternates();
  return LOCALES.map((locale) => ({
    url: localeUrl(locale),
    changeFrequency: CHANGE_FREQUENCY,
    priority: LOCALE_PATH[locale] === LOCALE_PATH.ru ? RU_PRIORITY : EN_PRIORITY,
    alternates: { languages },
  }));
}
