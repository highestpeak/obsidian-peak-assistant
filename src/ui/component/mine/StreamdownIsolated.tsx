import React, { useEffect, useState } from 'react';
import type { StreamdownIsolatedProps } from './StreamdownIsolatedImpl';

export type { StreamdownIsolatedProps } from './StreamdownIsolatedImpl';

/** Part name for Streamdown mermaid blocks so host CSS can target them via ::part(mermaid-container). */
export const MERMAID_PART = 'mermaid-container';

type ImplModule = typeof import('./StreamdownIsolatedImpl');

let implPromise: Promise<ImplModule> | null = null;
let LoadedImpl: ImplModule['StreamdownIsolated'] | null = null;

function loadImpl(): Promise<ImplModule> {
	implPromise ??= import('./StreamdownIsolatedImpl');
	return implPromise;
}

/**
 * Lazy facade over the real markdown renderer (`StreamdownIsolatedImpl`).
 *
 * The implementation statically imports streamdown + the full Shiki grammar
 * set + mermaid + KaTeX — ~15MB of bundled source whose module evaluation
 * costs several hundred MB of renderer memory the moment it is required.
 * On large vaults Obsidian's own startup already peaks near the renderer
 * memory ceiling, so paying that eval cost at plugin load risks a cppgc
 * OOM white-screen. Deferring the require to the first actual markdown
 * render keeps plugin startup light; the first message paints one frame
 * later at most (subsequent mounts render synchronously via the module
 * cache).
 */
export const StreamdownIsolated: React.FC<StreamdownIsolatedProps> = (props) => {
	const [Impl, setImpl] = useState(() => LoadedImpl);
	useEffect(() => {
		if (Impl) return;
		let cancelled = false;
		void loadImpl().then((m) => {
			LoadedImpl = m.StreamdownIsolated;
			if (!cancelled) setImpl(() => m.StreamdownIsolated);
		});
		return () => {
			cancelled = true;
		};
	}, [Impl]);
	if (!Impl) return <div className={props.className} style={{ display: 'block', minHeight: '1em' }} />;
	return <Impl {...props} />;
};

StreamdownIsolated.displayName = 'StreamdownIsolatedLazy';
