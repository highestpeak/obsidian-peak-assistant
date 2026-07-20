/**
 * composerStore — single owner of Composer draft state (chat-studio §8.1).
 *
 * Draft isolation keys: 'new' | 'project:<id>' | 'conversation:<id>'.
 * Switching scope saves/restores the draft for that key; nothing leaks
 * between keys (COMP-01 / DATA-04). Serializable parts persist to
 * localStorage so a reload restores text/refs/switches; in-memory File
 * attachments cannot survive reload and degrade per §12.0.
 *
 * The reply anchor (targeted follow-up, §7.8) always applies to the ACTIVE
 * key and focuses the single main Composer — message components call
 * `setReplyAnchor` + `requestComposerFocus`, never render their own input.
 */
import { create } from 'zustand';
import type { ExplicitContextRef, ModelSelection, ComposerDraftKey } from '@/core/types/chat-studio';
import { draftKeyForNew } from '@/core/types/chat-studio';

export interface ComposerReplyAnchor {
	messageId: string;
	/** Short readable summary of the message being replied to. */
	preview: string;
}

export interface ComposerDraft {
	text: string;
	explicitRefs: ExplicitContextRef[];
	replyAnchor: ComposerReplyAnchor | null;
	workflowId: string | null;
	vaultSearch: boolean;
	webSearch: boolean;
	/** Model override for NEW/PROJECT drafts (bound to conversation on first send). */
	modelOverride: ModelSelection | null;
	/** Assistant override for NEW/PROJECT drafts. */
	assistantOverride: string | null;
	/** Edit-and-resend: the user message this draft revises (§7.7). */
	revisionOfMessageId: string | null;
}

export function emptyComposerDraft(): ComposerDraft {
	return {
		text: '',
		explicitRefs: [],
		replyAnchor: null,
		workflowId: null,
		vaultSearch: false,
		webSearch: false,
		modelOverride: null,
		assistantOverride: null,
		revisionOfMessageId: null,
	};
}

interface ComposerStoreState {
	drafts: Record<ComposerDraftKey, ComposerDraft>;
	activeKey: ComposerDraftKey;
	/** Monotonic counter; the live Composer focuses its editor when it changes. */
	focusRequestId: number;
	/**
	 * In-memory File attachments per draft key. Files are not serializable —
	 * they survive scope switches within a session but not reloads (§12.0
	 * degradation rule).
	 */
	attachmentFilesByKey: Record<ComposerDraftKey, File[]>;
}

interface ComposerStoreActions {
	setActiveKey: (key: ComposerDraftKey) => void;
	getDraft: (key?: ComposerDraftKey) => ComposerDraft;
	updateDraft: (patch: Partial<ComposerDraft>, key?: ComposerDraftKey) => void;
	/** Clear the draft after a successful send (failures keep the draft). */
	clearDraft: (key?: ComposerDraftKey) => void;
	/**
	 * Move the current 'new' draft to a conversation key after first send
	 * created the conversation (draft continuity without leaking to next new chat).
	 */
	migrateDraftKey: (from: ComposerDraftKey, to: ComposerDraftKey) => void;
	setReplyAnchor: (anchor: ComposerReplyAnchor | null) => void;
	/** Append text into the active draft (starters, suggested follow-ups). */
	fillDraftText: (text: string) => void;
	addExplicitRef: (ref: ExplicitContextRef) => void;
	removeExplicitRef: (refId: string) => void;
	setAttachmentFiles: (key: ComposerDraftKey, files: File[]) => void;
	getAttachmentFiles: (key: ComposerDraftKey) => File[];
	requestComposerFocus: () => void;
	reset: () => void;
}

export type ComposerStore = ComposerStoreState & ComposerStoreActions;

// ── localStorage persistence (workspace session restore, §12.0) ────────────

const STORAGE_KEY = 'peak-assistant.composer-drafts.v1';
const MAX_PERSISTED_DRAFTS = 30;

interface PersistedShape {
	drafts: Record<string, ComposerDraft>;
}

function loadPersistedDrafts(): Record<ComposerDraftKey, ComposerDraft> {
	try {
		const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as PersistedShape;
		if (!parsed || typeof parsed.drafts !== 'object') return {};
		const out: Record<string, ComposerDraft> = {};
		for (const [key, value] of Object.entries(parsed.drafts)) {
			out[key] = { ...emptyComposerDraft(), ...value };
		}
		return out;
	} catch {
		return {};
	}
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(getDrafts: () => Record<ComposerDraftKey, ComposerDraft>): void {
	if (persistTimer) clearTimeout(persistTimer);
	persistTimer = setTimeout(() => {
		persistTimer = null;
		try {
			const drafts = getDrafts();
			const entries = Object.entries(drafts)
				.filter(([, d]) => d.text.trim() || d.explicitRefs.length > 0 || d.replyAnchor || d.workflowId || d.vaultSearch || d.webSearch || d.modelOverride || d.assistantOverride)
				.slice(-MAX_PERSISTED_DRAFTS);
			globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ drafts: Object.fromEntries(entries) }));
		} catch { /* quota/unavailable — drafts stay in-memory */ }
	}, 400);
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useComposerStore = create<ComposerStore>((set, get) => ({
	drafts: loadPersistedDrafts(),
	activeKey: draftKeyForNew(),
	focusRequestId: 0,
	attachmentFilesByKey: {},

	setActiveKey: (key) => {
		if (get().activeKey === key) return;
		set({ activeKey: key });
	},

	getDraft: (key) => {
		const k = key ?? get().activeKey;
		return get().drafts[k] ?? emptyComposerDraft();
	},

	updateDraft: (patch, key) => {
		const k = key ?? get().activeKey;
		set((s) => ({
			drafts: {
				...s.drafts,
				[k]: { ...(s.drafts[k] ?? emptyComposerDraft()), ...patch },
			},
		}));
		schedulePersist(() => get().drafts);
	},

	clearDraft: (key) => {
		const k = key ?? get().activeKey;
		set((s) => {
			const next = { ...s.drafts };
			delete next[k];
			return { drafts: next };
		});
		schedulePersist(() => get().drafts);
	},

	migrateDraftKey: (from, to) => {
		set((s) => {
			const source = s.drafts[from];
			if (!source) return s;
			const next = { ...s.drafts };
			delete next[from];
			next[to] = source;
			return { drafts: next, activeKey: s.activeKey === from ? to : s.activeKey };
		});
		schedulePersist(() => get().drafts);
	},

	setReplyAnchor: (anchor) => {
		get().updateDraft({ replyAnchor: anchor });
	},

	fillDraftText: (text) => {
		const current = get().getDraft();
		const merged = current.text ? `${current.text.replace(/\s+$/, '')}\n${text}` : text;
		get().updateDraft({ text: merged });
	},

	addExplicitRef: (ref) => {
		const current = get().getDraft();
		if (current.explicitRefs.some((r) => r.id === ref.id || (r.kind === ref.kind && r.uri === ref.uri))) return;
		get().updateDraft({ explicitRefs: [...current.explicitRefs, ref] });
	},

	removeExplicitRef: (refId) => {
		const current = get().getDraft();
		get().updateDraft({ explicitRefs: current.explicitRefs.filter((r) => r.id !== refId) });
	},

	setAttachmentFiles: (key, files) => set((s) => ({
		attachmentFilesByKey: { ...s.attachmentFilesByKey, [key]: files },
	})),

	getAttachmentFiles: (key) => get().attachmentFilesByKey[key] ?? [],

	requestComposerFocus: () => set((s) => ({ focusRequestId: s.focusRequestId + 1 })),

	reset: () => set({ drafts: {}, activeKey: draftKeyForNew(), focusRequestId: 0, attachmentFilesByKey: {} }),
}));
