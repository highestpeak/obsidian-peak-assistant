import * as React from 'react';

export interface PaceBarProps {
	/** 0..1 — share of the budget consumed so far. Clamped on render. */
	usedPct: number;
	/** Optional 0..1 marker for projected end-of-cycle position. */
	projectedPct?: number;
	/** Three-stop semantic tone driving the fill color. Defaults to "ok". */
	tone?: 'ok' | 'warn' | 'bad';
	/** Optional legend tuples rendered under the bar (e.g. ["35% used", "Projected $38.60"]). */
	legend?: string[];
	className?: string;
	'aria-label'?: string;
}

/**
 * Horizontal pace bar with an optional projection tick. Mirrors the mock's
 * `.pace` pattern — same height (6px standard, 8px when projection mark is
 * present), same rounded fill, same tone palette. Drives the Budget pace KPI
 * (Overview) and the Monthly budget card (Budget & Alerts).
 */
export function PaceBar({
	usedPct,
	projectedPct,
	tone = 'ok',
	legend,
	className,
	...rest
}: PaceBarProps) {
	const used = clamp01(usedPct);
	const projected = projectedPct === undefined ? undefined : clamp01(projectedPct);
	return (
		<div className={joinClass('pk-pace-wrap', className)}>
			<div
				className={`pk-pace${projected !== undefined ? ' pk-pace--with-mark' : ''}`}
				role="img"
				aria-label={rest['aria-label']}
			>
				<div
					className={`pk-pace__fill pk-pace__fill--${tone}`}
					style={{ width: `${used * 100}%` }}
				/>
				{projected !== undefined ? (
					<div
						className="pk-pace__mark"
						style={{ left: `${projected * 100}%` }}
						title={`Projected ${(projected * 100).toFixed(0)}%`}
					/>
				) : null}
			</div>
			{legend && legend.length > 0 ? (
				<div className="pk-pace__legend">
					{legend.map((item, i) => (
						<span key={i}>{item}</span>
					))}
				</div>
			) : null}
		</div>
	);
}

function clamp01(v: number): number {
	if (!Number.isFinite(v)) return 0;
	return Math.max(0, Math.min(1, v));
}

function joinClass(...parts: Array<string | undefined>): string {
	return parts.filter(Boolean).join(' ');
}
