/**
 * "Welcome" row (Figma node 80:6946, "Welcome"). The student's own first
 * name; T-05 adds real Study Spaces below, so the "EXAMPLE DATA" badge
 * that used to sit here moved onto the three sections that are still
 * fixtures (Learning Snapshot, Continue Studying, Upcoming Revisions).
 */
export function DashboardWelcomeHeader({ firstName }: { firstName: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">
        Welcome back, {firstName}
      </h1>
      <p className="text-sm leading-[1.375rem] text-muted-foreground">
        Your learning, your pace. Pick up what matters today.
      </p>
    </div>
  );
}
