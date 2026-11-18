"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Link from "next/link";
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
  MATERIAL_FAILURE_REASONS,
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
  | { kind: "queue-failed"; message: string }
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

  function requestCancel() {
    setStep((prev) =>
      prev.kind === "uploading"
        ? { kind: "cancel-confirm", file: prev.file, percent: prev.percent, controller: prev.controller }
        : prev,
    );
  }

  // Abandoned uploads, browser side (T-09b plan step 5). While the file is
  // still being sent (before 100%), a `beforeunload` listener shows the
  // browser's own "Leave site?" warning for a closed tab, refresh or lost
  // connection. The Back button doesn't trigger `beforeunload` in this
  // Next.js App Router (it's a client-side route change, not a page
  // unload), so it gets its own guard: one extra same-URL history entry
  // means Back fires `popstate` here first, which is turned into the same
  // "Cancel this upload?" confirmation as closing the dialog — the student
  // either lets the upload finish (Keep uploading) or cancels it cleanly
  // (Cancel upload aborts, which deletes the row). Both listeners come off
  // once the file reaches 100%, so nothing warns afterwards.
  const inProgress = (step.kind === "uploading" || step.kind === "cancel-confirm") && step.percent < 100;
  useEffect(() => {
    if (!inProgress) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    window.history.pushState({ materialUploadGuard: true }, "", window.location.href);
    function handlePopState() {
      requestCancel();
      // Restore the guard entry so a second Back press is caught the same
      // way, in case the student chooses "Keep uploading".
      window.history.pushState({ materialUploadGuard: true }, "", window.location.href);
    }
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [inProgress]);

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

    client
      .upload(file, {
        onProgress: (percent) => {
          setStep((prev) => (prev.kind === "uploading" ? { ...prev, percent } : prev));
        },
        // The real client's row only exists once its create step returns
        // (plan step 4, "Order of the first refresh"); refresh then,
        // rather than right after calling `upload()`.
        onCreated: onUploaded,
        signal: controller.signal,
      })
      .then((material) => {
        onUploaded();
        if (material.status === "failed") {
          // The job couldn't be queued (plan step 4, "Complete answers
          // failed"): the library row already shows Retry; this dialog
          // just reports it instead of claiming the material is still
          // "Preparing".
          setStep({
            kind: "queue-failed",
            message: material.error?.message ?? MATERIAL_FAILURE_REASONS.PROCESSING_FAILED,
          });
        } else {
          setStep({ kind: "processing" });
        }
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
              <div className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3">
                <p className="text-xs font-semibold text-foreground">How your file is used</p>
                <p className="text-xs text-muted-foreground">
                  Your file is stored privately, and only you can see it. To suggest topics and create quizzes
                  and flashcards, parts of its text are sent to OpenAI and Google through Vercel&apos;s AI
                  Gateway. Only upload files you&apos;re allowed to use, and leave out anything personal or
                  confidential.{" "}
                  <Link href="/privacy" className="font-medium text-primary underline underline-offset-2">
                    Privacy policy
                  </Link>
                </p>
              </div>
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

          {step.kind === "queue-failed" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-destructive">Processing failed</p>
                <p className="text-sm text-muted-foreground">{step.message}</p>
              </div>
              <DialogFooter>
                <Button type="button" className="rounded-full" onClick={finishAndClose}>
                  Close
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
