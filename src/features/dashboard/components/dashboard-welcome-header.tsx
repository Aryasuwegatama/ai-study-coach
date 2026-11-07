/**
 * "Welcome" row (Figma node 80:6946, "Welcome"). Takes the student's own
 * first name — the only real data this screen shows (everything else is
 * labelled example data, PRD "Dashboard & Navigation" row, T-04b plan).
 */
export function DashboardWelcomeHeader({ firstName }: { firstName: string }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-[1.875rem] leading-[2.375rem] font-semibold text-foreground">
          Welcome back, {firstName}
        </h1>
        <p className="text-sm leading-[1.375rem] text-muted-foreground">
          Your learning, your pace. Pick up what matters today.
        </p>
      </div>
      <span className="inline-flex h-7 w-fit shrink-0 items-center rounded-full bg-secondary px-3 text-xs font-semibold text-primary">
        EXAMPLE DATA
      </span>
    </div>
  );
}
