import * as React from 'react';
import type {
	ComposerCapabilityProjectionPort,
	ComposerDocumentSnapshot,
} from '@/core/composer';
import { stubComposerCapabilityProjection } from '@/core/composer';
import type {
	ComposerCommentStore,
	ComposerDocumentSession,
	ComposerLinkMetadataPort,
	ComposerTransactionHub,
} from '@/service/composer';
import type { ComposerConfig } from '@/ui/view/composer/config/composerConfig';

/**
 * The app-composed runtime the editing chrome consumes (WP4). Everything is
 * optional so the read-only host / harness can mount `ComposerRoot` before the
 * runtimes are wired: with no `hub` the deterministic actions are disabled (not
 * fake), with the stub `projection` no AI affordances render at all.
 *
 * Ownership stays at the app layer — the chrome never constructs a hub, reads a
 * service singleton, or calls a provider. WP3 supplies the real projection port;
 * WP4 only renders whatever it projects.
 */
export interface ComposerChromeRuntime {
	session?: ComposerDocumentSession;
	hub?: ComposerTransactionHub;
	projection?: ComposerCapabilityProjectionPort;
	comments?: ComposerCommentStore;
	linkPort?: ComposerLinkMetadataPort;
}

export interface ComposerChromeValue {
	runtime: ComposerChromeRuntime;
	projection: ComposerCapabilityProjectionPort;
	config: ComposerConfig;
	/** Live snapshot the chrome reads for source offsets (from `source`). */
	snapshot: ComposerDocumentSnapshot | null;
	/** Typing-burst window (ms) — from the transaction config, not a constant. */
	burstWindowMs: number;
	/**
	 * Register an editable leaf's flush fn. Selection-based operations flush all
	 * dirty bursts before mapping DOM selection → source offsets, so offsets are
	 * never stale. Returns an unregister fn.
	 */
	registerFlusher: (flush: () => Promise<void>) => () => void;
	/** Flush every registered dirty leaf (await before selection-based ops). */
	flushAll: () => Promise<void>;
	/** Host callback for opening links (vault note / external URL). */
	onOpenLink?: (kind: 'vault' | 'external', target: string) => void;
}

const ComposerChromeContext = React.createContext<ComposerChromeValue | null>(null);

export const ComposerChromeProvider: React.FC<{
	value: ComposerChromeValue;
	children: React.ReactNode;
}> = ({ value, children }) => (
	<ComposerChromeContext.Provider value={value}>{children}</ComposerChromeContext.Provider>
);

/** Access the composer chrome runtime + config. Must be used inside ComposerRoot. */
export function useComposerChrome(): ComposerChromeValue {
	const value = React.useContext(ComposerChromeContext);
	if (!value) throw new Error('useComposerChrome must be used inside <ComposerRoot>');
	return value;
}

/** Resolve the projection port, defaulting to the empty stub (no fake AI buttons). */
export function resolveProjection(runtime: ComposerChromeRuntime): ComposerCapabilityProjectionPort {
	return runtime.projection ?? stubComposerCapabilityProjection;
}
