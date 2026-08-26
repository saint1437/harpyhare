import { describe, expect, it } from "vitest";
import { dictionary } from "@/i18n";
import { LOCALES, type Locale } from "@/i18n/types";
import { RELEASES_PAGE, type ReleaseInfo } from "./release";
import { SITE_URL } from "./site";
import { structuredData } from "./structured-data";

const RELEASE: ReleaseInfo = {
  version: "0.12.0",
  downloads: {
    macos: "https://example.test/AudioSystem_0.12.0_aarch64.dmg",
    windows: "https://example.test/AudioSystem_0.12.0_x86_64-setup.exe",
  },
};

interface GraphNode {
  "@type": string;
  "@id"?: string;
  [key: string]: unknown;
}

function graph(locale: Locale, release: ReleaseInfo | null): GraphNode[] {
  const data = structuredData(dictionary(locale), release) as { "@graph": GraphNode[] };
  return data["@graph"];
}

function node(locale: Locale, type: string, release: ReleaseInfo | null = RELEASE): GraphNode {
  const found = graph(locale, release).find((entry) => entry["@type"] === type);
  if (!found) throw new Error(`нет узла ${type}`);
  return found;
}

describe("structuredData", () => {
  it.each(LOCALES)("%s: the graph holds every node Google reads here", (locale) => {
    expect(graph(locale, RELEASE).map((entry) => entry["@type"])).toEqual([
      "Organization",
      "WebSite",
      "WebPage",
      "SoftwareApplication",
      "FAQPage",
    ]);
  });

  it.each(LOCALES)("%s: every @id is absolute and rooted at the site URL", (locale) => {
    for (const entry of graph(locale, RELEASE)) {
      const id = entry["@id"];
      expect(id).toBeTypeOf("string");
      expect(id).toContain(SITE_URL);
    }
  });

  it.each(LOCALES)("%s: the FAQ markup repeats the visible questions verbatim", (locale) => {
    const dict = dictionary(locale);
    const faq = node(locale, "FAQPage") as unknown as { mainEntity: { name: string }[] };
    expect(faq.mainEntity.map((q) => q.name)).toEqual(dict.faq.items.map((item) => item.question));
  });

  it("carries the live version and download link when a release is known", () => {
    const app = node("ru", "SoftwareApplication");
    expect(app["softwareVersion"]).toBe("0.12.0");
    expect(app["downloadUrl"]).toBe(RELEASE.downloads.macos);
  });

  it("falls back to the releases page when the release could not be fetched", () => {
    const app = node("ru", "SoftwareApplication", null);
    expect(app["softwareVersion"]).toBeUndefined();
    expect(app["downloadUrl"]).toBe(RELEASES_PAGE);
  });

  it.each(LOCALES)("%s: inLanguage follows the locale", (locale) => {
    expect(node(locale, "WebSite")["inLanguage"]).toBe(locale);
    expect(node(locale, "WebPage")["inLanguage"]).toBe(locale);
  });

  it.each(LOCALES)("%s: full JSON-LD snapshot", (locale) => {
    expect(structuredData(dictionary(locale), RELEASE)).toMatchSnapshot();
  });
});
