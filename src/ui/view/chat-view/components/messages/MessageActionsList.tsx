import React, { useMemo } from 'react';
import { ChatMessage } from '@/service/chat/types';
import { cn } from '@/ui/react/lib/utils';
import { Copy, RefreshCw, Star, Check } from 'lucide-react';
import { MessageAction } from '@/ui/component/ai-elements';
import { formatTimestampLocale } from '@/core/utils/date-utils';

// ── Metadata helpers (assistant messages only) ────────────────────────

/**
 * Inline model badge: "provider/model" in mono text on muted background.
 */
const ModelBadge: React.FC<{ message: ChatMessage }> = ({ message }) => {
	const modelInfo = useMemo(() => {
		if (!message.model) return null;
		return `${message.provider || ''}/${message.model}`.replace(/^\//, '');
	}, [message.model, message.provider]);

	if (!modelInfo) return null;

	return (
		<span className="pktw-text-[9px] pktw-font-mono pktw-text-muted-foreground pktw-bg-muted pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-select-text">
			{modelInfo}
		</span>
	);
};

/**
 * Inline token count.
 */
const TokenBadge: React.FC<{ message: ChatMessage }> = ({ message }) => {
	const tokenCount = useMemo(() => {
		if (!message.tokenUsage) return null;
		const usage = message.tokenUsage as any;
		return usage.totalTokens ?? usage.total_tokens ??
			((usage.promptTokens ?? usage.prompt_tokens ?? 0) + (usage.completionTokens ?? usage.completion_tokens ?? 0));
	}, [message.tokenUsage]);

	if (tokenCount === null) return null;

	return (
		<span className="pktw-text-[9px] pktw-font-mono pktw-text-muted-foreground pktw-select-text">
			{tokenCount} tok
		</span>
	);
};

/**
 * Inline timestamp — short format (time only for today, date+time otherwise).
 */
const TimestampBadge: React.FC<{ message: ChatMessage }> = ({ message }) => {
	const timeStr = useMemo(() => {
		if (!message.createdAtTimestamp) return null;
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return formatTimestampLocale(message.createdAtTimestamp, userTimezone);
	}, [message.createdAtTimestamp]);

	if (!timeStr) return null;

	return (
		<span className="pktw-text-[9px] pktw-font-mono pktw-text-muted-foreground pktw-select-text">
			{timeStr}
		</span>
	);
};

/** Small separator dot between metadata items. */
const Dot: React.FC = () => (
	<span className="pktw-text-[8px] pktw-text-muted-foreground pktw-select-none">·</span>
);

/** Thin vertical separator between metadata and actions. */
const Separator: React.FC<{ className?: string }> = ({ className }) => (
	<span className={cn("pktw-w-px pktw-h-3 pktw-bg-border pktw-mx-0.5", className)} />
);

// ── Main component ────────────────────────────────────────────────────

export const MessageActionsList: React.FC<{
	message: ChatMessage;
	isLastMessage: boolean;
	isStreaming: boolean;
	copied: boolean;
	onToggleStar: (messageId: string, starred: boolean) => void;
	onCopy: () => void;
	onRegenerate: (messageId: string) => void;
}> = ({ message, isLastMessage, isStreaming, copied, onToggleStar, onCopy, onRegenerate }) => {
	if (isStreaming) return null;

	const isAssistant = message.role === 'assistant';

	// Shared hover-fade classes for action buttons
	const hoverFade = "pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity";

	// ── Assistant messages: metadata (always visible) + actions (hover-fade) ──
	if (isAssistant) {
		return (
			<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mt-1 pktw-flex-wrap">
				{/* Always-visible metadata */}
				<ModelBadge message={message} />
				<TokenBadge message={message} />
				{(message.tokenUsage || message.model) && message.createdAtTimestamp && <Dot />}
				<TimestampBadge message={message} />

				{/* Separator between metadata and actions */}
				<Separator className={hoverFade} />

				{/* Hover-fade action buttons */}
				<div className={cn("pktw-flex pktw-items-center pktw-gap-0.5", hoverFade)}>
					<MessageAction
						tooltip={copied ? 'Copied!' : 'Copy message'}
						label="Copy message"
						className="pktw-h-6 pktw-w-6 pktw-rounded"
						onClick={(e) => {
							e.stopPropagation();
							onCopy();
						}}
					>
						{copied ? (
							<Check size={16} strokeWidth={copied ? 3 : 2} />
						) : (
							<Copy size={16} strokeWidth={2} />
						)}
					</MessageAction>

					{isLastMessage && !message.isErrorMessage && (
						<MessageAction
							tooltip="Regenerate response"
							label="Regenerate response"
							className="pktw-h-6 pktw-w-6 pktw-rounded"
							onClick={async (e) => {
								e.stopPropagation();
								onRegenerate(message.id);
							}}
						>
							<RefreshCw size={16} strokeWidth={2} />
						</MessageAction>
					)}

					<MessageAction
						tooltip={message.starred ? 'Unstar message' : 'Star message'}
						label={message.starred ? 'Unstar message' : 'Star message'}
						className="pktw-h-6 pktw-w-6 pktw-rounded"
						onClick={(e) => {
							e.stopPropagation();
							onToggleStar(message.id, !message.starred);
						}}
					>
						<Star
							size={16}
							strokeWidth={2}
							className={cn(message.starred && 'pktw-fill-red-500 pktw-text-red-500')}
						/>
					</MessageAction>
				</div>
			</div>
		);
	}

	// ── User messages: copy + edit, hover-fade only ──
	return (
		<div className={cn("pktw-flex pktw-items-center pktw-gap-0.5 pktw-mt-1", hoverFade)}>
			<MessageAction
				tooltip={copied ? 'Copied!' : 'Copy message'}
				label="Copy message"
				className="pktw-h-6 pktw-w-6 pktw-rounded"
				onClick={(e) => {
					e.stopPropagation();
					onCopy();
				}}
			>
				{copied ? (
					<Check size={16} strokeWidth={copied ? 3 : 2} />
				) : (
					<Copy size={16} strokeWidth={2} />
				)}
			</MessageAction>

			<MessageAction
				tooltip={message.starred ? 'Unstar message' : 'Star message'}
				label={message.starred ? 'Unstar message' : 'Star message'}
				className="pktw-h-6 pktw-w-6 pktw-rounded"
				onClick={(e) => {
					e.stopPropagation();
					onToggleStar(message.id, !message.starred);
				}}
			>
				<Star
					size={16}
					strokeWidth={2}
					className={cn(message.starred && 'pktw-fill-red-500 pktw-text-red-500')}
				/>
			</MessageAction>
		</div>
	);
};
