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
    titleTop: string;
    titleAccent: string;
    lead: string;
    allVersions: string;
  };
  download: {
    primaryPrefix: string;
    unavailable: string;
  };
  app: DemoCopy;
  how: {
    eyebrow: string;
    title: string;
    steps: Step[];
  };
  features: {
    eyebrow: string;
    title: string;
    items: FeatureCopy[];
  };
  faq: {
    eyebrow: string;
    title: string;
    items: FaqItem[];
  };
  cta: {
    title: string;
    text: string;
  };
  footer: {
    github: string;
    localeSwitch: string;
  };
}
