import { SpaceOverviewActions } from "./space-overview-actions";

/**
 * The Study Space header (name, "Personal Study Space · Private to you",
 * the "⋯" rename and delete menu), shared between Overview and Materials
 * (T-09a plan step 2) so both pages render the identical header rather
 * than two copies that could drift apart.
 */
export function SpaceHeader({ spaceId, name }: { spaceId: string; name: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">{name}</h1>
        <p className="text-sm text-muted-foreground">Personal Study Space · Private to you</p>
      </div>
      <SpaceOverviewActions spaceId={spaceId} name={name} />
    </div>
  );
}
