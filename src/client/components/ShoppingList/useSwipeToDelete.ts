import { type CSSProperties, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./helpers";

const SWIPE_THRESHOLD = 1 / 3; // fraction of row width to pass before a release deletes

/**
 * Manual listeners so touchmove is non-passive: preventDefault only once the swipe locks
 * horizontal, leaving scroll and dnd-kit's drag intact (touch-action:pan-y would break the drag).
 */
export const useSwipeToDelete = ({
  onDelete,
  enabled,
  syncing = false,
}: {
  onDelete: () => void;
  enabled: boolean;
  syncing?: boolean;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dx, setDx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [reached, setReached] = useState(false); // past the delete threshold
  const [releasing, setReleasing] = useState(false); // keep the pill mounted through spring-back
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  // Read at gesture start (not an effect dep) so syncing blocks a new swipe without cancelling one
  // in progress.
  const syncingRef = useRef(syncing);
  syncingRef.current = syncing;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    let x = 0;
    let y = 0;
    let axis: "h" | "v" | null = null;
    let cur = 0;
    let width = 0;
    let reachedNow = false;
    let touchId: number | null = null;
    let releaseTimer: number | undefined;
    let commitTimer: number | undefined;

    const springBack = () => {
      setSwiping(false);
      setDx(0);
      setReached(false);
      setReleasing(true);
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        setReleasing(false);
      }, 300);
    };
    const clear = () => {
      touchId = null;
      axis = null;
      cur = 0;
      reachedNow = false;
    };
    const cancel = () => {
      if (axis === "h") springBack();
      clear();
    };
    const ourTouch = (list: TouchList) => {
      for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId) return list[i];
      return null;
    };

    const onStart = (e: TouchEvent) => {
      // a second finger makes the gesture ambiguous — abandon the swipe
      if (touchId !== null || e.touches.length > 1) {
        cancel();
        return;
      }
      // don't begin a swipe mid-sync (in-progress ones still finish)
      if (syncingRef.current) return;
      const t = e.changedTouches[0];
      touchId = t.identifier;
      x = t.clientX;
      y = t.clientY;
      axis = null;
      cur = 0;
      width = el.offsetWidth;
      reachedNow = false;
      setReached(false);
    };
    const onMove = (e: TouchEvent) => {
      const t = ourTouch(e.touches);
      if (!t) return;
      const ddx = t.clientX - x;
      const ddy = t.clientY - y;
      if (axis === null) {
        if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
        axis = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
        if (axis === "h") setSwiping(true);
      }
      if (axis === "h") {
        e.preventDefault();
        cur = Math.min(0, ddx);
        const past = cur <= -width * SWIPE_THRESHOLD;
        if (past !== reachedNow) {
          reachedNow = past;
          setReached(past);
          // tactile tick as it crosses the commit point
          if (past && typeof navigator.vibrate === "function") navigator.vibrate(15);
        }
        setDx(cur);
      }
    };
    // On window not el: multi-touch can drop the row's own end event. Only a real lift commits; a
    // system touchcancel (back-swipe, shade, app switch) aborts — don't delete on an interrupted
    // gesture.
    const finish = ({ e, commit }: { e: TouchEvent; commit: boolean }) => {
      if (touchId === null || !ourTouch(e.changedTouches)) return;
      if (commit && axis === "h" && cur <= -width * SWIPE_THRESHOLD) {
        setSwiping(false);
        setDx(-width); // finish sliding the row off, then remove it (list closes via the VT)
        commitTimer = window.setTimeout(() => {
          onDeleteRef.current();
        }, 200);
        clear();
        return;
      }
      if (axis === "h") springBack();
      clear();
    };
    const onEnd = (e: TouchEvent) => {
      finish({ e, commit: true });
    };
    const onCancel = (e: TouchEvent) => {
      finish({ e, commit: false });
    };
    const onOtherStart = (e: TouchEvent) => {
      if (touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++)
        if (e.changedTouches[i].identifier !== touchId) {
          cancel();
          return;
        }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchstart", onOtherStart, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchstart", onOtherStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
      // Drop pending timers so a committed delete can't fire against a stale store after an unmount
      // (account switch remounts via key={userId}).
      window.clearTimeout(releaseTimer);
      window.clearTimeout(commitTimer);
      setDx(0);
      setSwiping(false);
      setReached(false);
      setReleasing(false);
    };
  }, [enabled]);

  const style: CSSProperties = {
    transform: dx ? `translateX(${dx}px)` : undefined,
    transition:
      swiping || prefersReducedMotion()
        ? undefined
        : "transform 0.3s cubic-bezier(0.34, 1.15, 0.64, 1)",
  };
  return { ref, style, dx, swiping, reached, releasing };
};
