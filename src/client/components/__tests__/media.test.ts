import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMediaQuery } from "client/components/media";

/**
 * Installs a real MediaQueryList-shaped object so the hook's own subscribe/unsubscribe path runs —
 * platform state set inside setup, like `navigator.onLine` elsewhere. `absent` is the case that
 * matters most: jsdom ships no `matchMedia` at all, which is why every media-gated branch in the
 * app is unreachable here and lives in the e2e tier instead.
 */
const setup = ({
  matches = false,
  absent = false,
}: { matches?: boolean; absent?: boolean } = {}) => {
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

  const { result, unmount } = renderHook(() => useMediaQuery("(pointer: fine)"));
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
