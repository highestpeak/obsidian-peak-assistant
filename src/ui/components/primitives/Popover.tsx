import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/ui/react/lib/utils';

/** Radix Popover Root re-export. */
export const Popover = PopoverPrimitive.Root;

/** Radix Popover Trigger re-export. */
export const PopoverTrigger = PopoverPrimitive.Trigger;

/** Radix Popover Portal re-export — use when explicit portal control is needed. */
export const PopoverPortal = PopoverPrimitive.Portal;

export interface PopoverContentProps
	extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
	container?: HTMLElement | null;
	portalClassName?: string;
}

/**
 * Floating menu surface — applies `.pk-popover` to Radix Content.
 *
 * Wraps the Portal output in a `peak-design-root` div so `.pk-*` token
 * styles still apply after Radix moves the content under `document.body`,
 * escaping any ancestor scope. Mirrors the Modal portalClassName fix from
 * PR-Dash-3.
 */
export const PopoverContent = React.forwardRef<
	React.ElementRef<typeof PopoverPrimitive.Content>,
	PopoverContentProps
>(({ className, align = 'start', sideOffset = 4, container, portalClassName, ...props }, ref) => (
	<PopoverPrimitive.Portal container={container ?? undefined}>
		<div className={cn('peak-design-root', portalClassName)}>
			<PopoverPrimitive.Content
				ref={ref}
				align={align}
				sideOffset={sideOffset}
				className={cn('pk-popover', className)}
				{...props}
			/>
		</div>
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
