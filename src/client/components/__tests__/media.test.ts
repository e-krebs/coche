import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMediaQuery, useWide } from "client/components/media";

/**
 * Installs a real MediaQueryList-shaped object so the hook's own subscribe/unsubscribe path runs —
 * platform state set inside setup, like `navigator.onLine` elsewhere. `absent` is the case that
 * matters most: jsdom ships no `matchMedia` at all, which is why every media-gated branch in the
 * app is unreachable here and lives in the e2e tier instead.
 */
const usePrecise = () => useMediaQuery("(pointer: fine)");

const setup = ({
  matches = false,
  absent = false,
  hook = usePrecise,
}: { matches?: boolean; absent?: boolean; hook?: () => boolean } = {}) => {
  const listeners = new Set<() => void>();
  let current = matches;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: absent
      ? undefined
      : (media: string) => ({
          media,
          // A live getter, not a snapshot: the hook re-reads `mq.matches` from the object it
          // captured when a change fires.
          get matches() {
            return current;
          },
          addEventListener: (_: string, fn: () => void) => listeners.add(fn),
          removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        }),
  });

  const { result, unmount } = renderHook(hook);
  return {
    result,
    unmount,
    listenerCount: () => listeners.size,
    change: (next: boolean) => {
      current = next;
      act(() => {
        listeners.forEach((fn) => {
          fn();
        });
      });
    },
  };
};

describe("useMediaQuery", () => {
  it("reports what the query says and follows it when it changes", () => {
    const { result, change } = setup({ matches: true });
    expect(result.current).toBe(true);
    change(false);
    expect(result.current).toBe(false);
  });

  it("treats a missing matchMedia as no match, rather than throwing", () => {
    const { result } = setup({ absent: true });
    expect(result.current).toBe(false);
  });

  it("stops listening when it unmounts", () => {
    const { unmount, listenerCount } = setup();
    expect(listenerCount()).toBe(1);
    unmount();
    expect(listenerCount()).toBe(0);
  });
});

/**
 * The same three properties for the width the sidebar depends on, plus the marker and the deferred
 * commit — the sidebar still answering wide while it slides out, which no viewport the unit tier can
 * change would reveal. Note the fixture's `matchMedia` matches every query, so the hook's
 * reduced-motion read tracks the same flag: an arrival here defers by nothing, and a departure by the
 * full slide.
 */
describe("useWide", () => {
  const wide = { hook: useWide };

  // Losing the width is the one answer that does not land at once: the sidebar is still mounted
  // while it slides out, so the commit that unmounts it waits for the slide to finish.
  it("reports what the query says and follows it when it changes", async () => {
    const { result, change } = setup({ ...wide, matches: true });
    expect(result.current).toBe(true);
    change(false);
    expect(result.current).toBe(true);
    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("treats a missing matchMedia as no match, rather than throwing", () => {
    const { result } = setup({ ...wide, absent: true });
    expect(result.current).toBe(false);
  });

  it("stops listening when it unmounts", () => {
    const { unmount, listenerCount } = setup(wide);
    expect(listenerCount()).toBe(1);
    unmount();
    expect(listenerCount()).toBe(0);
  });

  it("marks each crossing on the root element, by direction, for the CSS to key on", async () => {
    const { change } = setup(wide);
    change(true);
    expect(document.documentElement.getAttribute("data-crossing")).toBe("in");
    change(false);
    expect(document.documentElement.getAttribute("data-crossing")).toBe("out");
    await waitFor(() => {
      expect(document.documentElement.hasAttribute("data-crossing")).toBe(false);
    });
  });
});
