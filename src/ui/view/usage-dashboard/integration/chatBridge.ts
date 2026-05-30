/**
 * chatBridge.ts — SHAPE MIRROR of the chat-side integration API.
 *
 * This file documents the API that the chat worktree exposes (or will expose)
 * for surfaces such as the Usage Dashboard to embed renderers into the chat
 * view. The actual production implementation lives in the chat worktree at
 * `src/ui/view/chat-view/integration/` (post PR-Chat-4).
 *
 * Dashboard worktree is based on master @ `a459578` (pre PR-Chat-4), so we
 * cannot yet import from the chat-side module. Instead we declare the same
 * registry surface here and let chat code call into it when it lands on
 * master. Once chat-retained merges, the consumer-side wiring inside chat
 * (e.g. `MessageReceiptSlot.tsx`) should call `getMessageReceiptRenderer()`
 * from this file (or, equivalently, the chat-side mirror).
 *
 * TODO(post-merge): when chat-retained branch merges to master, decide whether
 * to keep this file as the canonical registry (Dashboard owns the slot) or
 * collapse the duplication by importing from `@/ui/view/chat-view/integration`.
 * Recommended: keep ownership here — Dashboard is the producer of these
 * renderers; chat is just the host that calls `get*Renderer()` at render time.
 */
import type { ReactNode } from 'react';

// ── Inline receipt slot (load-bearing for Dashboard carrier A) ──────────────

export interface MessageReceiptSlotProps {
	/** Chat message id. Used to look up the matching `usage_log` row. */
	messageId: string;
	/** Chat session id. Scopes the lookup so a re-used message_id from a
	 *  different session does not bleed across. */
	sessionId: string;
	/** Optional precomputed `usage_log.id`. When the chat side has it on hand
	 *  (e.g. from its own metadata) it can pass it through to skip the
	 *  message_id → row lookup. */
	usageLogId: number | null;
}

type MessageReceiptRenderer = (props: MessageReceiptSlotProps) => ReactNode;

let messageReceiptRegistered: MessageReceiptRenderer | null = null;

/** Called from `main.ts` to wire the InlineReceipt component into the slot. */
export function registerMessageReceiptRenderer(r: MessageReceiptRenderer): void {
	messageReceiptRegistered = r;
}

/** Called from chat-view's message renderer to look up the registered slot. */
export function getMessageReceiptRenderer(): MessageReceiptRenderer | null {
	return messageReceiptRegistered;
}

// ── Composer slot (Dashboard carrier C — context ring) ──────────────────────
//
// TODO(chat worktree): chat side should add a call to
// `getComposerSlotRenderer()` in `ComposerRetained.tsx` (or whatever owns the
// composer chrome) — mirror the message receipt slot pattern. For now this is
// a no-op since chat-retained has not yet wired it up.

type ComposerSlotRenderer = () => ReactNode;

let composerSlotRegistered: ComposerSlotRenderer | null = null;

export function registerComposerSlotRenderer(r: ComposerSlotRenderer): void {
	composerSlotRegistered = r;
}

export function getComposerSlotRenderer(): ComposerSlotRenderer | null {
	return composerSlotRegistered;
}

// ── Context utilization (Dashboard carrier C — context ring) ────────────────
//
// Stub: dashboard reads via React hook; chat side provides the real
// implementation. When chat lands on master, replace this with a re-export
// from chat's hook (`@/ui/view/chat-view/integration/useCurrentContextUtilization`).

export interface ContextUtilization {
	used: number;
	max: number;
	ratio: number;
}

// In-memory snapshot so chat-side code can push updates without React state.
let currentUtilization: ContextUtilization = { used: 0, max: 0, ratio: 0 };
const utilizationSubscribers = new Set<() => void>();

/** Chat-side calls this when context usage changes (e.g. after a turn). */
export function setCurrentContextUtilization(next: ContextUtilization): void {
	currentUtilization = next;
	utilizationSubscribers.forEach((fn) => {
		try { fn(); } catch { /* ignore subscriber errors */ }
	});
}

export function getCurrentContextUtilization(): ContextUtilization {
	return currentUtilization;
}

export function subscribeContextUtilization(fn: () => void): () => void {
	utilizationSubscribers.add(fn);
	return () => { utilizationSubscribers.delete(fn); };
}
