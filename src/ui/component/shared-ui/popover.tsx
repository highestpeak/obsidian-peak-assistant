import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/ui/react/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
	React.ElementRef<typeof PopoverPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
	<PopoverPrimitive.Portal>
		<PopoverPrimitive.Content
			ref={ref}
			align={align}
			sideOffset={sideOffset}
			className={cn(
				"pktw-z-50 pktw-w-72 pktw-rounded-md pktw-border pktw-bg-popover pktw-p-4 pktw-text-popover-foreground pktw-shadow-md pktw-outline-none data-[state=open]:pktw-animate-in data-[state=closed]:pktw-animate-out data-[state=closed]:pktw-fade-out-0 data-[state=open]:pktw-fade-in-0 data-[state=closed]:pktw-zoom-out-95 data-[state=open]:pktw-zoom-in-95 data-[side=bottom]:pktw-slide-in-from-top-2 data-[side=left]:pktw-slide-in-from-right-2 data-[side=right]:pktw-slide-in-from-left-2 data-[side=top]:pktw-slide-in-from-bottom-2",
				className
			)}
			{...props}
		/>
	</PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };

