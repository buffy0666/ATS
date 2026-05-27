"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAssistant } from "./AssistantProvider";
import { AssistantChat } from "./AssistantChat";

const PANEL_WIDTH = 420;

export function AssistantPanel() {
  const { open, setOpen } = useAssistant();
  // Floating position. Null until first opened — then seeded near the
  // top-right and freely draggable anywhere on the page.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (open && pos === null && typeof window !== "undefined") {
      setPos({ x: Math.max(8, window.innerWidth - PANEL_WIDTH - 24), y: 24 });
    }
  }, [open, pos]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      const origin = pos ?? { x: 0, y: 0 };
      dragOffset.current = { dx: e.clientX - origin.x, dy: e.clientY - origin.y };

      function move(ev: PointerEvent) {
        if (!dragOffset.current) return;
        const nx = ev.clientX - dragOffset.current.dx;
        const ny = ev.clientY - dragOffset.current.dy;
        // Keep at least a sliver on-screen so the panel can't be lost.
        const maxX = window.innerWidth - 80;
        const maxY = window.innerHeight - 60;
        setPos({
          x: Math.min(Math.max(8 - PANEL_WIDTH + 80, nx), maxX),
          y: Math.min(Math.max(0, ny), maxY),
        });
      }
      function up() {
        dragOffset.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [pos],
  );

  if (!open) return null;

  const positioned = pos !== null;

  return (
    <aside
      role="dialog"
      aria-label="Assistant"
      style={positioned ? { left: pos!.x, top: pos!.y } : undefined}
      className={`fixed z-50 flex h-[600px] max-h-[calc(100vh-2rem)] w-[420px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 ${
        positioned ? "" : "right-4 top-4"
      }`}
    >
      <div
        onPointerDown={startDrag}
        className="flex cursor-grab touch-none select-none items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 active:cursor-grabbing dark:border-zinc-800"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <span aria-hidden="true">🐻</span>
          Assistant
          <span className="normal-case text-[10px] font-normal text-zinc-400">· drag to move</span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/assistant"
            onClick={() => setOpen(false)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            title="Open in full screen"
          >
            ⤢
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close assistant"
            className="rounded-md border border-zinc-300 px-2 py-1 text-[11px] hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ×
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <AssistantChat mode="panel" />
      </div>
    </aside>
  );
}
