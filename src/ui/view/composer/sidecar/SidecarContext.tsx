import * as React from 'react';
import type { IntelligenceRuntime, IntelligenceSessionProjection, SuggestionFinding } from '@/service/composer';
import type { ComposerTransactionHub } from '@/service/composer';
import type { SidecarConfig } from './sidecarConfig';
import { DEFAULT_SIDECAR_CONFIG } from './sidecarConfig';

/**
 * Sidecar context — the app-owned {@link IntelligenceRuntime}, the WP2 hub (for
 * the History projection + document locate), the resolved config and the host
 * link/locate callbacks. The Sidecar never constructs a runtime or reads a
 * service singleton; the app composes and injects it (WP9 ownership rule).
 */
export interface SidecarContextValue {
	runtime: IntelligenceRuntime;
	hub?: ComposerTransactionHub;
	config: SidecarConfig;
	/** Locate a target block in the document body (scroll + focus). Host-provided. */
	onLocate?: (blockId: string) => void;
	/** Open / locate a Vault source from a related material or receipt Source. */
	onOpenSource?: (path: string) => void;
}

const SidecarContext = React.createContext<SidecarContextValue | null>(null);

export const SidecarProvider: React.FC<{ value: SidecarContextValue; children: React.ReactNode }> = ({
	value,
	children,
}) => <SidecarContext.Provider value={value}>{children}</SidecarContext.Provider>;

export function useSidecar(): SidecarContextValue {
	const value = React.useContext(SidecarContext);
	if (!value) throw new Error('useSidecar must be used inside <IntelligenceSidecar>');
	return value;
}

/** Fallback config so the context always has strings even before the JSON resolves. */
export const SIDECAR_FALLBACK_CONFIG: SidecarConfig = DEFAULT_SIDECAR_CONFIG;

/** Subscribe to the shared finding store as a React external store. */
export function useFindings(runtime: IntelligenceRuntime): readonly SuggestionFinding[] {
	const subscribe = React.useCallback(
		(cb: () => void) => runtime.findings.subscribe(() => cb()),
		[runtime],
	);
	const getSnapshot = React.useCallback(() => runtime.findings.list(), [runtime]);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribe to the Copilot session projection as a React external store. */
export function useSessionProjection(runtime: IntelligenceRuntime): IntelligenceSessionProjection {
	const ref = React.useRef<IntelligenceSessionProjection>(runtime.session.projection());
	const subscribe = React.useCallback(
		(cb: () => void) =>
			runtime.session.subscribe((p) => {
				ref.current = p;
				cb();
			}),
		[runtime],
	);
	const getSnapshot = React.useCallback(() => ref.current, []);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
