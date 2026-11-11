import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { SpaceResponse } from "../spaces-schemas";
import { SpaceMonogram } from "./space-monogram";

/**
 * The "My Study Spaces" grid (Figma node 80:6946 / 37:2896), shared by the
 * Dashboard and `/spaces` (plan step 7: "move the grid into
 * spaces-card-grid.tsx and render it from the dashboard page"). The
 * materials/topics/accuracy numbers Figma shows don't exist yet (T-09,
 * T-14), so every card shows the same true line instead of inventing
 * them.
 */
export function SpacesCardGrid({ spaces }: { spaces: SpaceResponse[] }) {
  if (spaces.length === 0) {
    return (
      <p className="rounded-[20px] border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        No study spaces yet. Create one to start uploading materials.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {spaces.map((space) => (
        <Card key={space.id} className="gap-4 rounded-[20px] p-6">
          <CardContent className="flex items-center gap-3 p-0">
            <SpaceMonogram id={space.id} name={space.name} className="size-9 text-base" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base font-semibold text-foreground">{space.name}</span>
              <span className="text-xs text-muted-foreground">Personal Study Space · Private to you</span>
            </div>
          </CardContent>
          <CardContent className="p-0">
            <Link
              href={`/spaces/${space.id}/overview`}
              className="flex w-full items-center justify-between text-sm font-medium text-primary hover:underline"
            >
              Open study space
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
