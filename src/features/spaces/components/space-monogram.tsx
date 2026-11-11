import { cn } from "@/lib/class-names";

const TONE_CLASSES = {
  blue: "bg-secondary text-primary",
  purple: "bg-soft-purple text-purple",
  green: "bg-soft-green text-green",
} as const;

const TONES = Object.keys(TONE_CLASSES) as (keyof typeof TONE_CLASSES)[];

/**
 * Deterministic from the space ID, not random (plan: "stays the same
 * across visits"), and not from the name — a rename must not change the
 * colour a student already associates with a space.
 */
function toneForId(id: string): keyof typeof TONE_CLASSES {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return TONES[hash % TONES.length];
}

/**
 * The coloured initial monogram shown on space cards, the sidebar list
 * and the sidebar flyout (Figma node 80:6946 and 27:720). Sizing and
 * text size are the caller's responsibility via `className`, since the
 * three call sites each need a different size.
 */
export function SpaceMonogram({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const tone = toneForId(id);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
