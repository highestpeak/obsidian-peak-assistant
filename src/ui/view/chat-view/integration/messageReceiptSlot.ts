import type React from 'react';

/**
 * messageReceiptSlot — pluggable slot that lets external packages (e.g. the
 * Usage Dashboard worktree) inject an inline cost/duration/feedback receipt
 * into every chat message without the chat view needing to know about them.
 *
 * Registration shape mirrors the headless-extension pattern used elsewhere in
 * the plugin: chat owns the render position, the consumer owns what to draw.
 * Until a consumer registers a renderer, the slot collapses (no React null
 * round-trip) so the chat surface stays untouched.
 *
 * Contract (PR-Chat-4, spec §11.6):
 *   - `usageLogId` is the row PK of the `usage_log` entry that captured this
 *     message's cost/tokens. It is `null` until the chat-side metadata-write
 *     plumbing lifts the PK through `chat_messages` (gap documented in the
 *     PR-Chat-4 commit; will land alongside the Dashboard worktree's
 *     usage_log → message join).
 *   - `sessionId` is the conversation id (matches `usage_log.session_id`).
 *   - Renderer is invoked once per assistant message, after the message body
 *     and before the meta/action row.
 */

export interface MessageReceiptSlotProps {
	messageId: string;
	sessionId: string;
	usageLogId: number | null;
}

type Renderer = (props: MessageReceiptSlotProps) => React.ReactNode;

let registered: Renderer | null = null;

/** Register a renderer. Returns an unregister fn for symmetry / hot-reload. */
export function registerMessageReceiptRenderer(renderer: Renderer): () => void {
	registered = renderer;
	return () => {
		if (registered === renderer) registered = null;
	};
}

/** Return the active renderer, or null if no consumer is wired in. */
export function getMessageReceiptRenderer(): Renderer | null {
	return registered;
}
