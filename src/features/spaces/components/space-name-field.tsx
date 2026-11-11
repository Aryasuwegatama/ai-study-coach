"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/class-names";

/**
 * The name field shared by the create and rename dialogs (plan: "Rename
 * reuses the Create dialog's layout"). Figma's name error is amber, not
 * red (`--amber`, not `--destructive`) — the server's validation message
 * (`spaceNameSchema` in spaces-schemas.ts) is shown verbatim, so the
 * wording here always matches what `pnpm check:spaces` asserts on.
 */
export function SpaceNameField({
  id,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>Study space name</Label>
        <span className="text-xs font-medium text-muted-foreground">Required</span>
      </div>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={!!error}
        className={cn(
          error &&
            "border-amber text-foreground focus-visible:border-amber focus-visible:ring-amber/20",
        )}
      />
      <p className={cn("text-xs", error ? "font-medium text-amber" : "text-muted-foreground")}>
        {error ?? "This space and the materials you upload are private to you."}
      </p>
    </div>
  );
}
