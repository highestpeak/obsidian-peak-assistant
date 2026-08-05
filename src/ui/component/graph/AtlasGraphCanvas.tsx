import React, { useEffect, useState } from 'react';
import type { AtlasGraphCanvasProps } from './AtlasGraphCanvasImpl';

export type {
	AtlasGraphCanvasProps,
	AtlasGraphNodeTap,
	AtlasGraphPreset,
	AtlasGraphViewport,
} from './AtlasGraphCanvasImpl';

type ImplModule = typeof import('./AtlasGraphCanvasImpl');

let implPromise: Promise<ImplModule> | null = null;
let LoadedImpl: ImplModule['AtlasGraphCanvas'] | null = null;

function loadImpl(): Promise<ImplModule> {
	implPromise ??= import('./AtlasGraphCanvasImpl');
	return implPromise;
}

/**
 * Lazy facade over the cytoscape-backed graph canvas
 * (`AtlasGraphCanvasImpl`). cytoscape + its four layout engines
 * (fcose/cise/cola/dagre) are ~1.5MB of bundled source that only matter
 * once a graph is actually on screen; deferring their module evaluation
 * keeps plugin startup memory low (see StreamdownIsolated for the OOM
 * rationale). The canvas mounts one frame later on first use.
 */
export const AtlasGraphCanvas: React.FC<AtlasGraphCanvasProps> = (props) => {
	const [Impl, setImpl] = useState(() => LoadedImpl);
	useEffect(() => {
		if (Impl) return;
		let cancelled = false;
		void loadImpl().then((m) => {
			LoadedImpl = m.AtlasGraphCanvas;
			if (!cancelled) setImpl(() => m.AtlasGraphCanvas);
		});
		return () => {
			cancelled = true;
		};
	}, [Impl]);
	if (!Impl) {
		return (
			<div className="pktw-flex pktw-h-full pktw-min-h-[240px] pktw-w-full pktw-items-center pktw-justify-center pktw-text-sm pktw-text-pk-foreground-muted">
				{props.buildingLabel ?? 'Building graph…'}
			</div>
		);
	}
	return <Impl {...props} />;
};

AtlasGraphCanvas.displayName = 'AtlasGraphCanvasLazy';
