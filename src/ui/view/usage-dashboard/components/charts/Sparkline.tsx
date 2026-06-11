import * as React from 'react';

export interface SparklinePoint {
	value: number;
}

export interface SparklineProps {
	/** Series in temporal order. Renderer ignores X spacing — points distribute evenly. */
	points: SparklinePoint[];
	/** Stroke color (CSS) — defaults to currentColor so callers can recolor by `style.color`. */
	stroke?: string;
	/** Whether to render the soft area fill under the line. Defaults to true. */
	area?: boolean;
	/** Pixel height; width comes from the parent. Default 32. */
	height?: number;
	/** Optional accessible label. */
	'aria-label'?: string;
	className?: string;
}

/**
 * SVG sparkline. No chart-library dep, no animation — quick and cheap.
 * Renders a single polyline + optional shaded area. Pixel coordinates are
 * computed from the visible viewBox (200×height) so the line stays sharp at
 * any column width.
 */
export function Sparkline({
	points,
	stroke,
	area = true,
	height = 32,
	className,
	...rest
}: SparklineProps) {
	const W = 200;
	const H = height;
	if (points.length === 0) {
		return (
			<svg
				className={joinClass('pk-spark', className)}
				viewBox={`0 0 ${W} ${H}`}
				preserveAspectRatio="none"
				aria-label={rest['aria-label']}
				role="img"
			/>
		);
	}
	if (points.length === 1) {
		const y = H - 4;
		const path = `M0 ${y} L${W} ${y}`;
		return (
			<svg
				className={joinClass('pk-spark', className)}
				viewBox={`0 0 ${W} ${H}`}
				preserveAspectRatio="none"
				style={stroke ? { color: stroke } : undefined}
				aria-label={rest['aria-label']}
				role="img"
			>
				<path className="pk-spark__line" d={path} />
			</svg>
		);
	}

	const values = points.map((p) => p.value);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	const stepX = W / (points.length - 1);
	const padY = 2;
	const usableH = H - padY * 2;
	const projectY = (v: number) => H - padY - ((v - min) / span) * usableH;

	const linePath = points
		.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(2)} ${projectY(p.value).toFixed(2)}`)
		.join(' ');
	const areaPath = `${linePath} L${W} ${H} L0 ${H} Z`;

	return (
		<svg
			className={joinClass('pk-spark', className)}
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			style={stroke ? { color: stroke } : undefined}
			aria-label={rest['aria-label']}
			role="img"
		>
			{area ? <path className="pk-spark__area" d={areaPath} /> : null}
			<path className="pk-spark__line" d={linePath} />
		</svg>
	);
}

function joinClass(...parts: Array<string | undefined>): string {
	return parts.filter(Boolean).join(' ');
}
