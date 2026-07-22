/**
 * Permission ask inline card (B1 §5.2 R4).
 *
 * The Chat runtime pauses whenever a mutating tool (MCP `kind:'edit'`, future
 * media-generate) triggers a permission ask. `useStreamChat` stashes the
 * pending resolver into `chatDataStore.pendingPermissionAsk`; this card
 * reads it and forwards the user's Allow / Deny click.
 *
 * The visual is intentionally minimal — E2 will polish. The card is
 * portalled inline at the end of the message list so it sits directly under
 * the streaming assistant bubble.
 */

import React from 'react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { Button } from '@/ui/components/primitives';
import { useChatStudioStrings } from '../../chatStudioStringsContext';

export const PermissionAskCard: React.FC = () => {
	const pending = useChatDataStore((s) => s.pendingPermissionAsk);
	const strings = useChatStudioStrings();
	if (!pending) return null;

	const argsPreview =
		pending.args !== undefined
			? typeof pending.args === 'string'
				? pending.args
				: safeJson(pending.args)
			: null;

	return (
		<div
			role="dialog"
			aria-label={strings.messages.permissionTitle}
			className="pkchat-permission-ask"
		>
			<div className="pkchat-permission-ask__body">
				<span className="pkchat-permission-ask__title">
					{strings.messages.permissionTitle}
				</span>
				<span className="pkchat-permission-ask__tool">{pending.toolName}</span>
				{argsPreview ? (
					<pre className="pkchat-permission-ask__args">{truncate(argsPreview, 240)}</pre>
				) : null}
			</div>
			<div className="pkchat-permission-ask__actions">
				<Button
					variant="secondary"
					size="sm"
					onClick={() => pending.resolve('deny')}
				>
					{strings.composer.permissionDeny}
				</Button>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => pending.resolve('allow')}
				>
					{strings.composer.permissionAllowOnce}
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={() => pending.resolve('allow-for-run')}
				>
					{strings.composer.permissionAllowRun}
				</Button>
			</div>
		</div>
	);
};

function safeJson(v: unknown): string {
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}

function truncate(s: string, max: number): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
