import { describe, expect, it } from "vitest";
import { dictionary } from "@/i18n";
import { LOCALES } from "@/i18n/types";
import { PLATFORM_MIN_VERSIONS, PLATFORMS, SUPPORTED_PLATFORMS_LABEL } from "./platform";

// detectPlatform, otherPlatform and PLATFORM_REQUIREMENTS are tested in
// @harpyhare/platform, where they now live; what is left here is landing copy.
describe("platform copy", () => {
  it("names both platforms in the shared label", () => {
    expect(SUPPORTED_PLATFORMS_LABEL).toBe("macOS и Windows");
  });

  // The FAQ answer spells the same versions out in prose, in both languages —
  // the second copy of what PLATFORM_MIN_VERSIONS holds.
  it("the FAQ requirements answer names the supported OS versions", () => {
    for (const locale of LOCALES) {
      const answers = dictionary(locale)
        .faq.items.map((item) => item.answer)
        .join("\n");
      for (const platform of PLATFORMS) {
        expect(answers).toContain(PLATFORM_MIN_VERSIONS[platform]);
      }
    }
  });
});
