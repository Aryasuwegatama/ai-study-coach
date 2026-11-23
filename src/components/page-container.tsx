import type { ReactNode } from "react";
import { cn } from "@/lib/class-names";

/** The centred content column every redesigned page sits in (`.content` in the prototype: 78rem wide). */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[78rem] flex-col px-4 py-6 sm:p-8", className)}>
      {children}
    </div>
  );
}

/** Page head: the h1 (28px on mobile, 32px from `sm`), then an optional muted subtitle. */
export function PageHead({
  title,
  subtitle,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: string;
  /** Actions on the right, for example a primary button. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 text-page-mobile text-foreground sm:text-page">{title}</h1>
        {subtitle && <p className="mt-2 max-w-[42rem] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
