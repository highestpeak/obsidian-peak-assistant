import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface SavingsDialProps {
	/** 0–100. Clamped on render. */
	percent: number;
	/** Headline value, e.g. "$3.40 / mo saved". */
	strong: React.ReactNode;
	/** Supporting caption, e.g. "vs current routing". */
	sub?: React.ReactNode;
	/** Override ring colour; defaults to `--pk-accent`. */
	color?: string;
	className?: string;
}

const RING_SIZE = 48;
const RING_STROKE = 6;
const RADIUS = (RING_SIZE - RING_STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * Savings dial — small SVG ring + caption pair, applies `.pk-savings-dial`
 * (scoped to `.peak-design-root.usage-dashboard`). Used on Optimization /
 * Outcome Value screens to show projected savings as a single glanceable
 * unit.
 */
export function SavingsDial({
	percent,
	strong,
	sub,
	color,
	className,
}: SavingsDialProps) {
	const clamped = Math.max(0, Math.min(100, percent));
	const offset = CIRC * (1 - clamped / 100);
	return (
		<div className={cn('pk-savings-dial', className)}>
			<span className="pk-savings-dial__ring" aria-hidden="true">
				<svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
					<circle
						className="pk-savings-dial__track"
						cx={RING_SIZE / 2}
						cy={RING_SIZE / 2}
						r={RADIUS}
						fill="none"
						strokeWidth={RING_STROKE}
					/>
					<circle
						className="pk-savings-dial__fill"
						cx={RING_SIZE / 2}
						cy={RING_SIZE / 2}
						r={RADIUS}
						fill="none"
						strokeWidth={RING_STROKE}
						strokeLinecap="round"
						strokeDasharray={CIRC}
						strokeDashoffset={offset}
						style={color ? { stroke: color } : undefined}
					/>
				</svg>
				<span className="pk-savings-dial__num">
					{Math.round(clamped)}%
				</span>
			</span>
			<span className="pk-savings-dial__caption">
				<span className="pk-savings-dial__caption-strong">{strong}</span>
				{sub ? (
					<span className="pk-savings-dial__caption-sub">{sub}</span>
				) : null}
			</span>
		</div>
	);
}
