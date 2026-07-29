import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/ui/react/lib/utils';

export interface SegmentedOption<T extends string> {
	value: T;
	label: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
	value: T;
	onValueChange: (next: T) => void;
	options: SegmentedOption<T>[];
	className?: string;
	variant?: 'default' | 'animated-pill';
	size?: 'sm' | 'md' | 'lg';
	/**
	 * Shared-layout key for the selected thumb. A per-instance React id is
	 * appended so separate controls never animate into one another.
	 */
	thumbLayoutId?: string;
	'aria-label'?: string;
}

/**
 * Controlled segmented selector — applies `.pk-segmented` + `.pk-segmented__opt`.
 * Single declarative API (not a compound component) so callers pass an options
 * array instead of assembling children.
 *
 * TODO: roving-focus a11y (arrow-key navigation between tabs) not yet
 * implemented. Each option still gets `role="tab"` + `aria-selected` so
 * screen readers announce state correctly.
 */
export function Segmented<T extends string>({
	value,
	onValueChange,
	options,
	className,
	variant = 'default',
	size = 'md',
	thumbLayoutId = 'segmented-thumb',
	'aria-label': ariaLabel,
}: SegmentedProps<T>) {
	const instanceId = React.useId();
	const reducedMotion = useReducedMotion();
	return (
		<div
			className={cn('pk-segmented', className)}
			data-variant={variant}
			data-size={size}
			role="tablist"
			aria-label={ariaLabel}
		>
			{options.map((opt) => {
				const isSelected = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						role="tab"
						aria-selected={isSelected}
						data-selected={isSelected ? 'true' : undefined}
						className="pk-segmented__opt"
						onClick={() => onValueChange(opt.value)}
					>
						{variant === 'animated-pill' && isSelected && (
							<motion.span
								aria-hidden
								className="pk-segmented__thumb"
								layoutId={`${thumbLayoutId}-${instanceId}`}
								transition={reducedMotion
									? { duration: 0 }
									: { type: 'spring', stiffness: 500, damping: 34 }}
							/>
						)}
						<span className="pk-segmented__label">{opt.label}</span>
					</button>
				);
			})}
		</div>
	);
}
Segmented.displayName = 'Segmented';
