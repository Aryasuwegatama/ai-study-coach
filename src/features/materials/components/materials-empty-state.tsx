import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** The Materials page for a space with no files yet (`.empty` in the redesign prototype). */
export function MaterialsEmptyState({ onUpload, disabled }: { onUpload: () => void; disabled: boolean }) {
  return (
    <Card className="items-center gap-4 px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
        <Upload className="size-5" aria-hidden="true" />
      </span>
      <h3 className="text-card-title text-foreground">Your space is ready for its first file</h3>
      <p className="max-w-[42rem] text-muted-foreground">
        Upload lecture notes, slides or a text file. We&apos;ll suggest topics for you to confirm.
      </p>
      <Button type="button" onClick={onUpload} disabled={disabled} aria-disabled={disabled}>
        Upload material
      </Button>
    </Card>
  );
}
