import React from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';

const tags = [
	{ name: 'Neural Networks', count: 18, size: 'lg' },
	{ name: 'Deep Learning', count: 15, size: 'lg' },
	{ name: 'Python', count: 12, size: 'md' },
	{ name: 'TensorFlow', count: 10, size: 'md' },
	{ name: 'AI', count: 9, size: 'md' },
	{ name: 'Data Science', count: 8, size: 'sm' },
	{ name: 'NLP', count: 7, size: 'sm' },
	{ name: 'Computer Vision', count: 6, size: 'sm' },
	{ name: 'PyTorch', count: 5, size: 'sm' },
];

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

/**
 * Static tag cloud for AI search insights.
 */
export const TagCloud: React.FC = () => {
	return (
		<div className="pktw-flex pktw-flex-wrap pktw-gap-2">
			{tags.map((tag, index) => (
				<Button
					key={index}
					variant="ghost"
					className={cn(
						getSizeClasses(tag.size),
						getColorClasses(tag.size),
						'pktw-rounded-md pktw-border pktw-h-auto pktw-font-medium hover:pktw-shadow-sm active:pktw-scale-95'
					)}
					title={`${tag.count} occurrences`}
				>
					{tag.name}
				</Button>
			))}
		</div>
	);
};


