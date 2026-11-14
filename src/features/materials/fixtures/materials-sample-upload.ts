/**
 * T-09a's simulated upload (plan step 3): reports progress over about
 * 1.5 seconds and respects `signal` for cancel, the same shape as the
 * real `put()` call T-09b adds (`onUploadProgress`, `abortSignal`). The
 * timing is for demonstrating every UI state, not for matching a real
 * upload's duration.
 */
const STEPS = 10;
const STEP_MS = 150;

export function simulateUpload({
  onProgress,
  signal,
}: {
  onProgress: (percent: number) => void;
  signal: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The upload was cancelled.", "AbortError"));
      return;
    }

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      onProgress(Math.min(100, Math.round((step / STEPS) * 100)));
      if (step >= STEPS) {
        clearInterval(interval);
        signal.removeEventListener("abort", onAbort);
        resolve();
      }
    }, STEP_MS);

    function onAbort() {
      clearInterval(interval);
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    }

    signal.addEventListener("abort", onAbort);
  });
}
