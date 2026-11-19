/**
 * "Welcome" row (Figma node 80:6946, "Welcome"): the student's own first name.
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
