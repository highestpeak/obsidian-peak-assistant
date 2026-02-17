/**
 * Resize observer and container size ref for graph SVG/canvas.
 * Throttles setState to avoid reflow storm (see doc/graph-viz-crash-fix).
 */

import { useEffect, useRef, useState } from 'react';

const RESIZE_THROTTLE_MS = 80;

export function useGraphContainer(containerRef: React.RefObject<HTMLDivElement | null>) {
	const [resizeTick, setResizeTick] = useState(0);
	const containerSizeRef = useRef<{ width: number; height: number }>({ width: 400, height: 400 });

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		// RAF: requestAnimationFrame
		let raf = 0;
		let lastTick = 0;
		const ro = new ResizeObserver((entries: ResizeObserverEntry[]) => {
			const entry = entries[0];
			if (!entry) return;
			const w = Math.max(1, entry.contentRect.width) || 400;
			const h = Math.max(1, entry.contentRect.height) || 400;
			containerSizeRef.current = { width: w, height: h };
			const now = performance.now();
			if (raf) cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => {
				raf = 0;
				if (now - lastTick < RESIZE_THROTTLE_MS) return;
				lastTick = now;
				setResizeTick((t) => t + 1);
			});
		});
		ro.observe(el);
		return () => {
			if (raf) cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, [containerRef]);

	return { resizeTick, containerSizeRef };
}
