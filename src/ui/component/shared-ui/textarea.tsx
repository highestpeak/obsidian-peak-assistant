import * as React from "react"

import { cn } from "@/ui/react/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "pktw-flex pktw-min-h-[80px] pktw-w-full pktw-rounded-md pktw-border pktw-border-input pktw-bg-background pktw-px-3 pktw-py-2 pktw-text-base pktw-ring-offset-background placeholder:pktw-text-muted-foreground focus-visible:pktw-outline-none focus-visible:pktw-ring-2 focus-visible:pktw-ring-ring focus-visible:pktw-ring-offset-2 disabled:pktw-cursor-not-allowed disabled:pktw-opacity-50 md:pktw-text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
