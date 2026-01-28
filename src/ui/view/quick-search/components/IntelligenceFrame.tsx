import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Apple Intelligence style frame with rotating conic gradient glow border.
 * Speed dynamically adjusts based on streaming/analyzing state.
 */
export const IntelligenceFrame: React.FC<{
	isActive: boolean;
	className?: string;
	children: React.ReactNode;
}> = ({ isActive, className = '', children }) => {
	// IMPORTANT:
	// Avoid updating React state on every animation frame.
	// Previous implementation re-rendered the entire analysis subtree at ~60fps, which can cause UI jank and crashes.
	const spinDuration = isActive ? '3.0s' : '18.0s';

	return (
		<div className={`pktw-relative pktw-p-[2px] pktw-rounded-xl pktw-overflow-hidden ${className}`}>
			{/* Glow layer (blurred) */}
			<div
				className="pktw-absolute pktw-inset-0 pktw-rounded-xl pktw-animate-spin"
				style={{
					animationDuration: spinDuration,
					animationTimingFunction: 'linear',
					background: 'conic-gradient(#8b5cf6, #3b82f6, #ec4899, #8b5cf6)',
					opacity: isActive ? 0.55 : 0.22,
					filter: 'blur(10px)',
					transform: 'translateZ(0)',
				}}
			/>
			{/* Sharp border layer */}
			<div
				className="pktw-absolute pktw-inset-0 pktw-rounded-xl pktw-animate-spin"
				style={{
					animationDuration: spinDuration,
					animationTimingFunction: 'linear',
					background: 'conic-gradient(#8b5cf6, #3b82f6, #ec4899, #8b5cf6)',
					opacity: isActive ? 0.85 : 0.35,
					transition: 'opacity 0.25s ease',
					transform: 'translateZ(0)',
				}}
			/>
			{/* Inner content with frosted glass */}
			<div className="pktw-relative pktw-rounded-[10px] pktw-bg-white/90 dark:pktw-bg-gray-900/90 pktw-backdrop-blur-xl">
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
