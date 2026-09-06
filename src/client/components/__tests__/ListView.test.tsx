import { describe, expect, it } from "vitest";
import { nextPanelMode } from "client/components/ListView";

/**
 * The rule that keeps one lists panel on screen. Only the rule: mounting `ListView` reaches Clerk's
 * `useUser`, which throws outside a provider, so the wiring it feeds — which wrapper the panel gets,
 * and what turns `inert` — is asserted in the e2e tier instead
 * ([docs/reference/testing.md](../../../../docs/reference/testing.md)).
 */
describe("nextPanelMode", () => {
  // Below the sidebar's width the sheet is the only home the lists have, so every mode stands.
  it("leaves every mode alone while the sheet is their only home", () => {
    expect(nextPanelMode({ mode: "closed", wide: false })).toBe("closed");
    expect(nextPanelMode({ mode: "pick", wide: false })).toBe("pick");
    expect(nextPanelMode({ mode: "edit", wide: false })).toBe("edit");
  });

  // The bug this rule exists for: widen with the pick sheet open and the arriving sidebar would be
  // a second copy of the roster, under a modal showing the same rows.
  it("drops the pick sheet once the sidebar can do its job", () => {
    expect(nextPanelMode({ mode: "pick", wide: true })).toBe("closed");
  });

  // Nothing beside the list creates, renames, reorders or deletes, so the editor is not a duplicate
  // of anything — it rides the crossing rather than being dismissed mid-edit.
  it("keeps edit mode across the crossing", () => {
    expect(nextPanelMode({ mode: "edit", wide: true })).toBe("edit");
  });

  // Idempotent, which is what makes it safe to apply during render: React re-runs the component
  // until the state settles, and StrictMode runs that twice.
  it("settles in one pass", () => {
    const once = nextPanelMode({ mode: "pick", wide: true });
    expect(nextPanelMode({ mode: once, wide: true })).toBe(once);
  });
});
