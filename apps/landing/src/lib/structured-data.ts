import type { Dictionary } from "@/i18n/types";
import { LOCALE_HTML_LANG } from "@/i18n/types";
import { PLATFORM_REQUIREMENTS, PLATFORMS } from "./platform";
import { RELEASES_PAGE, type ReleaseInfo } from "./release";
import {
  absoluteUrl,
  localeUrl,
  LOGO_PATH,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  SITE_NAME,
  SITE_URL,
} from "./site";

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const APPLICATION_ID = `${SITE_URL}/#application`;

const APPLICATION_CATEGORY = "BusinessApplication";
const FREE_PRICE = "0";
const PRICE_CURRENCY = "USD";
const IN_STOCK = "https://schema.org/InStock";

function operatingSystems(): string {
  return PLATFORMS.map((platform) => PLATFORM_REQUIREMENTS[platform]).join(", ");
}

export function structuredData(dict: Dictionary, release: ReleaseInfo | null): object {
  const pageUrl = localeUrl(dict.locale);
  const language = LOCALE_HTML_LANG[dict.locale];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: SITE_NAME,
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl(LOGO_PATH),
        },
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        url: SITE_URL,
        publisher: { "@id": ORGANIZATION_ID },
        inLanguage: language,
      },
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: dict.meta.title,
        description: dict.meta.description,
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": APPLICATION_ID },
        inLanguage: language,
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: absoluteUrl(OG_IMAGE_PATH[dict.locale]),
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": APPLICATION_ID,
        name: SITE_NAME,
        url: SITE_URL,
        description: dict.meta.description,
        applicationCategory: APPLICATION_CATEGORY,
        applicationSubCategory: dict.meta.applicationCategoryLabel,
        operatingSystem: operatingSystems(),
        softwareVersion: release?.version,
        downloadUrl: release?.downloads.macos ?? RELEASES_PAGE,
        installUrl: RELEASES_PAGE,
        screenshot: {
          "@type": "ImageObject",
          url: absoluteUrl(OG_IMAGE_PATH[dict.locale]),
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
        },
        featureList: dict.features.items.map((item) => item.title),
        offers: {
          "@type": "Offer",
          price: FREE_PRICE,
          priceCurrency: PRICE_CURRENCY,
          availability: IN_STOCK,
        },
        publisher: { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        inLanguage: language,
        mainEntity: dict.faq.items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}
