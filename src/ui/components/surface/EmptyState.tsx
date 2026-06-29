import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Body text. Prefer a single sentence (no period) for compact layouts. */
	label: React.ReactNode;
	/** Visual density: 'sm' (py-6), 'md' (py-12, default), 'lg' (py-16). */
	size?: 'sm' | 'md' | 'lg';
}

const sizeClass = {
	sm: 'pktw-px-4 pktw-py-6',
	md: 'pktw-px-6 pktw-py-12',
	lg: 'pktw-px-8 pktw-py-16',
} as const;

/**
 * Dashed-border empty placeholder used inside panels/lists when there's
 * nothing to render yet. Vault Review uses this 9× for "no data yet" states;
 * other surfaces (Copilot panels, Quick Search empty results) can also adopt
 * it instead of hand-writing the same dashed surface.
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
	({ className, label, size = 'md', ...props }, ref) => (
		<div
			ref={ref}
			className={cn(
				sizeClass[size],
				'pktw-text-center pktw-text-pk-foreground-muted pktw-bg-pk-background-secondary pktw-border pktw-border-dashed pktw-border-pk-border pktw-rounded-2xl',
				className
			)}
			{...props}
		>
			{label}
		</div>
	)
);
EmptyState.displayName = 'EmptyState';
