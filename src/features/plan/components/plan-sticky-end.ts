"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keeps `--sticky-height` on the element equal to its own height, for the
 * "sticky end" rule `top: min(1.5rem, 100vh - var(--sticky-height) - 1.5rem)`:
 * the element scrolls with the page until its end is in view, then stays
 * pinned there (or near the top when it's shorter than the window). CSS can't
 * read an element's own height, so this measures it. Without it the element
 * simply sticks at the top.
 */
export function usePlanStickyEnd(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      element.style.setProperty("--sticky-height", `${element.offsetHeight}px`);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}
