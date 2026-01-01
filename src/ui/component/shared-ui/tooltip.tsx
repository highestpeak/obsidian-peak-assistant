import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/ui/react/lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

// Disable tooltip on focus - only show on hover
// Radix UI Tooltip shows on both hover and focus by default
// We need to handle this via CSS or component props

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
	React.ElementRef<typeof TooltipPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
	<TooltipPrimitive.Content
		ref={ref}
		sideOffset={sideOffset}
		className={cn(
			'pktw-z-50 pktw-overflow-hidden pktw-rounded-md pktw-border pktw-bg-popover pktw-px-3 pktw-py-1.5 pktw-text-sm pktw-text-popover-foreground pktw-shadow-md pktw-animate-in pktw-fade-in-0 pktw-zoom-in-95 data-[state=closed]:pktw-animate-out data-[state=closed]:pktw-fade-out-0 data-[state=closed]:pktw-zoom-out-95 data-[side=bottom]:pktw-slide-in-from-top-2 data-[side=left]:pktw-slide-in-from-right-2 data-[side=right]:pktw-slide-in-from-left-2 data-[side=top]:pktw-slide-in-from-bottom-2',
			className
		)}
		{...props}
	/>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

