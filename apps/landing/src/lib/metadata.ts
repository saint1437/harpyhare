import type { Metadata } from "next";
import { dictionary } from "@/i18n";
import { DEFAULT_LOCALE, LOCALE_HTML_LANG, LOCALES, OG_LOCALE, type Locale } from "@/i18n/types";
import {
  localeUrl,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  SITE_NAME,
  SITE_URL,
} from "./site";

const X_DEFAULT = "x-default";

function languageAlternates(): Record<string, string> {
  const alternates = Object.fromEntries(
    LOCALES.map((locale) => [LOCALE_HTML_LANG[locale], localeUrl(locale)]),
  );
  return { ...alternates, [X_DEFAULT]: localeUrl(DEFAULT_LOCALE) };
}

export function pageMetadata(locale: Locale): Metadata {
  const dict = dictionary(locale);
  const url = localeUrl(locale);
  const images = [
    {
      url: OG_IMAGE_PATH[locale],
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      alt: dict.meta.ogTitle,
    },
  ];

  return {
    metadataBase: new URL(SITE_URL),
    title: dict.meta.title,
    description: dict.meta.description,
    keywords: dict.meta.keywords,
    applicationName: SITE_NAME,
    category: "technology",
    alternates: {
      canonical: url,
      languages: languageAlternates(),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url,
      title: dict.meta.ogTitle,
      description: dict.meta.ogDescription,
      locale: OG_LOCALE[locale],
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: dict.meta.ogTitle,
      description: dict.meta.ogDescription,
      images,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}
