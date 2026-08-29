import { describe, expect, it } from "vitest";
import { dictionary } from "@/i18n";
import { LOCALES } from "@/i18n/types";
import { ERROR_COPY } from "./ErrorScreen";

// `ErrorScreen` is a Client Component and must not import the dictionary barrel
// (see the comment on ERROR_COPY). Its own copy of the three strings is only
// safe as long as something compares it with the dictionaries — this does.
describe("ERROR_COPY", () => {
  it("matches the dictionaries it was copied from", () => {
    for (const locale of LOCALES) {
      expect(ERROR_COPY[locale]).toEqual(dictionary(locale).error);
    }
  });
});
