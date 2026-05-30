import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/ui/react/lib/utils';

/** Radix Popover Root re-export. */
export const Popover = PopoverPrimitive.Root;

/** Radix Popover Trigger re-export. */
export const PopoverTrigger = PopoverPrimitive.Trigger;

/** Radix Popover Portal re-export — use when explicit portal control is needed. */
export const PopoverPortal = PopoverPrimitive.Portal;

/** Floating menu surface — applies `.pk-popover` to Radix Content. */
export const PopoverContent = React.forwardRef<
	React.ElementRef<typeof PopoverPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 4, ...props }, ref) => (
	<PopoverPrimitive.Portal>
		<PopoverPrimitive.Content
			ref={ref}
			align={align}
			sideOffset={sideOffset}
			className={cn('pk-popover', className)}
			{...props}
		/>
	</PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';

export interface PopoverItemProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/** Menu item inside a Popover — applies `.pk-pop-item`. */
export const PopoverItem = React.forwardRef<
	HTMLButtonElement,
	PopoverItemProps
>(({ className, type = 'button', ...props }, ref) => (
	<button
		ref={ref}
		type={type}
		className={cn('pk-pop-item', className)}
		{...props}
	/>
));
PopoverItem.displayName = 'PopoverItem';
