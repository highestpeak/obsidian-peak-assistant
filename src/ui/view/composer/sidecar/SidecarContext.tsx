import * as React from 'react';
import type {
	IntelligenceBriefProjection,
	IntelligenceRuntime,
	IntelligenceSessionProjection,
	SuggestionFinding,
} from '@/service/composer';
import type { ComposerTransactionHub } from '@/service/composer';
import type { ComposerContextSnapshot } from '@/core/composer';
import type { SidecarConfig } from './sidecarConfig';
import { DEFAULT_SIDECAR_CONFIG } from './sidecarConfig';

/** The frozen run context assembled from the current chrome focus (WP9 §12.2). */
export interface SidecarFocusContext {
	snapshot: ComposerContextSnapshot;
	targetQuote: string;
}

/** The related-material focus (query text + anchor) resolved from chrome focus. */
export interface SidecarRelatedFocus {
	anchorId: string;
	documentId: string;
	focusText: string;
	/** Human-readable label derived from the actual focused source. */
	label: string;
}

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
	/** Current Vault path, used only for explicit file-scoped presentation behavior. */
	documentFilePath?: string;
	/** Locate a target block in the document body (scroll + focus). Host-provided. */
	onLocate?: (blockId: string) => void;
	/** Locate and activate a comment source referenced by a Copilot receipt. */
	onLocateComment?: (commentId: string, blockId: string) => void;
	/** Open / locate a Vault source from a related material or receipt Source. */
	onOpenSource?: (path: string) => void;
	/** The real focused block id from chrome focus state, or null (host-provided). */
	getFocusedBlockId?: () => string | null;
	/** Assemble the frozen run context for a focus block (document fallback when null). */
	resolveFocusContext?: (focusedBlockId: string | null) => SidecarFocusContext;
	/** Resolve the related-material focus (query text + anchor) for a focus block. */
	resolveRelatedFocus?: (focusedBlockId: string | null) => SidecarRelatedFocus;
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

/** Subscribe to the document-adjacent Brief projection as a stable external store. */
export function useBriefProjection(runtime: IntelligenceRuntime): IntelligenceBriefProjection {
	const subscribe = React.useCallback(
		(cb: () => void) => runtime.brief.subscribe(() => cb()),
		[runtime],
	);
	const getSnapshot = React.useCallback(() => runtime.brief.projection(), [runtime]);
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
