import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface IconButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	/** Required aria-label for accessibility (icon-only buttons have no visible text). */
	label: string;
}

/** Square 32px transparent icon button — applies `.pk-icon-btn`. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
	({ className, label, type = 'button', ...props }, ref) => (
		<button
			ref={ref}
			type={type}
			aria-label={label}
			className={cn('pk-icon-btn', className)}
			{...props}
		/>
	)
);
IconButton.displayName = 'IconButton';
