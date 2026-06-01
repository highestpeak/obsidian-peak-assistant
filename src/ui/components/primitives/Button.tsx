import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'default' | 'sm';

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
}

/**
 * CTA button — applies `.pk-btn` + variant modifier.
 *
 * Use for modal footer Back/Continue, wizard CTAs, form submits. Not for
 * toggleable filter chips (`<Pill>`) or icon-only square buttons (`<IconButton>`).
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{ className, variant = 'secondary', size = 'default', type = 'button', ...props },
		ref
	) => (
		<button
			ref={ref}
			type={type}
			className={cn(
				'pk-btn',
				variant === 'primary' && 'pk-btn--primary',
				variant === 'secondary' && 'pk-btn--secondary',
				variant === 'ghost' && 'pk-btn--ghost',
				size === 'sm' && 'pk-btn--sm',
				className
			)}
			{...props}
		/>
	)
);
Button.displayName = 'Button';
