import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface HorizontalBarProps {
	/** Left-column label. Supports leading icon via children composition. */
	label: React.ReactNode;
	/** 0–100. Clamped on render. */
	percent: number;
	/** Cost / value cell — kept OUTSIDE the bar by design. */
	cost: React.ReactNode;
	/** Optional formatted percent text (e.g. "23%"). */
	percentLabel?: React.ReactNode;
	/** Override fill colour; defaults to `--pk-accent`. */
	color?: string;
	className?: string;
}

/**
 * Horizontal bar list row — applies `.pk-hbar` (scoped to
 * `.peak-design-root.usage-dashboard`). 4-column grid: label / bar / $ / %.
 *
 * Critical mock guard: the `$` value lives OUTSIDE the bar. Do not
 * collapse the cost into the bar; it must stay readable when bar width is
 * small.
 */
export function HorizontalBar({
	label,
	percent,
	cost,
	percentLabel,
	color,
	className,
}: HorizontalBarProps) {
	const clamped = Math.max(0, Math.min(100, percent));
	return (
		<div className={cn('pk-hbar', className)}>
			<span className="pk-hbar__label">
				{typeof label === 'string' ? (
					<span className="pk-hbar__label-text">{label}</span>
				) : (
					label
				)}
			</span>
			<span className="pk-hbar__bar">
				<span
					className="pk-hbar__bar-fill"
					style={{
						width: `${clamped}%`,
						...(color ? { background: color } : null),
					}}
				/>
			</span>
			<span className="pk-hbar__cost">{cost}</span>
			<span className="pk-hbar__pct">
				{percentLabel ?? `${clamped.toFixed(0)}%`}
			</span>
		</div>
	);
}
