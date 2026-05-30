import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface PillProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	selected?: boolean;
}

/** Toggleable filter pill — applies `.pk-pill` with `data-selected` for state. */
export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(
	({ className, selected, type = 'button', ...props }, ref) => (
		<button
			ref={ref}
			type={type}
			data-selected={selected ? 'true' : undefined}
			className={cn('pk-pill', className)}
			{...props}
		/>
	)
);
Pill.displayName = 'Pill';
