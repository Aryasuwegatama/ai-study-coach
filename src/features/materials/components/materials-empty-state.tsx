import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Figma node 47:18192, "Materials Library, empty". */
export function MaterialsEmptyState({ onUpload, disabled }: { onUpload: () => void; disabled: boolean }) {
  return (
    <Card className="rounded-[20px] p-8">
      <CardContent className="flex flex-col items-center gap-4 p-0 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-soft-purple text-purple">
          <UploadCloud className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-foreground">No materials yet</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Upload a PDF, PPTX or TXT to start generating quizzes and flashcards from this space.
          </p>
        </div>
        <Button type="button" className="rounded-full" onClick={onUpload} disabled={disabled} aria-disabled={disabled}>
          Upload material
        </Button>
      </CardContent>
    </Card>
  );
}
