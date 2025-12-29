import React from 'react';
import { cn } from '@/ui/react/lib/utils';
import { formatCount } from '@/core/utils/format-utils';
import type { TokenUsageInfo } from './types';

export interface TokenUsageProps {
	usage: TokenUsageInfo;
	className?: string;
}

/**
 * Simple token usage display (similar to StatsRenderer)
 * Only shows "Used X" without progress bar or fraction
 */
export const TokenUsage: React.FC<TokenUsageProps> = ({ usage, className }) => {
	const formattedTokens = formatCount(usage.totalUsed);

	return (
		<div className={cn(
			'pktw-inline-flex pktw-items-center pktw-justify-center pktw-h-8 pktw-px-2.5 pktw-rounded-md',
			'pktw-bg-gray-100 pktw-text-[#22c55e]', // Light gray background, green text
			'pktw-text-xs pktw-font-medium',
			className
		)}>
			<span>Used {formattedTokens}</span>
		</div>
	);
};

