import { describe, expect, it } from "vitest";
import { dictionary } from "@/i18n";
import { LOCALES } from "@/i18n/types";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import manifest from "./manifest";
import robots from "./robots";
import sitemap from "./sitemap";

/**
 * Three generated routes, one shared domain. Moving to another domain is meant to
 * be a one-line change in `lib/site.ts`, which only holds while nothing here
 * hardcodes a URL of its own — that is most of what these tests watch.
 */
describe("sitemap", () => {
  const entries = sitemap();

  it("lists every locale exactly once", () => {
    expect(entries.map((entry) => entry.url)).toEqual([`${SITE_URL}/`, `${SITE_URL}/en`]);
  });

  it("ranks the default locale above the translation", () => {
    const [ru, en] = entries;
    expect(ru?.priority).toBe(1);
    expect(en?.priority).toBe(0.8);
  });

  it("gives both entries the same hreflang map", () => {
    for (const entry of entries) {
      expect(entry.alternates?.languages).toEqual({
        ru: `${SITE_URL}/`,
        en: `${SITE_URL}/en`,
      });
      expect(entry.changeFrequency).toBe("weekly");
    }
  });
});

describe("robots", () => {
  const rules = robots();

  it("lets every crawler in", () => {
    expect(rules.rules).toEqual([{ userAgent: "*", allow: "/" }]);
  });

  it("points at the sitemap on the same domain", () => {
    expect(rules.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(rules.host).toBe(SITE_URL);
  });
});

describe("manifest", () => {
  const web = manifest();

  it("describes the site in the default locale", () => {
    const dict = dictionary(LOCALES[0]);
    expect(web.name).toBe(dict.meta.title);
    expect(web.description).toBe(dict.meta.description);
    expect(web.short_name).toBe(SITE_NAME);
    expect(web.lang).toBe("ru");
  });

  it("ships an icon in both a scalable and a raster form", () => {
    expect(web.icons).toEqual([
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
    ]);
  });

  it("stays a plain site rather than announcing itself as an installable app", () => {
    expect(web.display).toBe("browser");
    expect(web.start_url).toBe("/");
  });
});
