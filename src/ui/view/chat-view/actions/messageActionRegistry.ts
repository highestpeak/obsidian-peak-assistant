/**
 * messageActionRegistry — central, typed registry of per-message actions
 * (chat-studio §12.3, MSG-07..09).
 *
 * A single registry drives both the inline meta-row buttons and the
 * More popover. Every action carries:
 *   • id              — stable string; drives icon/label lookup and telemetry
 *   • priority        — higher = shown inline first; lower demotes to More first
 *   • persistent      — assistant "core five"; never leaves inline even when narrow
 *   • applicable(...)  — pure filter deciding whether the action is offered at all
 *   • execute(ctx)    — the real handler; UI never contains a duplicate handler
 *   • destructive     — routes to the More popover destructive group with confirm
 *   • variant         — 'assistant' | 'user' | 'both' (defaults to 'assistant')
 *
 * NEW rule (from spec §7.7): Trace uses ONLY message.debugRunId. When no
 * trace exists we still render the core slot but mark it disabled with a
 * tooltip from strings.noTraceReason. There is NO getLastDebugRunId fallback.
 *
 * `computeActionLayout` is pure and unit-tested. It never demotes a
 * persistent action and never emits an adaptive action into both inline
 * and overflow lists.
 */

import type React from 'react';
import type { ChatMessage } from '@/service/chat/types';
import type { ChatStudioStrings } from '@/ui/view/chat-view/chatStudioStrings';

// ── Context passed into every action executor ────────────────────────────────

/**
 * Runtime context for action applicability + execution. UI-agnostic — no
 * React state hooks or DOM refs. All side-effects go through methods.
 */
export interface MessageActionContext {
	message: ChatMessage;
	/** Copy the given text to the clipboard; returns whether it succeeded. */
	copyText(text: string): Promise<boolean>;
	/**
	 * Called by Trace action — opens the message's real trace/debug surface
	 * (the inline AgentTrace anchored on the assistant bubble). ctx.message
	 * .debugRunId is the ONLY source used to decide "is trace available";
	 * the actual UI surfacing (expand + scroll) is owned by the runtime
	 * hook the caller wires in. Copy JSON is a separate lower-priority
	 * action in the More menu and is unaffected by this call.
	 */
	openTraceSurface(runId: string): void;
	/**
	 * Copy the JSON payload of a debug run to the clipboard. Bound to the
	 * "Copy trace JSON" secondary action in the More menu — kept separate
	 * from Trace so the primary Trace click is a navigation, not a
	 * clipboard side-effect.
	 */
	copyDebugTrace(runId: string): Promise<void>;
	/** Called by Star / Unstar. */
	toggleStar(): Promise<void>;
	/** Called by Retry / Regenerate. */
	regenerate(): Promise<void>;
	/** Called by Branch. */
	branch(): Promise<void>;
	/** Save to Vault — resolves with the vault path when successful. */
	saveToVault(): Promise<string | null>;
	/**
	 * Open the raw-message modal. UI owns the modal state; registry only
	 * signals that the user requested it.
	 */
	openRawModal(): void;
	/**
	 * Set the reply anchor on the main Composer and focus it. Used by
	 * targeted-follow-up (assistant) and by suggested-next chips.
	 */
	requestReplyToMessage(): void;
	/**
	 * Edit-and-resend: fill the main Composer draft with the original
	 * user text and mark revisionOfMessageId. UI focuses the composer.
	 * Only applicable to user messages.
	 */
	requestEditResend(): void;
}

export type MessageActionVariant = 'assistant' | 'user' | 'both';

/** One registry entry. */
export interface MessageActionDefinition {
	id: string;
	variant: MessageActionVariant;
	/** Higher priority is preferred for inline placement. */
	priority: number;
	/** Persistent core actions never demote to More. */
	persistent: boolean;
	/** Destructive actions always go to More's destructive group with confirm. */
	destructive?: boolean;
	/**
	 * Always lives in the More popover (regular group), never inline, regardless
	 * of width — for debug-grade affordances the user rarely reaches for (Trace).
	 * Unlike `destructive`, it does not gate behind a confirm dialog.
	 */
	overflowOnly?: boolean;
	/**
	 * When set, this action is a SUB-action of the parent action id: it never
	 * renders as a standalone row button (inline or overflow) and instead
	 * surfaces inside the parent's hover menu (e.g. Copy Markdown / Copy JSON
	 * hang under `copy`). `computeActionLayout` drops sub-actions entirely.
	 */
	subOf?: string;
	/** Icon component (Lucide) — UI renders it inside a button. */
	icon: React.ComponentType<{ className?: string }>;
	/** Pure applicability check — runs against the message only. */
	applicable(message: ChatMessage): boolean;
	/** Human label — read from chat-studio strings. */
	label(strings: ChatStudioStrings): string;
	/**
	 * Optional one-line detail shown under the label in the More popover
	 * (mock `.message-action-menu` two-line item). Inline rows never show it.
	 */
	detail?(strings: ChatStudioStrings): string;
	/**
	 * Disabled reason (tooltip) when the action is applicable but not
	 * currently executable (e.g. Trace with no debugRunId). Returning
	 * null means the action is enabled.
	 */
	disabledReason?(message: ChatMessage, strings: ChatStudioStrings): string | null;
	execute(ctx: MessageActionContext): Promise<void> | void;
}

// ── Action definitions ───────────────────────────────────────────────────────

const isAssistant = (m: ChatMessage) => m.role === 'assistant';
const isUser = (m: ChatMessage) => m.role === 'user';

/**
 * Persistent core (assistant): Copy, Retry, Star, Branch.
 * Priorities within core are fixed high so ordering is deterministic —
 * they never demote regardless of width. Trace is a debug affordance and
 * lives in the More popover (overflowOnly), not the core row. Copy is a
 * split button: a plain-text click plus a hover menu of Copy Markdown /
 * Copy JSON sub-actions.
 */
import { Copy, GitBranch, RefreshCw, Star, Bug, FilePlus2, Code, FileJson, MessageSquare, Pencil } from 'lucide-react';

const CORE_BASE = 10000;

const ACTIONS: MessageActionDefinition[] = [
	{
		id: 'copy',
		variant: 'both',
		priority: CORE_BASE + 5,
		persistent: true,
		icon: Copy,
		applicable: () => true,
		label: (s) => s.messages.actionCopy,
		execute: async (ctx) => {
			await ctx.copyText(String(ctx.message.content ?? ''));
		},
	},
	{
		id: 'retry',
		variant: 'assistant',
		priority: CORE_BASE + 4,
		persistent: true,
		icon: RefreshCw,
		applicable: isAssistant,
		label: (s) => s.messages.actionRetry,
		execute: async (ctx) => {
			await ctx.regenerate();
		},
	},
	{
		id: 'star',
		variant: 'assistant',
		priority: CORE_BASE + 3,
		persistent: true,
		icon: Star,
		applicable: isAssistant,
		// Label toggles between star/unstar at render time via ActionButton
		// reading `message.starred`; registry keeps it simple.
		label: (s) => s.messages.actionStar,
		execute: async (ctx) => {
			await ctx.toggleStar();
		},
	},
	{
		id: 'branch',
		variant: 'both',
		priority: CORE_BASE + 2,
		persistent: true,
		icon: GitBranch,
		applicable: () => true,
		label: (s) => s.messages.actionBranch,
		execute: async (ctx) => {
			await ctx.branch();
		},
	},
	// Adaptive assistant actions — priority high → low.
	{
		id: 'targeted-follow-up',
		variant: 'assistant',
		priority: 500,
		persistent: false,
		icon: MessageSquare,
		applicable: isAssistant,
		label: (s) => s.messages.actionFollowUp,
		detail: (s) => s.messages.actionFollowUpDetail,
		execute: (ctx) => ctx.requestReplyToMessage(),
	},
	{
		id: 'save-to-vault',
		variant: 'assistant',
		priority: 400,
		persistent: false,
		icon: FilePlus2,
		applicable: isAssistant,
		label: (s) => s.messages.actionSaveToVault,
		detail: (s) => s.messages.actionSaveToVaultDetail,
		execute: async (ctx) => {
			await ctx.saveToVault();
		},
	},
	{
		id: 'view-raw',
		variant: 'both',
		priority: 300,
		persistent: false,
		icon: Code,
		applicable: () => true,
		label: (s) => s.messages.actionViewRaw,
		detail: (s) => s.messages.actionViewRawDetail,
		execute: (ctx) => ctx.openRawModal(),
	},
	// Copy Markdown / Copy JSON are SUB-actions of Copy: they never render as
	// standalone row buttons — hovering the Copy button reveals them. A plain
	// Copy click copies the message text; these keep structure / raw payload.
	{
		id: 'copy-markdown',
		variant: 'both',
		priority: 200,
		persistent: false,
		subOf: 'copy',
		icon: Copy,
		applicable: () => true,
		label: (s) => s.messages.actionCopyMarkdown,
		detail: (s) => s.messages.actionCopyMarkdownDetail,
		execute: async (ctx) => {
			await ctx.copyText(buildCanonicalMarkdown(ctx.message));
		},
	},
	{
		id: 'copy-json',
		variant: 'both',
		priority: 100,
		persistent: false,
		subOf: 'copy',
		icon: FileJson,
		applicable: () => true,
		label: (s) => s.messages.actionCopyJson,
		detail: (s) => s.messages.actionCopyJsonDetail,
		execute: async (ctx) => {
			await ctx.copyText(JSON.stringify(ctx.message, null, 2));
		},
	},
	// Trace — debug affordance; the user rarely reaches for it, so it lives in
	// the More popover (overflowOnly), grouped with Copy trace JSON at the
	// bottom. Navigation-only: opens the inline AgentTrace, no clipboard.
	{
		id: 'trace',
		variant: 'assistant',
		priority: 60,
		persistent: false,
		overflowOnly: true,
		icon: Bug,
		applicable: isAssistant,
		label: (s) => s.messages.actionTrace,
		detail: (s) => s.messages.actionTraceDetail,
		disabledReason: (m, s) => (m.debugRunId ? null : s.messages.noTraceReason),
		execute: (ctx) => {
			if (!ctx.message.debugRunId) return;
			ctx.openTraceSurface(ctx.message.debugRunId);
		},
	},
	// Copy trace JSON — secondary to Trace; only surfaces when the message
	// actually has a debugRunId, and stays low-priority so it always lives
	// inside the More popover.
	{
		id: 'copy-trace-json',
		variant: 'assistant',
		priority: 50,
		persistent: false,
		icon: FileJson,
		applicable: (m) => Boolean(m.debugRunId),
		label: (s) => s.messages.actionCopyTraceJson,
		detail: (s) => s.messages.actionCopyTraceJsonDetail,
		execute: async (ctx) => {
			if (!ctx.message.debugRunId) return;
			await ctx.copyDebugTrace(ctx.message.debugRunId);
		},
	},

	// User-only actions.
	{
		id: 'edit-resend',
		variant: 'user',
		priority: CORE_BASE + 4,
		persistent: true,
		icon: Pencil,
		applicable: isUser,
		label: (s) => s.messages.actionEditResend,
		execute: (ctx) => ctx.requestEditResend(),
	},

];

/** Returns actions applicable to `message` — filtered by role variant. */
export function getApplicableActions(message: ChatMessage): MessageActionDefinition[] {
	return ACTIONS.filter((a) => {
		if (a.variant === 'assistant' && message.role !== 'assistant') return false;
		if (a.variant === 'user' && message.role !== 'user') return false;
		return a.applicable(message);
	});
}

// ── Layout algorithm (pure, unit-tested) ─────────────────────────────────────

export interface ActionLayout {
	/** Actions to render inline in the meta row (highest priority first). */
	inline: MessageActionDefinition[];
	/** Actions demoted to the More popover, in the original priority order. */
	overflow: MessageActionDefinition[];
}

/**
 * Pure width-driven demotion of adaptive actions into the More popover.
 *
 * Rules:
 *   1. Persistent actions ALWAYS render inline (independent of width).
 *   2. Destructive actions ALWAYS render in overflow (never inline).
 *   3. Adaptive actions fit as many as possible, keeping the highest
 *      priority ones inline. Lowest-priority demote first.
 *   4. Reserves space for the More trigger when at least one adaptive action
 *      must be demoted. The More trigger is a compact icon-only button
 *      (mock ⋯ ≈ 24-28px), NOT a full action slot, so `moreTriggerPx`
 *      defaults to `perActionWidthPx` (legacy "reserve one action") but the
 *      UI passes the real ⋯ width so wide rows inline one more adaptive.
 *
 * `perActionWidthPx` is measured/estimated by the UI; `availableWidthPx` is
 * the usable row width after subtracting the persistent core + left meta.
 */
export function computeActionLayout(
	availableWidthPx: number,
	actions: MessageActionDefinition[],
	perActionWidthPx: number,
	moreTriggerPx: number = perActionWidthPx,
): ActionLayout {
	// Sub-actions (Copy Markdown / Copy JSON) never render as standalone row
	// buttons — they live inside their parent's hover menu — so drop them from
	// the layout entirely before partitioning.
	const sorted = [...actions]
		.filter((a) => !a.subOf)
		.sort((a, b) => b.priority - a.priority);
	const persistent = sorted.filter((a) => a.persistent);
	const destructive = sorted.filter((a) => a.destructive);
	// overflowOnly actions (Trace) always live in the More popover, never
	// inline, regardless of width. They render in the regular (non-destructive)
	// group, interleaved with demoted adaptives by priority.
	const overflowForced = sorted.filter(
		(a) => a.overflowOnly && !a.persistent && !a.destructive,
	);
	const adaptive = sorted.filter(
		(a) => !a.persistent && !a.destructive && !a.overflowOnly,
	);

	// Regular overflow = demoted adaptives + always-overflow actions, kept in
	// descending priority order; destructive always trails at the very end.
	const buildOverflow = (overflowAdaptive: MessageActionDefinition[]): MessageActionDefinition[] => {
		const regular = [...overflowAdaptive, ...overflowForced].sort((a, b) => b.priority - a.priority);
		return [...regular, ...destructive];
	};

	// Guard: nonsense inputs -> keep every inline-eligible action inline so we
	// never lose actions from a broken measurement. overflowForced + destructive
	// still route to the popover (they are never inline-eligible).
	if (!Number.isFinite(availableWidthPx) || availableWidthPx <= 0 || perActionWidthPx <= 0) {
		return { inline: [...persistent, ...adaptive], overflow: buildOverflow([]) };
	}

	// How many adaptive fit without a More trigger?
	const fitsWithoutMore = Math.max(0, Math.floor(availableWidthPx / perActionWidthPx));
	const needsMore =
		fitsWithoutMore < adaptive.length || destructive.length > 0 || overflowForced.length > 0;
	if (!needsMore) {
		// Everything fits inline, no More needed.
		return { inline: [...persistent, ...adaptive], overflow: [] };
	}

	// We WILL need a More button (demoted adaptives, overflowOnly, or
	// destructive). Reserve only the ⋯ trigger's real width for it.
	const fitsWithMore = Math.max(0, Math.floor((availableWidthPx - moreTriggerPx) / perActionWidthPx));
	const inlineAdaptive = adaptive.slice(0, fitsWithMore);
	const overflowAdaptive = adaptive.slice(fitsWithMore);

	return {
		inline: [...persistent, ...inlineAdaptive],
		overflow: buildOverflow(overflowAdaptive),
	};
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the canonical markdown for "Copy Markdown". Includes reasoning +
 * tool-call sections when present so the copied artefact matches how the
 * assistant message renders. NOT the same as the raw JSON payload.
 */
export function buildCanonicalMarkdown(message: ChatMessage): string {
	const parts: string[] = [];
	if (message.reasoning?.content) {
		parts.push('> **Reasoning**', '', message.reasoning.content, '');
	}
	if (message.toolCalls && message.toolCalls.length > 0) {
		parts.push('> **Tool calls**', '');
		for (const call of message.toolCalls) {
			const inputStr = typeof call.input === 'string' ? call.input : safeJson(call.input);
			parts.push(`- \`${call.toolName}\`` + (inputStr ? `: ${inputStr}` : ''));
		}
		parts.push('');
	}
	parts.push(String(message.content ?? ''));
	return parts.join('\n');
}

function safeJson(v: unknown): string {
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}
