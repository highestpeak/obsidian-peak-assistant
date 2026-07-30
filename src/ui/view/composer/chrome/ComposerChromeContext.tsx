import * as React from 'react';
import type {
	ComposerCandidateRuntimePort,
	ComposerCapabilityProjectionPort,
	ComposerDocumentSnapshot,
	ComposerModelSelectionPort,
	ComposerNativeEmbedRendererPort,
	ComposerTransactionConfig,
} from '@/core/composer';
import { stubComposerCapabilityProjection } from '@/core/composer';
import type {
	ComposerCommentStore,
	ComposerBlockDraftGenerationPort,
	ComposerDocumentSession,
	ComposerEmbedSelectionAnchorPort,
	ComposerLinkMetadataPort,
	ComposerNativePreviewPort,
	ComposerTransactionHub,
	ImageCapabilityCoordinator,
	ComposerWorkspaceIntelligenceRuntime,
	VaultPropertyScanPort,
} from '@/service/composer';
import type { FormulaDetailGeneratorPort } from '../blocks/math/formulaDetailStore';
import type { ComposerConfig } from '@/ui/view/composer/config/composerConfig';
import type { CandidateRendererRegistry } from '@/ui/view/composer/candidates';

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
	/** App-resolved timing policy shared with the transaction hub. */
	transactionConfig?: ComposerTransactionConfig;
	projection?: ComposerCapabilityProjectionPort;
	/** App-owned model catalog for Copilot; selection is passed into the real run. */
	modelSelection?: ComposerModelSelectionPort;
	/**
	 * The candidate runtime port the streaming candidate host consumes (streaming
	 * events, accept / regenerate / variants). In production this is the SAME
	 * object as {@link projection} (the document runtime implements both ports).
	 */
	candidateRuntime?: ComposerCandidateRuntimePort;
	comments?: ComposerCommentStore;
	linkPort?: ComposerLinkMetadataPort;
	/** Vault property inventory scan for the Frontmatter property library (WP5 §8.2). */
	vaultInventory?: VaultPropertyScanPort;
	/** Formula-detail generator for the math block's bespoke detail store (WP5 §10.2). */
	formulaDetailGenerator?: FormulaDetailGeneratorPort;
	/**
	 * WP7 — per-document image coordinator. Drives the image block object-toolbar
	 * flows (paste review / AI 改图 / caption / layout) and its own candidate cards.
	 * Absent ⇒ image affordances render disabled with a reason (never fake).
	 */
	imageCoordinator?: ImageCapabilityCoordinator;
	/** Native preview loader for `.base`, `.canvas` and `.excalidraw.md` embeds. */
	nativePreviewPort?: ComposerNativePreviewPort;
	/** Host-owned renderer for real Obsidian `![[...]]` previews. */
	nativeEmbedRenderer?: ComposerNativeEmbedRendererPort;
	/** Host-owned writer for persisted Markdown embed selection anchors. */
	embedSelectionAnchorPort?: ComposerEmbedSelectionAnchorPort;
	/**
	 * App-owned preview URI resolver for image rendering, bound by app runtime via
	 * `DocumentComposerRuntime.composeEditing`. UI never resolves Obsidian paths.
	 */
	imagePreviewResolver?: (path: string, sourcePath?: string) => string;
	/** Explicit new-block generation; absent keeps the AI action disabled with a reason. */
	blockDraftGeneration?: ComposerBlockDraftGenerationPort;
	/** Workspace-lifetime scope, Work Segment and Frozen Run owner. */
	workspaceIntelligence?: ComposerWorkspaceIntelligenceRuntime;
}

export interface ComposerChromeValue {
	runtime: ComposerChromeRuntime;
	projection: ComposerCapabilityProjectionPort;
	/** Renderer registry the candidate host dispatches through (one per view). */
	candidateRegistry: CandidateRendererRegistry;
	config: ComposerConfig;
	/** Live snapshot the chrome reads for source offsets (from `source`). */
	snapshot: ComposerDocumentSnapshot | null;
	/** Typing-burst window (ms) — from the transaction config, not a constant. */
	burstWindowMs: number;
	/** INT-1 scroll-guard user-gesture window (ms) — from the transaction config. */
	scrollGuardGestureWindowMs: number;
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
