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
  const panelRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<{ left: number; width: number } | null>(null);
  // Height the spacer should reserve so the Profile card below starts flush
  // at the floating panel's visual bottom. Because the panel is fixed (pinned
  // near the viewport top) while the spacer sits lower in normal flow, we
  // can't just mirror the panel's own height — we align the spacer's BOTTOM
  // to the panel's bottom. Computed scroll-independently in the effect.
  const [spacerH, setSpacerH] = useState<number | null>(null);
  // Height of the impersonation banner (sticky at the very top of the page,
  // z-50, ~36px). 0 when not impersonating. We measure it so the floating
  // panel sits BELOW it instead of being covered by it.
  const [bannerH, setBannerH] = useState(0);
  // Viewport-relative bottom of the page header (name / tags / navigator).
  // While the header is on screen the panel starts below it instead of
  // covering it; once the user scrolls past, this goes ≤ 0 and the panel
  // pins to the viewport top as before.
  const [headerBottom, setHeaderBottom] = useState(0);

  useEffect(() => {
    const headerEl = document.querySelector<HTMLElement>("[data-candidate-header]");
    if (!headerEl) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      setHeaderBottom(headerEl.getBoundingClientRect().bottom);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const headerRo = new ResizeObserver(schedule);
    headerRo.observe(headerEl);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      headerRo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;

    const banner = document.querySelector<HTMLElement>(
      "[data-impersonation-banner]",
    );

    const update = () => {
      const r = el.getBoundingClientRect();
      const bh = banner ? banner.getBoundingClientRect().height : 0;
      // Align the spacer's bottom with where the panel's bottom sits when the
      // page is scrolled to the TOP (that's when overlap matters — once the
      // user scrolls, content sliding under the pinned panel is intended).
      // All terms in document coordinates, so the result is scroll-independent:
      //   panelTopAtRest  = max(banner + 16, headerDocBottom + 12)
      //   panelBottomDoc  = panelTopAtRest + panelHeight
      //   spacerDocTop    = r.top + scrollY
      const headerEl = document.querySelector<HTMLElement>("[data-candidate-header]");
      const headerDocBottom = headerEl
        ? headerEl.getBoundingClientRect().bottom + window.scrollY
        : 0;
      const panelTopAtRest = Math.max(bh + 16, headerDocBottom + 12);
      const pRect = panelRef.current?.getBoundingClientRect();
      const nextSpacerH =
        pRect && r.width > 0
          ? Math.max(0, panelTopAtRest + pRect.height - (r.top + window.scrollY))
          : null;
      // window.scrollY shouldn't affect left/width but Safari sometimes
      // reports stale rects when called before layout flush — measure on
      // requestAnimationFrame to be safe.
      requestAnimationFrame(() => {
        setGeom({ left: r.left, width: r.width });
        setBannerH(bh);
        if (nextSpacerH != null) setSpacerH(nextSpacerH);
      });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Observe the panel too — switching tabs or loading content changes its
    // height, and the spacer must follow so the gap below stays correct.
    if (panelRef.current) ro.observe(panelRef.current);
    // Observe the banner too — its content can wrap on narrow screens and
    // grow taller, which would push the panel further down.
    if (banner) ro.observe(banner);

    // Window resize covers sidebar collapse/expand (which reflows the
    // grid columns and changes the spacer's left/width).
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Gap between banner bottom (or page top) and the top of the floating
  // panel. Matches the 1rem gap used elsewhere on the page. While the page
  // header is still in view, start below it instead of covering it.
  const topPx = Math.max(bannerH + 16, Math.ceil(headerBottom) + 12);

  // Upper bound on the panel height. The panel sizes to its content but
  // never grows past this — so a tall tab (e.g. an inline PDF) still leaves
  // ~40% of the screen below for the Profile card, while a short tab
  // (e.g. empty Email) renders compactly with no dead space. 60% of
  // viewport, capped at 560px.
  const panelMaxHeight = `min(60vh, calc(100vh - ${topPx + 16}px), 560px)`;

  return (
    <>
      {/* Spacer: occupies the column slot so metadata sections below don't
          shift under the fixed panel. Mirrors the panel's MEASURED height
          (not the max budget) so short tabs don't reserve a tall gap. Falls
          back to the max cap before the first measurement. */}
      <div
        ref={slotRef}
        aria-hidden
        style={{ height: spacerH != null ? `${spacerH}px` : panelMaxHeight }}
      />

      {/* The floating panel itself. No fixed height — it shrinks to content,
          capped by maxHeight; the inner scroll container handles overflow. */}
      <div
        ref={panelRef}
        className="flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm"
        style={{
          position: "fixed",
          top: `${topPx}px`,
          left: geom?.left ?? 0,
          width: geom?.width ?? 0,
          maxHeight: panelMaxHeight,
          zIndex: 30,
          visibility: geom ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </>
  );
}
