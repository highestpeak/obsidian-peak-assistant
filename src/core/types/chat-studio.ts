/**
 * Chat Studio domain contracts (2026-07-15 spec §12).
 *
 * Pure types + small normalization helpers. No runtime dependencies beyond
 * core types. Persistence lives in ChatStore / sqlite repositories; UI state
 * lives in ui stores. This module is the single vocabulary both sides share.
 */

// ── Model selection ──────────────────────────────────────────────────────────

/**
 * Explicit conversation-level model selection.
 * - `auto`: follow the current default Chat/Agent binding at request time.
 * - `fixed`: locked to a concrete enabled Profile + model id.
 *
 * Auto must never be inferred from "field happens to be empty" — absence of a
 * persisted selection on a legacy conversation is normalized via
 * {@link normalizeModelSelection}.
 */
export type ModelSelection =
	| { mode: 'auto' }
	| { mode: 'fixed'; profileId: string; modelId: string };

export const AUTO_MODEL_SELECTION: ModelSelection = { mode: 'auto' };

export function isAutoSelection(sel: ModelSelection | undefined | null): boolean {
	return !sel || sel.mode === 'auto';
}

/**
 * Normalize a persisted (possibly missing/legacy) selection value.
 * Legacy conversations only carried `activeModel`/`activeProvider` strings and
 * were force-hydrated to a concrete model; for those we keep the fixed model
 * only when BOTH legacy fields are present, otherwise Auto.
 */
export function normalizeModelSelection(
	raw: unknown,
	legacy?: { activeModel?: string; activeProvider?: string }
): ModelSelection {
	if (raw && typeof raw === 'object') {
		const r = raw as Record<string, unknown>;
		if (r.mode === 'auto') return AUTO_MODEL_SELECTION;
		if (r.mode === 'fixed' && typeof r.profileId === 'string' && typeof r.modelId === 'string' && r.profileId && r.modelId) {
			return { mode: 'fixed', profileId: r.profileId, modelId: r.modelId };
		}
	}
	if (legacy?.activeModel && legacy?.activeProvider) {
		// Legacy rows have no profile id; the provider kind doubles as the
		// profile-qualified fallback until the user re-picks.
		return { mode: 'fixed', profileId: legacy.activeProvider, modelId: legacy.activeModel };
	}
	return AUTO_MODEL_SELECTION;
}

// ── Explicit context refs ────────────────────────────────────────────────────

export type ExplicitContextRefKind = 'vault-file' | 'vault-folder' | 'upload' | 'url' | 'reply';

/** One explicitly attached piece of context on a draft / turn. */
export interface ExplicitContextRef {
	id: string;
	kind: ExplicitContextRefKind;
	/** vault path, file uri, or url */
	uri: string;
	title: string;
	mimeType?: string;
	/** for kind='reply': the message being replied to */
	sourceMessageId?: string;
}

// ── Turn source scope (requested) ────────────────────────────────────────────

/** What the user ALLOWED for this turn (requested scope, set pre-send). */
export interface TurnSourceScope {
	project: { projectId: string; locked: true } | null;
	vaultSearch: boolean;
	webSearch: boolean;
	explicitRefs: ExplicitContextRef[];
}

export function emptySourceScope(projectId?: string | null): TurnSourceScope {
	return {
		project: projectId ? { projectId, locked: true } : null,
		vaultSearch: false,
		webSearch: false,
		explicitRefs: [],
	};
}

// ── Source receipt (actual) ──────────────────────────────────────────────────

/** What the runtime ACTUALLY consulted while producing the answer. */
export interface SourceReceipt {
	projectIncluded: boolean;
	vaultQueries: string[];
	vaultDocuments: Array<{ id: string; path: string; title: string }>;
	webQueries: string[];
	webSources: Array<{ id: string; url: string; title: string }>;
	/**
	 * B2 (plan §5.3.3): assistant `knowledgeRefs` and composer explicit refs
	 * that were actually reached (file existed / URL survived processing).
	 * `requestedSources.explicitRefs` is the user-side request; this list is
	 * the runtime's honest report of which of those actually made it into
	 * the prompt/attachments pipe. Empty array = nothing consulted, missing
	 * legacy receipts default to `[]` on read.
	 */
	explicitRefsUsed: ExplicitContextRef[];
}

export function emptySourceReceipt(): SourceReceipt {
	return {
		projectIncluded: false,
		vaultQueries: [],
		vaultDocuments: [],
		webQueries: [],
		webSources: [],
		explicitRefsUsed: [],
	};
}

// ── Turn relationships ───────────────────────────────────────────────────────

export interface ChatTurnRelationship {
	messageId: string;
	replyToMessageId?: string;
	branchFromMessageId?: string;
	revisionOfMessageId?: string;
}

// ── Turn execution receipt ───────────────────────────────────────────────────

export type TurnExecutionStatus =
	| 'queued'
	| 'sending'
	| 'streaming'
	| 'waiting-permission'
	| 'completed'
	| 'error'
	| 'cancelled'
	| 'timeout';

export interface TurnReceiptError {
	code: string;
	message: string;
	recoverable: boolean;
}

/**
 * Persisted per-turn execution receipt: proves which model / assistant /
 * sources / workflow actually served the request. Written when the turn
 * starts (status='sending') and finalized on completion/failure.
 */
export interface TurnExecutionReceipt {
	requestId: string;
	/** assistant message id this receipt belongs to */
	messageId: string;
	conversationId: string;
	runId?: string;
	effectiveModel: { profileId?: string; provider: string; modelId: string };
	/**
	 * COMP-05 (2026-07-21): the ModelSelection persisted on the conversation
	 * at request time — `{ mode: 'auto' }` or `{ mode: 'fixed', ... }`.
	 * Separate from `effectiveModel` so a reload can prove Auto stayed Auto
	 * even though the runtime routed it to a concrete model this turn.
	 */
	requestedSelection?: ModelSelection;
	/**
	 * COMP-05: which precedence step actually served this turn. Mirrors
	 * {@link EffectiveModelResolution.source} in the assistantResolver so
	 * receipt readers don't have to look at the debug run to know whether
	 * this was a fixed pick, assistant-preferred pick, Auto route, or the
	 * `auto-default` fallback used when routing couldn't apply.
	 */
	modelSource?: 'conversation-fixed' | 'assistant-preferred' | 'auto-routed' | 'auto-default';
	/**
	 * COMP-05: short reason string from the Auto router. Present when
	 * `modelSource === 'auto-routed'` (or when routing attempted a fallback).
	 * Never a chain-of-thought dump — 1–2 clauses at most, e.g.
	 * "attachments include an image; picked Claude Sonnet".
	 */
	routeReason?: string;
	/**
	 * COMP-05: machine-readable capability list the router treated as
	 * required. `['vision']`, `['tools']`, `['vision','pdfInput']`, etc.
	 */
	requiredCapabilities?: string[];
	assistantId?: string;
	workflowId?: string;
	requestedSources: TurnSourceScope;
	actualSources: SourceReceipt;
	status: TurnExecutionStatus;
	artifactIds: string[];
	startedAt: number;
	finishedAt?: number;
	error?: TurnReceiptError;
}

// ── Artifact receipt (Chat view contract over ArtifactPort) ─────────────────

export type ChatArtifactKind =
	| 'image' | 'document' | 'table' | 'dataset' | 'code' | 'diff' | 'diagram'
	| 'drawing' | 'canvas' | 'base' | 'bundle' | 'audio' | 'video' | 'custom'
	// Chat Studio zero-gap Track D (2026-07-21): structured artifact_create
	// tool outputs. `dataview` = Dataview query note; `extract` = user-editable
	// extract Markdown; `reminder` = persisted reminder note the app-owned
	// ReminderSchedulerService watches. `drawing` (already listed) covers
	// Excalidraw / draw.io files.
	| 'dataview' | 'extract' | 'reminder';

export type ChatArtifactState =
	| 'pending' | 'generating' | 'awaiting-confirmation' | 'needs-permission' | 'needs-configuration' | 'ready'
	| 'saving' | 'saved' | 'failed' | 'cancelled' | 'stale';

export type ChatArtifactAction =
	| 'preview' | 'open' | 'save' | 'download' | 'copy' | 'edit' | 'apply' | 'retry' | 'review'
	| 'confirm' | 'cancel' | 'configure'
	/** Zero-gap §4 A1 — prefill the Composer Edit-image form with THIS receipt
	 * as the base reference. UI-only (not persisted by the service) — the
	 * MessageViewItem injects it into `availableActions` for saved images. */
	| 'insert-as-reference';

export interface ChatArtifactReceipt {
	artifactId: string;
	runId: string;
	messageId: string;
	conversationId: string;
	projectId?: string;
	direction: 'input' | 'generated';
	kind: ChatArtifactKind;
	title: string;
	uri?: string;
	contentType?: string;
	preview?: { kind: 'image' | 'text' | 'document' | 'code' | 'none'; uri?: string; text?: string };
	vaultPath?: string;
	externalUri?: string;
	version?: number;
	sourceIds?: string[];
	state: ChatArtifactState;
	/** Computed by port/capability adapters — never guessed by UI. */
	availableActions: ChatArtifactAction[];
	createdAt: number;
	error?: TurnReceiptError;
}

// ── Assistant definition ─────────────────────────────────────────────────────

export interface AssistantToolPolicy {
	allow: string[];
	deny: string[];
	approval: 'always' | 'writes' | 'never';
}

/** Durable, user-owned reusable Assistant. NOT a Provider Profile rename. */
export interface ChatAssistantDefinition {
	id: string;
	name: string;
	summary: string;
	instructions: string;
	knowledgeRefs: ExplicitContextRef[];
	toolPolicy: AssistantToolPolicy;
	preferredModel?: { profileId: string; modelId: string };
	createdAt: number;
	updatedAt: number;
	archived?: boolean;
}

export const DEFAULT_ASSISTANT_ID = 'default';

export function defaultToolPolicy(): AssistantToolPolicy {
	return { allow: [], deny: [], approval: 'writes' };
}

// ── Project plans ────────────────────────────────────────────────────────────

export type ProjectPlanStatus = 'planned' | 'active' | 'blocked' | 'done' | 'archived';

export type ProjectPlanSource =
	| { kind: 'conversation'; conversationId: string }
	| { kind: 'vault'; path: string };

/** Durable project-level plan reference (conversation- or Vault-backed). */
export interface ProjectPlanRef {
	id: string;
	projectId: string;
	title: string;
	status: ProjectPlanStatus;
	source: ProjectPlanSource;
	progress?: { completed: number; total: number };
	updatedAt: number;
}

export const PROJECT_PLAN_STATUSES: ProjectPlanStatus[] = ['planned', 'active', 'blocked', 'done', 'archived'];

// ── Conversation UI meta (persisted in chat_conversation.meta_json) ─────────

/**
 * Durable per-conversation UI meta. Merged into ChatConversationMeta on read;
 * packed into meta_json on write. All fields optional for backward compat.
 */
export interface ChatConversationUiMeta {
	assistantId?: string;
	modelSelection?: ModelSelection;
	pinned?: boolean;
	pinnedAt?: number;
}

// ── Draft keys ───────────────────────────────────────────────────────────────

/** Draft isolation key: 'new' | 'project:<id>' | 'conversation:<id>' */
export type ComposerDraftKey = string;

export function draftKeyForNew(): ComposerDraftKey { return 'new'; }
export function draftKeyForProject(projectId: string): ComposerDraftKey { return `project:${projectId}`; }
export function draftKeyForConversation(conversationId: string): ComposerDraftKey { return `conversation:${conversationId}`; }
