import React, { useMemo, useState } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { formatCount } from '@/core/utils/format-utils';
import type { TokenUsageInfo } from './types';
import type { ChatConversation } from '@/service/chat/types';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/ui/component/shared-ui/hover-card';

export interface TokenUsageProps {
	usage: TokenUsageInfo;
	conversation?: ChatConversation | null;
	className?: string;
}

interface ProviderModelUsage {
	provider: string;
	model: string;
	totalTokens: number;
	promptTokens: number;
	completionTokens: number;
}

/**
 * Calculate token usage grouped by provider and model
 */
const calculateGroupedUsage = (conversation: ChatConversation | null | undefined): ProviderModelUsage[] => {
	if (!conversation?.messages) return [];

	const usageMap = new Map<string, ProviderModelUsage>();

	conversation.messages.forEach((msg) => {
		if (!msg.tokenUsage || msg.role !== 'assistant') return;

		const key = `${msg.provider}::${msg.model}`;
		const usage = msg.tokenUsage as any;
		
		const totalTokens = usage.totalTokens ?? usage.total_tokens ??
			((usage.promptTokens ?? usage.prompt_tokens ?? 0) + (usage.completionTokens ?? usage.completion_tokens ?? 0));
		const promptTokens = usage.promptTokens ?? usage.prompt_tokens ?? 0;
		const completionTokens = usage.completionTokens ?? usage.completion_tokens ?? 0;

		if (totalTokens > 0) {
			const existing = usageMap.get(key);
			if (existing) {
				existing.totalTokens += totalTokens;
				existing.promptTokens += promptTokens;
				existing.completionTokens += completionTokens;
			} else {
				usageMap.set(key, {
					provider: msg.provider,
					model: msg.model,
					totalTokens,
					promptTokens,
					completionTokens,
				});
			}
		}
	});

	return Array.from(usageMap.values()).sort((a, b) => b.totalTokens - a.totalTokens);
};

/**
 * Simple token usage display with hover details
 */
export const TokenUsage: React.FC<TokenUsageProps> = ({ usage, conversation, className }) => {
	const formattedTokens = formatCount(usage.totalUsed);
	const groupedUsage = useMemo(() => calculateGroupedUsage(conversation), [conversation]);
	const hasDetails = groupedUsage.length > 0;
	const [isHovered, setIsHovered] = useState(false);

	const content = (
		<div
			className={cn(
				'pktw-inline-flex pktw-items-center pktw-justify-center pktw-h-8 pktw-px-2.5 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors',
				isHovered
					? 'pktw-bg-accent pktw-text-accent-foreground' // Hover state - accent colors
					: 'pktw-bg-gray-100 pktw-text-[#22c55e]', // Normal state - light gray background, green text
				'pktw-text-xs pktw-font-medium',
				className
			)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<span>Used {formattedTokens}</span>
		</div>
	);

	if (!hasDetails) {
		return content;
	}

	return (
		<HoverCard openDelay={200} closeDelay={100}>
			<HoverCardTrigger asChild>
				{content}
			</HoverCardTrigger>
			<HoverCardContent
				className="pktw-w-auto pktw-min-w-[300px] pktw-max-w-md pktw-bg-white pktw-shadow-lg pktw-border pktw-border-border"
				side="top"
				align="end"
				sideOffset={8}
			>
				<div className="pktw-space-y-3">
					<div className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-border-b pktw-border-border pktw-pb-2">
						Token Usage by Provider & Model
					</div>
					<div className="pktw-space-y-3 pktw-max-h-[400px] pktw-overflow-y-auto">
						{groupedUsage.map((item, index) => (
							<div key={`${item.provider}-${item.model}-${index}`} className="pktw-space-y-1.5 pktw-pb-2 pktw-border-b pktw-border-border last:pktw-border-0 last:pktw-pb-0">
								<div className="pktw-flex pktw-items-center pktw-justify-between">
									<div className="pktw-flex pktw-items-baseline pktw-gap-2">
										<span className="pktw-text-xs pktw-font-semibold pktw-text-foreground">
											{item.provider}
										</span>
										<span className="pktw-text-xs pktw-text-muted-foreground pktw-font-normal">
											{item.model}
										</span>
									</div>
									<span className="pktw-text-xs pktw-font-semibold pktw-text-[#22c55e]">
										{formatCount(item.totalTokens)}
									</span>
								</div>
								<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-muted-foreground pktw-pl-1">
									<span className="pktw-flex pktw-items-center pktw-gap-1">
										<span>Prompt:</span>
										<span className="pktw-font-medium">{formatCount(item.promptTokens)}</span>
									</span>
									<span className="pktw-flex pktw-items-center pktw-gap-1">
										<span>Completion:</span>
										<span className="pktw-font-medium">{formatCount(item.completionTokens)}</span>
									</span>
								</div>
							</div>
						))}
					</div>
					<div className="pktw-pt-2 pktw-border-t pktw-border-border pktw-flex pktw-items-center pktw-justify-between">
						<span className="pktw-text-sm pktw-font-semibold pktw-text-foreground">Total</span>
						<span className="pktw-text-sm pktw-font-semibold pktw-text-[#22c55e]">{formatCount(usage.totalUsed)}</span>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
};

