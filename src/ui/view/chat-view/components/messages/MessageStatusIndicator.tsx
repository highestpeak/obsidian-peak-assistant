/**
 * MessageStatusIndicator — inline lifecycle badge (chat-studio §7.6, MSG-06).
 *
 * Extended (Track D) to cover `queued` and `waiting-permission` states, and
 * to expose an optional Retry affordance for error/cancelled/timeout so the
 * user isn't left with a dead-end message. The Retry button just calls back
 * to the caller-supplied `onRetry` — the action registry owns the real
 * regeneration handler.
 *
 * "Completed" and undefined status render nothing (calm-by-default).
 */

import React from 'react';
import { MessageStatus } from '@/service/chat/types';
import { cn } from '@/ui/react/lib/utils';
import { Loader2, AlertCircle, XCircle, Clock, ShieldQuestion, RefreshCw } from 'lucide-react';

interface StatusVisualConfig {
	icon: React.FC<{ className?: string }>;
	label: string;
	/** Drives the per-state chip color via CSS `[data-state]` (mock parity). */
	state: 'sending' | 'streaming' | 'queued' | 'permission' | 'error' | 'cancelled' | 'timeout';
	animate?: boolean;
	/** For error/cancelled/timeout — show a Retry button next to the label. */
	allowRetry?: boolean;
}

interface MessageStatusIndicatorProps {
	status?: MessageStatus | 'queued' | 'waiting-permission';
	className?: string;
	/** Handler for the Retry button (only rendered when config.allowRetry). */
	onRetry?: () => void;
	/** Optional string overrides (for chat-studio config-driven copy). */
	labels?: Partial<Record<
		'sending' | 'streaming' | 'queued' | 'permission' | 'error' | 'cancelled' | 'timeout' | 'retry',
		string
	>>;
}

export const MessageStatusIndicator: React.FC<MessageStatusIndicatorProps> = ({
	status,
	className,
	onRetry,
	labels = {},
}) => {
	if (!status || status === MessageStatus.COMPLETED) return null;

	const config = getConfig(status, labels);
	if (!config) return null;

	const Icon = config.icon;

	// Mock `.message-state-row` — a bordered mono chip whose per-state color is
	// driven by CSS `[data-state]` (token-based, no raw Tailwind palette).
	return (
		<div className={cn('pkchat-msg-state-row', className)}>
			<span className="pkchat-msg-state" data-state={config.state}>
				<Icon className={cn('pktw-w-3 pktw-h-3', config.animate && 'pktw-animate-spin')} />
				<span>{config.label}</span>
			</span>
			{config.allowRetry && onRetry && (
				<button
					type="button"
					className="pkchat-msg-state__retry"
					onClick={onRetry}
					aria-label={labels.retry ?? 'Retry'}
					title={labels.retry ?? 'Retry'}
				>
					<RefreshCw className="pktw-w-3 pktw-h-3" />
					<span>{labels.retry ?? 'Retry'}</span>
				</button>
			)}
		</div>
	);
};

function getConfig(
	status: MessageStatus | 'queued' | 'waiting-permission',
	labels: MessageStatusIndicatorProps['labels'] = {},
): StatusVisualConfig | null {
	switch (status) {
		case MessageStatus.SENDING:
			return {
				icon: Loader2,
				label: labels.sending ?? 'Sending',
				state: 'sending',
				animate: true,
			};
		case MessageStatus.STREAMING:
			return {
				icon: Loader2,
				label: labels.streaming ?? 'Generating',
				state: 'streaming',
				animate: true,
			};
		case 'queued':
			return {
				icon: Loader2,
				label: labels.queued ?? 'Queued',
				state: 'queued',
				animate: true,
			};
		case 'waiting-permission':
			return {
				icon: ShieldQuestion,
				label: labels.permission ?? 'Permission required',
				state: 'permission',
			};
		case MessageStatus.ERROR:
			return {
				icon: AlertCircle,
				label: labels.error ?? 'Failed',
				state: 'error',
				allowRetry: true,
			};
		case MessageStatus.CANCELLED:
			return {
				icon: XCircle,
				label: labels.cancelled ?? 'Cancelled',
				state: 'cancelled',
				allowRetry: true,
			};
		case MessageStatus.TIMEOUT:
			return {
				icon: Clock,
				label: labels.timeout ?? 'Timed out',
				state: 'timeout',
				allowRetry: true,
			};
		default:
			return null;
	}
}
