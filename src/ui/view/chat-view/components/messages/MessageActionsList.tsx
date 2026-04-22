import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { ChatMessage } from '@/service/chat/types';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { cn } from '@/ui/react/lib/utils';
import { Copy, RefreshCw, Star, Check } from 'lucide-react';
import {
	MessageActions,
	MessageAction,
} from '@/ui/component/ai-elements';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/component/shared-ui/tooltip';
import { Button } from '@/ui/component/shared-ui/button';
import { formatTimestampLocale } from '@/core/utils/date-utils';
import { SafeModelIcon, SafeProviderIcon } from '@/ui/component/mine/SafeIconWrapper';
import { modelRegistry } from '@/core/providers/model-registry';

/**
 * Component for displaying model/provider icon with tooltip
 */
const ModelIconButton: React.FC<{
	message: ChatMessage;
}> = ({ message }) => {
	const { manager } = useServiceContext();
	const [copied, setCopied] = useState(false);
	const [modelIcon, setModelIcon] = useState<string | null>(null);
	const [providerIcon, setProviderIcon] = useState<string | null>(null);

	const modelInfo = useMemo(() => {
		if (!message.model) return null;
		return `${message.provider || ''}/${message.model}`.replace(/^\//, '');
	}, [message.model, message.provider]);

	// Get provider and model icons
	useEffect(() => {
		if (!message.provider || !message.model || !manager) {
			setModelIcon(null);
			setProviderIcon(null);
			return;
		}

		const loadIcons = async () => {
			try {
				// Get provider metadata
				const providerMetadata = modelRegistry.getAllProviderMetadata();
				const providerMeta = providerMetadata.find(m => m.id === message.provider);
				if (providerMeta?.icon) {
					setProviderIcon(providerMeta.icon);
				}

				// Get model metadata
				const allModels = await manager.getAllAvailableModels();
				const modelInfo = allModels.find(
					m => m.id === message.model && m.provider === message.provider
				);
				if (modelInfo?.icon) {
					setModelIcon(modelInfo.icon);
				}
			} catch (err) {
				console.error('Failed to load model/provider icons:', err);
			}
		};

		loadIcons();
	}, [message.provider, message.model, manager]);

	if (!modelInfo) return null;

	const handleCopy = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(modelInfo);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy model info:', err);
		}
	}, [modelInfo]);

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						type="button"
						className="pktw-h-6 pktw-w-6 pktw-p-0 pktw-cursor-pointer"
						onClick={handleCopy}
					>
						{modelIcon ? (
							<SafeModelIcon
								model={modelIcon}
								size={16}
								className="pktw-flex-shrink-0"
								fallback={
									providerIcon ? (
										<SafeProviderIcon
											provider={providerIcon}
											size={16}
											className="pktw-flex-shrink-0"
											fallback={<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-blue-200" title="No icon available" />}
										/>
									) : (
										<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-blue-200" title="No icon available" />
									)
								}
							/>
						) : providerIcon ? (
							<SafeProviderIcon
								provider={providerIcon}
								size={16}
								className="pktw-flex-shrink-0"
								fallback={<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-blue-200" title="No icon available" />}
							/>
						) : (
							<div className="pktw-w-4 pktw-h-4 pktw-rounded pktw-bg-blue-200" title="No icon available" />
						)}
						<span className="pktw-sr-only">Model: {modelInfo}</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent
					className="pktw-select-text"
					side="top"
					align="start"
					sideOffset={4}
					onPointerDown={(e) => e.stopPropagation()}
				>
					<p className="pktw-select-text">{copied ? 'Copied!' : modelInfo}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

/**
 * Component for displaying token count
 */
const TokenCountButton: React.FC<{
	message: ChatMessage;
}> = ({ message }) => {
	const [copied, setCopied] = useState(false);
	const tokenCount = useMemo(() => {
		if (!message.tokenUsage) return null;
		const usage = message.tokenUsage as any;
		return usage.totalTokens ?? usage.total_tokens ??
			((usage.promptTokens ?? usage.prompt_tokens ?? 0) + (usage.completionTokens ?? usage.completion_tokens ?? 0));
	}, [message.tokenUsage]);

	if (tokenCount === null) return null;

	const handleCopy = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(`${tokenCount} tokens`);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy token count:', err);
		}
	}, [tokenCount]);

	return (
		<Button
			variant="ghost"
			size="icon"
			type="button"
			className="pktw-h-auto pktw-w-auto pktw-px-1.5 pktw-cursor-pointer"
			onClick={handleCopy}
		>
			<span className="pktw-text-xs">
				{tokenCount} tokens{copied ? ' copied!' : ''}
			</span>
			<span className="pktw-sr-only">Token count: {tokenCount}</span>
		</Button>
	);
};

/**
 * Component for displaying time (shown on hover of MessageActions)
 */
const TimeDisplay: React.FC<{
	message: ChatMessage;
}> = ({ message }) => {
	const [copied, setCopied] = useState(false);
	const timeInfo = useMemo(() => {
		if (!message.createdAtTimestamp) return null;
		// Use user's local timezone instead of message's timezone
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const date = formatTimestampLocale(message.createdAtTimestamp, userTimezone);
		return date ? `${date} (${userTimezone})` : null;
	}, [message.createdAtTimestamp]);

	if (!timeInfo) return null;

	const handleCopy = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(timeInfo);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error('Failed to copy time info:', err);
		}
	}, [timeInfo]);

	return (
		<Button
			variant="ghost"
			size="icon"
			type="button"
			className="pktw-h-auto pktw-w-auto pktw-px-1.5 pktw-cursor-pointer"
			onClick={handleCopy}
		>
			<span className="pktw-text-xs">
				{copied ? `${timeInfo} copied!` : timeInfo}
			</span>
			<span className="pktw-sr-only">Time: {timeInfo}</span>
		</Button>
	);
};

/**
 * Component for rendering message action buttons
 */
export const MessageActionsList: React.FC<{
	message: ChatMessage;
	isLastMessage: boolean;
	isStreaming: boolean;
	copied: boolean;
	onToggleStar: (messageId: string, starred: boolean) => void;
	onCopy: () => void;
	onRegenerate: (messageId: string) => void;
}> = ({ message, isLastMessage, isStreaming, copied, onToggleStar, onCopy, onRegenerate }) => {
	const [isHovered, setIsHovered] = useState(false);

	if (isStreaming) {
		return null;
	}

	const showTime = message.role === 'assistant' && isHovered;

	return (
		<div
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			className="pktw-flex pktw-items-center pktw-gap-1"
		>
			<MessageActions>
				<MessageAction
					tooltip={message.starred ? 'Unstar message' : 'Star message'}
					label={message.starred ? 'Unstar message' : 'Star message'}
					onClick={(e) => {
						e.stopPropagation();
						onToggleStar(message.id, !message.starred);
					}}
				>
					<Star
						size={12}
						strokeWidth={2}
						className={cn(
							message.starred && 'pktw-fill-red-500 pktw-text-red-500'
						)}
					/>
				</MessageAction>

				<MessageAction
					tooltip={copied ? 'Copied!' : 'Copy message'}
					label="Copy message"
					onClick={(e) => {
						e.stopPropagation();
						onCopy();
					}}
				>
					{copied ? (
						<Check size={12} strokeWidth={copied ? 3 : 2} />
					) : (
						<Copy size={12} strokeWidth={2} />
					)}
				</MessageAction>

				{message.role === 'assistant' && isLastMessage && (
					<MessageAction
						tooltip="Regenerate response"
						label="Regenerate response"
						onClick={async (e) => {
							e.stopPropagation();
							onRegenerate(message.id);
						}}
					>
						<RefreshCw size={12} strokeWidth={2} />
					</MessageAction>
				)}

				{message.role === 'assistant' && (
					<>
						<ModelIconButton message={message} />
						<TokenCountButton message={message} />
					</>
				)}

			</MessageActions>
			{showTime && <TimeDisplay message={message} />}
		</div>
	);
};
