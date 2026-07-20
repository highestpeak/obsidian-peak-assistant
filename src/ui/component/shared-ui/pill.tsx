import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/ui/react/lib/utils';

const pillVariants = cva(
	'pktw-inline-flex pktw-items-center pktw-gap-1 pktw-rounded-full pktw-px-2 pktw-py-0.5 pktw-text-pk-sm pktw-font-semibold pktw-leading-none pktw-whitespace-nowrap',
	{
		variants: {
			variant: {
				neutral: 'pktw-bg-pk-surface-sunken pktw-text-pk-foreground-muted',
				accent:  'pktw-bg-pk-accent-tint pktw-text-pk-accent-text',
				success: 'pktw-bg-pk-success-bg pktw-text-pk-success-text',
				warning: 'pktw-bg-pk-warning-bg pktw-text-pk-warning-text',
				danger:  'pktw-bg-pk-error-bg pktw-text-pk-error-text',
				info:    'pktw-bg-pk-info-bg pktw-text-pk-info-text',
				indigo:  'pktw-bg-pk-indigo-bg pktw-text-pk-indigo-text',
				outline: 'pktw-bg-transparent pktw-text-pk-foreground-muted pktw-border pktw-border-pk-border',
			},
			size: {
				sm: 'pktw-px-1.5 pktw-py-px pktw-text-pk-xs',
				md: 'pktw-px-2 pktw-py-0.5 pktw-text-pk-sm',
			},
		},
		defaultVariants: {
			variant: 'neutral',
			size: 'md',
		},
	},
);

export interface PillProps
	extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>,
		VariantProps<typeof pillVariants> {}

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
	({ className, variant, size, ...props }, ref) => (
		<span ref={ref} className={cn(pillVariants({ variant, size }), className)} {...props} />
	),
);
Pill.displayName = 'Pill';
