import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Status pill from the redesign prototype (`.badge`): a fully rounded pill
 * with a 1px border in the text colour. The tone never carries meaning on
 * its own; every badge also has a text label.
 */
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-current px-2 py-0.5 text-sm leading-normal font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-4",
  {
    variants: {
      tone: {
        neutral: "bg-secondary text-muted-foreground",
        blue: "bg-accent text-accent-foreground",
        green: "bg-soft-green text-green",
        amber: "bg-soft-amber text-amber",
        red: "bg-soft-red text-destructive",
        purple: "bg-soft-purple text-purple",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

function Badge({
  className,
  tone = "neutral",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ tone }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      tone,
    },
  })
}

export { Badge, badgeVariants }
