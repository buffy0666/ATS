"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pins the tabbed Email / Call-SMS-LI / Resume panel to the top of the
 * viewport so it stays visible no matter how far the user scrolls — not
 * just within its grid column the way `position: sticky` would.
 *
 * How it works:
 *   1. A spacer sits in the normal column flow, reserving (100vh − 2rem)
 *      of vertical space and matching the column's width.
 *   2. The actual panel is `position: fixed` and mirrors the spacer's
 *      bounding rect (left + width) so it visually sits exactly where the
 *      spacer is — but stays put when the page scrolls.
 *   3. A ResizeObserver on the spacer keeps width/left in sync with the
 *      column when the window resizes or the sidebar collapses. No scroll
 *      listener is needed — left/width don't change on scroll.
 *
 * The panel is `visibility: hidden` until the first measurement so it
 * doesn't flash at left:0 before the layout has settled.
 */
export function FloatingResumeSection({
  children,
}: {
  children: React.ReactNode;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      // window.scrollY shouldn't affect left/width but Safari sometimes
      // reports stale rects when called before layout flush — measure on
      // requestAnimationFrame to be safe.
      requestAnimationFrame(() => setGeom({ left: r.left, width: r.width }));
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Window resize covers sidebar collapse/expand (which reflows the
    // grid columns and changes the spacer's left/width).
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      {/* Spacer: occupies the column slot so metadata sections below
          don't shift under where the floating panel sits. */}
      <div
        ref={slotRef}
        aria-hidden
        style={{ height: "calc(100vh - 2rem)" }}
      />

      {/* The floating panel itself. */}
      <div
        className="flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm"
        style={{
          position: "fixed",
          top: "1rem",
          left: geom?.left ?? 0,
          width: geom?.width ?? 0,
          maxHeight: "calc(100vh - 2rem)",
          zIndex: 30,
          visibility: geom ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </>
  );
}
