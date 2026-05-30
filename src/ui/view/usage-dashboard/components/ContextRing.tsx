import * as React from 'react';
import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { useCurrentContextUtilization } from '../integration/useCurrentContextUtilization';
import type { DashboardStrings } from '../UsageDashboard';

/**
 * Context utilization ring (Dashboard carrier C — spec §6.1).
 *
 * Mounts adjacent to the chat composer via `registerComposerSlotRenderer`.
 * Renders a 24×24 SVG donut whose stroke fills clockwise as
 * `useCurrentContextUtilization()` rises toward 1. Color follows three bands:
 *
 *   < 0.7   → `--pk-success`
 *   0.7-0.9 → `--pk-warning`
 *   > 0.9   → `--pk-error`
 *
 * Renders nothing when `max === 0` (chat side has not yet wired
 * `setCurrentContextUtilization`).
 */
export function ContextRing() {
	const { used, max, ratio } = useCurrentContextUtilization();
	const [strings, setStrings] = React.useState<ContextRingStrings>(FALLBACK_STRINGS);

	React.useEffect(() => {
		let cancelled = false;
		const load = async () => {
			try {
				const tm = TemplateManager.getInstance();
				const loaded = await tm.loadJson<DashboardStrings & { contextRing?: ContextRingStrings }>(
					ConfigTemplateId.Dashboard,
				);
				if (!cancelled && loaded?.contextRing) {
					setStrings({ ...FALLBACK_STRINGS, ...loaded.contextRing });
				}
			} catch { /* fallback already in state */ }
		};
		void load();
		return () => { cancelled = true; };
	}, []);

	if (max <= 0) return null;

	const clamped = Math.max(0, Math.min(1, ratio));
	const band = clamped > 0.9 ? 'danger' : clamped > 0.7 ? 'warn' : 'ok';
	const tooltip = strings.tooltip
		.replace('{used}', formatN(used))
		.replace('{max}', formatN(max));

	// Geometry: 24×24 viewBox, center 12, radius 9 → circumference 2π·9 ≈ 56.549.
	const RADIUS = 9;
	const CIRC = 2 * Math.PI * RADIUS;
	const dash = clamped * CIRC;

	return (
		<span
			className="pk-context-ring"
			data-band={band}
			title={tooltip}
			role="img"
			aria-label={tooltip}
		>
			<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
				<circle
					className="pk-context-ring__track"
					cx="12"
					cy="12"
					r={RADIUS}
					fill="none"
				/>
				<circle
					className="pk-context-ring__fill"
					cx="12"
					cy="12"
					r={RADIUS}
					fill="none"
					strokeDasharray={`${dash} ${CIRC - dash}`}
					transform="rotate(-90 12 12)"
				/>
			</svg>
			<span className="pk-context-ring__label">{Math.round(clamped * 100)}%</span>
		</span>
	);
}

interface ContextRingStrings {
	tooltip: string;
}

const FALLBACK_STRINGS: ContextRingStrings = {
	tooltip: 'Context: {used} / {max} tokens',
};

function formatN(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return String(n);
}
