import * as React from 'react';
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
	'aria-label': ariaLabel,
}: SegmentedProps<T>) {
	return (
		<div
			className={cn('pk-segmented', className)}
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
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
Segmented.displayName = 'Segmented';
