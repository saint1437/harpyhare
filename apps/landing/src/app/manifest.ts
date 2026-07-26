import type { MetadataRoute } from "next";
import { dictionary } from "@/i18n";
import { LOCALE_HTML_LANG } from "@/i18n/types";
import { LOGO_PATH, SITE_NAME } from "@/lib/site";

const BACKGROUND_COLOR = "#000000";
const THEME_COLOR = "#000000";

export default function manifest(): MetadataRoute.Manifest {
  const dict = dictionary("ru");
  return {
    name: dict.meta.title,
    short_name: SITE_NAME,
    description: dict.meta.description,
    lang: LOCALE_HTML_LANG.ru,
    start_url: "/",
    display: "browser",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
      { src: LOGO_PATH, sizes: "512x512", type: "image/png" },
    ],
  };
}
