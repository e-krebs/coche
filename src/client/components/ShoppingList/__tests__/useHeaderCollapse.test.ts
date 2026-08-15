import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHeaderCollapse } from "client/components/ShoppingList/useHeaderCollapse";

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
    const { result } = renderHook(() => useHeaderCollapse(1));
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

  it("persists the scroll offset to sessionStorage", () => {
    renderHook(() => useHeaderCollapse(1));
    scrollTo(123);
    expect(sessionStorage.getItem("shopping:scrollY")).toBe("123");
  });
});
