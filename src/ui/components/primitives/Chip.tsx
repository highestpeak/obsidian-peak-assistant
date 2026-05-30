import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';
import type { ProviderId } from './types';

export type ChipVariant =
	| 'success'
	| 'warning'
	| 'danger'
	| 'neutral'
	| 'accent'
	| 'info'
	| 'provider';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
	variant?: ChipVariant;
	/** Only meaningful when `variant === 'provider'`. Drives the data-provider attr. */
	provider?: ProviderId;
}

/** Pill-shaped status/label chip — applies `.pk-chip` + `.pk-chip--{variant}`. */
export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
	({ className, variant = 'neutral', provider, ...props }, ref) => (
		<span
			ref={ref}
			className={cn('pk-chip', `pk-chip--${variant}`, className)}
			data-provider={variant === 'provider' ? provider : undefined}
			{...props}
		/>
	)
);
Chip.displayName = 'Chip';
