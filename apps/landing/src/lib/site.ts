import { LOCALE_PATH, type Locale } from "@/i18n/types";

export const SITE_URL = "https://harpyhare.ai";

export const SITE_NAME = "harpyhare";

export const OG_IMAGE_PATH: Record<Locale, string> = { ru: "/og.jpg", en: "/og-en.jpg" };

export const OG_IMAGE_WIDTH = 1200;

export const OG_IMAGE_HEIGHT = 630;

export const LOGO_PATH = "/logo.png";

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export function localeUrl(locale: Locale): string {
  return absoluteUrl(LOCALE_PATH[locale]);
}
