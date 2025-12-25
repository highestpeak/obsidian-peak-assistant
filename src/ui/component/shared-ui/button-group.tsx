import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
	orientation?: 'horizontal' | 'vertical';
}

/**
 * Button group container
 */
export const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
	({ className, orientation = 'horizontal', ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					'pktw-inline-flex pktw-items-center',
					orientation === 'horizontal' ? 'pktw-flex-row' : 'pktw-flex-col',
					className
				)}
				{...props}
			/>
		);
	}
);
ButtonGroup.displayName = 'ButtonGroup';

export interface ButtonGroupTextProps extends React.HTMLAttributes<HTMLSpanElement> {}

/**
 * Text element for button group
 */
export const ButtonGroupText = React.forwardRef<HTMLSpanElement, ButtonGroupTextProps>(
	({ className, ...props }, ref) => {
		return (
			<span
				ref={ref}
				className={cn('pktw-px-2 pktw-py-1 pktw-text-sm', className)}
				{...props}
			/>
		);
	}
);
ButtonGroupText.displayName = 'ButtonGroupText';

