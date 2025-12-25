import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { cn } from "@/ui/react/lib/utils";

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
	React.ElementRef<typeof HoverCardPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
	<HoverCardPrimitive.Content
		ref={ref}
		align={align}
		sideOffset={sideOffset}
		className={cn(
			"pktw-z-50 pktw-w-64 pktw-rounded-md pktw-border pktw-bg-popover pktw-p-4 pktw-text-popover-foreground pktw-shadow-md pktw-outline-none data-[state=open]:pktw-animate-in data-[state=closed]:pktw-animate-out data-[state=closed]:pktw-fade-out-0 data-[state=open]:pktw-fade-in-0 data-[state=closed]:pktw-zoom-out-95 data-[state=open]:pktw-zoom-in-95 data-[side=bottom]:pktw-slide-in-from-top-2 data-[side=left]:pktw-slide-in-from-right-2 data-[side=right]:pktw-slide-in-from-left-2 data-[side=top]:pktw-slide-in-from-bottom-2",
			className
		)}
		{...props}
	/>
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };

