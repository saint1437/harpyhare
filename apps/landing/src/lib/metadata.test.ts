import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/types";
import { pageMetadata } from "./metadata";
import { SITE_URL } from "./site";

/**
 * The whole SEO surface is generated, never hand-written, so nothing here fails
 * loudly when it breaks: a lost canonical or a dropped hreflang shows up weeks
 * later as a traffic dip. The snapshot is the alarm; the assertions above it name
 * the invariants worth reading in a diff.
 */
describe("pageMetadata", () => {
  it.each(LOCALES)("%s: canonical points at that locale's own URL", (locale) => {
    const canonical = pageMetadata(locale).alternates?.canonical;
    expect(canonical).toBe(locale === "ru" ? `${SITE_URL}/` : `${SITE_URL}/en`);
  });

  it.each(LOCALES)("%s: hreflang covers every locale plus x-default", (locale) => {
    const languages = pageMetadata(locale).alternates?.languages ?? {};
    expect(Object.keys(languages).sort()).toEqual(["en", "ru", "x-default"]);
    // x-default must land on the default locale, not on whichever page rendered it.
    expect(languages["x-default"]).toBe(`${SITE_URL}/`);
  });

  it.each(LOCALES)("%s: Open Graph and the Twitter card share one image", (locale) => {
    const meta = pageMetadata(locale);
    const ogImages = meta.openGraph?.images;
    expect(ogImages).toEqual(meta.twitter?.images);
    // .jpg, not .svg: neither Twitter nor Facebook renders SVG previews.
    expect(JSON.stringify(ogImages)).toContain(locale === "ru" ? "/og.jpg" : "/og-en.jpg");
  });

  it("uses a different OG locale per language", () => {
    expect(pageMetadata("ru").openGraph?.locale).toBe("ru_RU");
    expect(pageMetadata("en").openGraph?.locale).toBe("en_US");
  });

  it("stays indexable", () => {
    for (const locale of LOCALES) {
      const robots = pageMetadata(locale).robots;
      expect(robots).toMatchObject({ index: true, follow: true });
    }
  });

  it.each(LOCALES)("%s: full metadata snapshot", (locale) => {
    expect(pageMetadata(locale)).toMatchSnapshot();
  });
});
