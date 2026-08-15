import { describe, expect, it } from "vitest";
import { detectLocale, translate } from "client/i18n";
import { en, fr } from "client/i18n/messages";

describe("translate", () => {
  it("interpolates named vars", () => {
    expect(translate({ locale: "en", key: "mark", vars: { name: "Milk" } })).toBe("Check off Milk");
    expect(translate({ locale: "fr", key: "mark", vars: { name: "Lait" } })).toBe("Cocher Lait");
    expect(translate({ locale: "en", key: "checked", vars: { count: 3 } })).toBe("Checked (3)");
  });

  it("selects the plural form by count and locale", () => {
    expect(translate({ locale: "fr", key: "checked", vars: { count: 1 } })).toBe("Coché (1)");
    expect(translate({ locale: "fr", key: "checked", vars: { count: 2 } })).toBe("Cochés (2)");
    expect(translate({ locale: "en", key: "checked", vars: { count: 1 } })).toBe("Checked (1)");
  });
});

describe("messages", () => {
  it("fr defines exactly the en key set", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });
});

describe("detectLocale", () => {
  describe("when the browser locale is not French", () => {
    it("falls back to en", () => {
      expect(detectLocale()).toBe("en"); // jsdom navigator.language is en-US
    });
  });
});
