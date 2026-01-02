import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/ui/react/lib/utils"

const badgeVariants = cva(
  "pktw-inline-flex pktw-items-center pktw-rounded-full pktw-border pktw-px-2.5 pktw-py-0.5 pktw-text-xs pktw-font-semibold pktw-transition-colors focus:pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-ring focus:pktw-ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "pktw-border-transparent pktw-bg-primary pktw-text-primary-foreground hover:pktw-bg-primary/80",
        secondary:
          "pktw-border-transparent pktw-bg-secondary pktw-text-secondary-foreground hover:pktw-bg-secondary/80",
        destructive:
          "pktw-border-transparent pktw-bg-destructive pktw-text-destructive-foreground hover:pktw-bg-destructive/80",
        outline: "pktw-text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
