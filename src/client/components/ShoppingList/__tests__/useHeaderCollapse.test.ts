import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  restoreTargetFor,
  useHeaderCollapse,
} from "client/components/ShoppingList/useHeaderCollapse";

const setup = ({ listId = "list", itemsLength = 1 } = {}) =>
  renderHook(() => useHeaderCollapse({ listId, itemsLength }));

const setScrollY = (y: number) => {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
};

const scrollTo = (y: number) => {
  setScrollY(y);
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
};

describe("useHeaderCollapse", () => {
  it("collapses past the fold and holds with hysteresis", () => {
    setScrollY(0);
    const { result } = setup();
    expect(result.current).toBe(false);

    scrollTo(50); // past the 44px collapse threshold
    expect(result.current).toBe(true);

    scrollTo(20); // above the 8px re-show threshold — stays collapsed
    expect(result.current).toBe(true);

    scrollTo(5); // back under 8px — expands
    expect(result.current).toBe(false);

    scrollTo(30); // between 8 and 44 — hysteresis keeps it expanded
    expect(result.current).toBe(false);
  });

  // One global key would restore list B at list A's offset — the switch remounts this hook.
  it("persists the scroll offset under a per-list key", () => {
    setup({ listId: "garden" });
    scrollTo(123);
    expect(sessionStorage.getItem("shopping:scrollY:garden")).toBe("123");
    expect(sessionStorage.getItem("shopping:scrollY:list")).toBeNull();
  });
});

// The restore itself is latched once per page load, which is why the offset lookup is extracted:
// the pure half is testable, the latch is the untestable seam.
describe("restoreTargetFor", () => {
  it("reads this list's offset and ignores another's", () => {
    sessionStorage.setItem("shopping:scrollY:garden", "240");
    expect(restoreTargetFor({ listId: "garden" })).toBe(240);
    expect(restoreTargetFor({ listId: "list" })).toBe(0);
  });

  it("treats a missing or unparseable value as no restore", () => {
    sessionStorage.setItem("shopping:scrollY:list", "nonsense");
    expect(restoreTargetFor({ listId: "list" })).toBe(0);
    expect(restoreTargetFor({ listId: "gone" })).toBe(0);
  });
});
