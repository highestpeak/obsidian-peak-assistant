import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Intelligence animation frame with breathing glow border.
 * Entire perimeter has uniform pulse animation.
 */
export const IntelligenceFrame: React.FC<{
	isActive: boolean;
	className?: string;
	/** Applied to inner content wrapper; use for flex/overflow chain (e.g. scrollable modal). */
	innerClassName?: string;
	children: React.ReactNode;
}> = ({ isActive, className = '', innerClassName = '', children }) => {
	const pulseDuration = isActive ? '3s' : '1s';

	return (
		<div
			className={`pktw-relative pktw-p-[1px] pktw-rounded-xl pktw-isolate ${className}`}
			style={{
				animation: `pktw-pulseGlow ${pulseDuration} ease-in-out infinite`,
				boxShadow: '0 0 0 1px rgba(139, 92, 246, 0.5), 0 0 15px rgba(139, 92, 246, 0.25), 0 0 25px rgba(59, 130, 246, 0.15), 0 0 35px rgba(236, 72, 153, 0.1)',
			}}
		>
			{/* Inner content with frosted glass */}
			<div className={`pktw-relative pktw-rounded-[11px] pktw-bg-white/92 dark:pktw-bg-gray-900/90 pktw-backdrop-blur-xl ${innerClassName}`.trim()}>
				{children}
			</div>
		</div>
	);
};

/**
 * Live timer component for displaying elapsed analysis time.
 * Uses requestAnimationFrame for smooth updates.
 */
export const AnalysisTimer: React.FC<{
	startedAtMs: number;
	isRunning: boolean;
	finalDurationMs?: number;
}> = ({ startedAtMs, isRunning, finalDurationMs }) => {
	const [elapsed, setElapsed] = useState(0);
	const rafRef = useRef<number>();
	const tickRef = useRef<number>();
	const [dotsTick, setDotsTick] = useState(0);

	useEffect(() => {
		if (!isRunning && finalDurationMs !== undefined) {
			setElapsed(finalDurationMs);
			return;
		}

		if (!isRunning || !startedAtMs) {
			return;
		}

		const update = () => {
			setElapsed(Date.now() - startedAtMs);
			rafRef.current = requestAnimationFrame(update);
		};
		rafRef.current = requestAnimationFrame(update);

		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, [startedAtMs, isRunning, finalDurationMs]);

	// Simple "..." animation without framer-motion.
	useEffect(() => {
		if (!isRunning) {
			setDotsTick(0);
			return;
		}
		tickRef.current = window.setInterval(() => {
			setDotsTick((t) => (t + 1) % 3);
		}, 350);
		return () => {
			if (tickRef.current) {
				window.clearInterval(tickRef.current);
			}
		};
	}, [isRunning]);

	const seconds = (elapsed / 1000).toFixed(1);
	const dots = useMemo(() => (isRunning ? '.'.repeat(dotsTick + 1) : ''), [dotsTick, isRunning]);

	return (
		<span className="pktw-text-xs pktw-font-mono pktw-tabular-nums pktw-text-[#6c757d] pktw-transition-opacity pktw-duration-200 pktw-opacity-100">
			{seconds}s
			{isRunning ? <span className="pktw-inline-block pktw-min-w-4">{dots}</span> : null}
		</span>
	);
};
