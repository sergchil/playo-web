"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Google-Maps-style place panel.
 * - Mobile (<768px): bottom sheet with three snap heights (peek / half / full). Drag the handle
 *   area to resize; the content scrolls only at full height, and its scroll is contained so it
 *   never drags the page/header behind it.
 * - Desktop (≥768px): fixed left side panel under the header, map stays visible to the right.
 */
type Snap = "peek" | "half" | "full";
const SNAP_VH: Record<Snap, number> = { peek: 0.3, half: 0.55, full: 0.92 };

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export default function PlacePanel({
  open,
  top,
  onClose,
  children,
  resetKey,
}: {
  open: boolean;
  /** Header height in px; desktop panel starts below it. */
  top: number;
  onClose: () => void;
  children: ReactNode;
  /** Changes when a different venue is selected, to reset scroll + snap. */
  resetKey: string | null;
}) {
  const desktop = useIsDesktop();
  const [snap, setSnap] = useState<Snap>("half");
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startH: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSnap("half");
    scroller.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  if (!open) return null;

  if (desktop) {
    return (
      <aside
        className="fixed bottom-0 left-0 z-30 flex w-[400px] flex-col border-r border-line bg-white shadow-[4px_0_24px_rgba(0,0,0,0.08)]"
        style={{ top }}
        aria-label="Venue details"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="absolute right-3 top-3 z-20 grid size-9 cursor-pointer place-items-center rounded-full bg-white/90 text-ink shadow-card hover:bg-white"
        >
          <CloseIcon />
        </button>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </aside>
    );
  }

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const height = dragPx ?? Math.round(vh * SNAP_VH[snap]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, startH: height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const next = drag.current.startH + (drag.current.startY - e.clientY);
    setDragPx(Math.max(vh * 0.15, Math.min(vh * SNAP_VH.full, next)));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const h = dragPx ?? height;
    drag.current = null;
    setDragPx(null);
    // Dragged below peek → close; otherwise snap to nearest.
    if (h < vh * 0.2) return onClose();
    const nearest = (Object.keys(SNAP_VH) as Snap[]).reduce((a, b) =>
      Math.abs(vh * SNAP_VH[b] - h) < Math.abs(vh * SNAP_VH[a] - h) ? b : a,
    );
    setSnap(nearest);
  };

  return (
    <section
      className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] ${
        dragPx === null ? "transition-[height] duration-200 ease-out" : ""
      }`}
      style={{ height }}
      aria-label="Venue details"
    >
      {/* Drag handle zone: pointer drag resizes; tap cycles peek → half → full. */}
      <div
        className="relative shrink-0 cursor-grab touch-none select-none pb-1 pt-2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => setSnap((s) => (s === "peek" ? "half" : s === "half" ? "full" : "half"))}
      >
        <span className="mx-auto block h-1.5 w-10 rounded-full bg-chip-hover" />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close details"
          className="absolute right-2 top-1 grid size-9 cursor-pointer place-items-center rounded-full text-muted hover:bg-chip"
        >
          <CloseIcon />
        </button>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]"
        onScroll={(e) => {
          // Scrolling content at peek/half expands the sheet, like Google Maps.
          if (snap !== "full" && e.currentTarget.scrollTop > 8) setSnap("full");
        }}
      >
        {children}
      </div>
    </section>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
