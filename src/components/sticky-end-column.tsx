"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/class-names";

/**
 * One column of a two-column page (from `lg`) that stays in view while the
 * other column keeps scrolling. It scrolls with the page until its own end is
 * in view, then stays pinned there, or near the top when it's shorter than
 * the window. Put it on both columns: the taller one fills its grid row, so it
 * has no room to stick and scrolls normally; only the shorter one pins. The
 * grid needs `items-start` so the shorter column keeps its own height.
 *
 * CSS can't read an element's own height, so a ResizeObserver keeps
 * `--sticky-height` up to date; without it the column simply sticks at the top.
 */
export function StickyEndColumn({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      element.style.setProperty("--sticky-height", `${element.offsetHeight}px`);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("min-w-0 lg:sticky lg:top-[min(1.5rem,calc(100vh_-_var(--sticky-height,0px)_-_1.5rem))]", className)}
    >
      {children}
    </div>
  );
}
