"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/class-names";

/**
 * The name field shared by the create and rename dialogs (plan: "Rename
 * reuses the Create dialog's layout"). The error shows as red text under
 * the field, and the input's own invalid state draws the 2px red border.
 * The server's validation message (`spaceNameSchema` in spaces-schemas.ts)
 * is shown verbatim, so the wording here always matches what
 * `pnpm check:spaces` asserts on.
 */
export function SpaceNameField({
  id,
  value,
  onChange,
  error,
  disabled,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-semibold">Study space name</Label>
        <span className="text-sm text-muted-foreground">Required</span>
      </div>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-required="true"
        aria-invalid={!!error}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className={cn("text-sm", error ? "text-destructive" : "text-muted-foreground")}>
        {error ?? "This space and the materials you upload are private to you."}
      </p>
    </div>
  );
}
