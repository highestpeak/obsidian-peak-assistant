import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface InlineTableBarProps {
	/** 0–100. Clamped on render. */
	percent: number;
	/** Optional formatted value text shown to the right of the bar. */
	value?: React.ReactNode;
	/** Override colour, e.g. provider colour. Defaults to `--pk-accent`. */
	color?: string;
	className?: string;
	'aria-label'?: string;
}

/**
 * Inline table bar — applies `.pk-tbl-bar` (scoped to
 * `.peak-design-root.usage-dashboard`). Used in table % cells where the bar
 * sits inline alongside the numeric value (Provider · Model breakdown,
 * Outcome Value table, etc.).
 */
export function InlineTableBar({
	percent,
	value,
	color,
	className,
	'aria-label': ariaLabel,
}: InlineTableBarProps) {
	const clamped = Math.max(0, Math.min(100, percent));
	return (
		<div className={cn('pk-tbl-bar', className)} aria-label={ariaLabel}>
			<span className="pk-tbl-bar__track">
				<span
					className="pk-tbl-bar__fill"
					style={{
						width: `${clamped}%`,
						...(color ? { background: color } : null),
					}}
				/>
			</span>
			{value !== undefined ? (
				<span className="pk-tbl-bar__value">{value}</span>
			) : null}
		</div>
	);
}
