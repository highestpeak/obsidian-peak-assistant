import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface ToggleProps
	extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'onClick'> {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	label: string;
}

/** Binary 36x20 switch backed by the shared `.pk-toggle` visual contract. */
export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
	({ checked, onCheckedChange, label, className, disabled, type = 'button', ...props }, ref) => (
		<button
			ref={ref}
			type={type}
			role="switch"
			aria-checked={checked}
			aria-label={label}
			data-on={checked ? 'true' : undefined}
			className={cn('pk-toggle', className)}
			disabled={disabled}
			onClick={() => onCheckedChange(!checked)}
			{...props}
		>
			<span className="pk-toggle__thumb" aria-hidden="true" />
		</button>
	),
);
Toggle.displayName = 'Toggle';
