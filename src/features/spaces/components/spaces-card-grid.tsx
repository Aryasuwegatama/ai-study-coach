import type { SpaceSummary } from "../spaces-schemas";
import { SpaceSummaryCard } from "./space-summary-card";

/**
 * The Study Space cards, shared by the Dashboard (one column, h3 titles)
 * and `/spaces` (two columns from `sm`, h2 titles). Each empty state is
 * the caller's, because the two pages say different things.
 */
export function SpacesCardGrid({
  spaces,
  layout = "grid",
}: {
  spaces: SpaceSummary[];
  layout?: "grid" | "list";
}) {
  return (
    <div className={layout === "grid" ? "grid grid-cols-1 gap-6 sm:grid-cols-2" : "flex flex-col gap-4"}>
      {spaces.map((space) => (
        <SpaceSummaryCard key={space.id} space={space} headingLevel={layout === "grid" ? "h2" : "h3"} />
      ))}
    </div>
  );
}
