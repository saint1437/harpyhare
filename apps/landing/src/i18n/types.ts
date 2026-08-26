import type { DemoCopy } from "./demo-types";

export const LOCALES = ["ru", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ru";

export const LOCALE_PATH: Record<Locale, string> = { ru: "/", en: "/en" };

export const LOCALE_HTML_LANG: Record<Locale, string> = { ru: "ru", en: "en" };

export const OG_LOCALE: Record<Locale, string> = { ru: "ru_RU", en: "en_US" };

export interface Step {
  number: string;
  title: string;
  text: string;
}

export interface FeatureCopy {
  title: string;
  text: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Dictionary {
  locale: Locale;
  meta: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    keywords: string[];
    applicationCategoryLabel: string;
  };
  skipToContent: string;
  nav: {
    label: string;
    how: string;
    features: string;
    faq: string;
    releases: string;
    download: string;
  };
  hero: {
    badge: string;
    titleSolid: string[];
    titleOutline: string[];
    lead: string;
    allVersions: string;
  };
  download: {
    primaryPrefix: string;
    unavailable: string;
  };
  marquee: string[];
  app: DemoCopy;
  how: {
    title: string;
    hint: string;
    steps: Step[];
  };
  window: {
    titlePlain: string;
    titleOutline: string;
    sub: string;
    cards: FeatureCopy[];
  };
  visibility: {
    title: string;
    yours: string;
    theirs: string;
    empty: string;
    sample: string;
    caveat: string;
  };
  features: {
    title: string;
    items: FeatureCopy[];
  };
  faq: {
    title: string;
    items: FaqItem[];
  };
  cta: {
    titlePlain: string;
    titleOutline: string;
    text: string;
  };
  footer: {
    github: string;
    localeSwitch: string;
  };
  notFound: {
    title: string;
    text: string;
    home: string;
  };
  error: {
    title: string;
    text: string;
    retry: string;
  };
}
