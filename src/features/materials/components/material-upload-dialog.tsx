"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  ACCEPTED_FILE_TYPES,
  MATERIAL_API_ERRORS,
  parseCreateMaterialRequest,
  type MaterialApiErrorCode,
} from "../materials-schemas";
import { MaterialsClientError, type MaterialsClient } from "../client/materials-client";

const ACCEPT_ATTR = ACCEPTED_FILE_TYPES.flatMap((type) => [type.extension, type.mimeType]).join(",");

/** Issue #25, "Validation copy": the Figma heading, with the contract's message under it. */
const VALIDATION_HEADINGS: Partial<Record<MaterialApiErrorCode, string>> = {
  UNSUPPORTED_FILE_TYPE: "Unsupported format",
  FILE_TOO_LARGE: "File too large",
};

type Step =
  | { kind: "ready" }
  | { kind: "validation-error"; heading: string; message: string }
  | { kind: "uploading"; file: File; percent: number; controller: AbortController }
  | { kind: "cancel-confirm"; file: File; percent: number; controller: AbortController }
  | { kind: "processing" }
  | { kind: "server-error"; message: string };

/**
 * The upload dialog (issue #25, plan step 6; Figma nodes 47:18580–47:18675
 * and 72:7017). One component switches on `step` rather than five
 * separate dialogs, since every state shares the same header and only
 * the body and footer change.
 */
export function MaterialUploadDialog({
  open,
  onOpenChange,
  client,
  atLimit,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: MaterialsClient;
  atLimit: boolean;
  onUploaded: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "ready" });
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Worked out on every render, never stored as a step: a stored "limit
  // reached" outlived a delete that freed a slot (Codex review on #36).
  // An upload already in progress keeps its own view.
  const showLimit = atLimit && step.kind === "ready";

  function resetStep() {
    setStep({ kind: "ready" });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      if (step.kind === "uploading") {
        setStep({ kind: "cancel-confirm", file: step.file, percent: step.percent, controller: step.controller });
        return;
      }
      if (step.kind === "cancel-confirm") return;
      resetStep();
      onOpenChange(false);
      return;
    }
    onOpenChange(true);
  }

  function handleFile(file: File) {
    const parsed = parseCreateMaterialRequest({ name: file.name, size: file.size, contentType: file.type });
    if (!parsed.success) {
      setStep({
        kind: "validation-error",
        heading: VALIDATION_HEADINGS[parsed.error.code] ?? "Check your file",
        message: parsed.error.message,
      });
      return;
    }
    startUpload(file);
  }

  function startUpload(file: File) {
    const controller = new AbortController();
    setStep({ kind: "uploading", file, percent: 0, controller });

    const uploadPromise = client.upload(file, {
      onProgress: (percent) => {
        setStep((prev) => (prev.kind === "uploading" ? { ...prev, percent } : prev));
      },
      signal: controller.signal,
    });
    // Not awaited: `client.upload` inserts the "uploading" row before its
    // first `await`, so this refresh shows it in the library immediately.
    onUploaded();

    uploadPromise
      .then(() => {
        setStep({ kind: "processing" });
        onUploaded();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message =
          error instanceof MaterialsClientError ? error.message : "Something went wrong. Please try again.";
        setStep({ kind: "server-error", message });
      });
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) handleFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function requestCancel() {
    setStep((prev) =>
      prev.kind === "uploading"
        ? { kind: "cancel-confirm", file: prev.file, percent: prev.percent, controller: prev.controller }
        : prev,
    );
  }

  function finishAndClose() {
    resetStep();
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Upload material</DialogTitle>
          </DialogHeader>

          {showLimit && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{MATERIAL_API_ERRORS.MATERIAL_LIMIT_REACHED.message}</p>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => handleOpenChange(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}

          {step.kind === "ready" && !showLimit && (
            <div className="flex flex-col gap-4">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center ${
                  isDragging ? "border-primary bg-secondary" : "border-border"
                }`}
              >
                <UploadCloud className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Drag and drop a file here, or</p>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="sr-only"
                  onChange={handleInputChange}
                  aria-label="Choose a file to upload"
                />
              </div>
              <p className="text-xs text-muted-foreground">PDF, PPTX or TXT · Maximum 10 MB</p>
            </div>
          )}

          {step.kind === "validation-error" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-destructive">{step.heading}</p>
                <p className="text-sm text-muted-foreground">{step.message}</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={resetStep}>
                  Choose another file
                </Button>
              </DialogFooter>
            </div>
          )}

          {(step.kind === "uploading" || step.kind === "cancel-confirm") && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-xl bg-muted p-4">
                <span className="truncate text-sm font-medium text-foreground">{step.file.name}</span>
                <Progress value={step.percent} />
                <span className="text-xs text-muted-foreground">{step.percent}%</span>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={requestCancel}>
                  Cancel upload
                </Button>
              </DialogFooter>
            </div>
          )}

          {step.kind === "processing" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">Preparing your material</p>
                <p className="text-sm text-muted-foreground">
                  This can take a few minutes. You can keep working while it finishes.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" className="rounded-full" onClick={finishAndClose}>
                  Continue in background
                </Button>
              </DialogFooter>
            </div>
          )}

          {step.kind === "server-error" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-destructive">Couldn&apos;t add this file</p>
                <p className="text-sm text-muted-foreground">{step.message}</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-full" onClick={resetStep}>
                  Choose another file
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={step.kind === "cancel-confirm"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && step.kind === "cancel-confirm") {
            setStep({ kind: "uploading", file: step.file, percent: step.percent, controller: step.controller });
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this upload?</AlertDialogTitle>
            <AlertDialogDescription>The file won&apos;t be added to this space.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep uploading</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2 bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40"
              onClick={() => {
                if (step.kind === "cancel-confirm") step.controller.abort();
                resetStep();
              }}
            >
              Cancel upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
