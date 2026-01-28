import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { motion } from 'framer-motion';

const getSizeClasses = (size: string) => {
	switch (size) {
		case 'lg':
			return 'pktw-text-sm pktw-px-3 pktw-py-1.5';
		case 'md':
			return 'pktw-text-xs pktw-px-2.5 pktw-py-1';
		case 'sm':
			return 'pktw-text-xs pktw-px-2 pktw-py-0.5';
		default:
			return 'pktw-text-xs pktw-px-2 pktw-py-1';
	}
};

const getColorClasses = (size: string) => {
	switch (size) {
		case 'lg':
			return 'pktw-bg-violet-100 pktw-text-violet-800 pktw-border-violet-300 hover:pktw-bg-violet-200';
		case 'md':
			return 'pktw-bg-violet-50 pktw-text-violet-700 pktw-border-violet-200 hover:pktw-bg-violet-100';
		case 'sm':
			return 'pktw-bg-muted pktw-text-violet-600 pktw-border-border hover:pktw-bg-violet-50';
		default:
			return 'pktw-bg-muted pktw-text-muted-foreground pktw-border-border hover:pktw-bg-violet-50';
	}
};

interface TagCloudProps {
	topics?: Array<{ label: string; weight: number }>;
}

/**
 * Tag cloud for AI search insights.
 */
export const TagCloud: React.FC<TagCloudProps> = ({ topics }) => {
	if (!topics || topics.length === 0) {
		return (
			<span className="pktw-text-xs pktw-text-[#999999]">No topics extracted yet...</span>
		);
	}

	const displayTags = topics.map((topic, index) => ({
		name: topic.label,
		count: Math.round(topic.weight * 100),
		size: index < 3 ? 'lg' : index < 6 ? 'md' : 'sm' as const,
	}));

	return (
		<div className="pktw-flex pktw-flex-wrap pktw-gap-2">
			{displayTags.map((tag, index) => (
				<motion.div
					key={index}
					initial={{ opacity: 0, y: 6, scale: 0.98 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					transition={{ duration: 0.22, delay: Math.min(0.6, index * 0.04) }}
				>
					<Button
						variant="ghost"
						className={cn(
							getSizeClasses(tag.size),
							getColorClasses(tag.size),
							'pktw-rounded-md pktw-border pktw-h-auto pktw-font-medium hover:pktw-shadow-sm active:pktw-scale-95'
						)}
						title={`Weight: ${tag.count}`}
					>
						{tag.name}
					</Button>
				</motion.div>
			))}
		</div>
	);
};


