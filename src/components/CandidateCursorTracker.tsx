"use client";

import { useEffect, useRef } from "react";
import { writeCursor } from "@/lib/candidate-cursor";

/**
 * Drop this into any view that renders a list of candidate links. On mount
 * (and whenever the IDs change) it writes the ordered IDs to localStorage so
 * the candidate detail page can render Prev/Next buttons that walk the same
 * ordering.
 *
 * Renders nothing — purely a side-effect component.
 */
export function CandidateCursorTracker({
  ids,
  originHref,
  originLabel,
}: {
  ids: string[];
  originHref: string;
  originLabel: string;
}) {
  // Avoid re-writing on every render when the parent re-renders for unrelated
  // state changes — only re-write when the ID list or origin actually changes.
  const signature = `${originHref}|${ids.join(",")}`;
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastWrittenRef.current === signature) return;
    lastWrittenRef.current = signature;
    writeCursor({ ids, origin: { href: originHref, label: originLabel } });
  }, [signature, ids, originHref, originLabel]);

  return null;
}
