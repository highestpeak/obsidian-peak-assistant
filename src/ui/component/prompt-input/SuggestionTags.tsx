import React, { useCallback } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/component/shared-ui/tooltip';
import { Button } from '../shared-ui/button';

export interface SuggestionTag {
	id: string;
	label: string;
	color: 'blue' | 'green' | 'purple' | 'orange' | 'red';
	tooltip: string;
	action: string;
}

interface SuggestionTagsProps {
	tags: SuggestionTag[];
	onTagClick: (tagType: string) => void;
}

/**
 * Component for displaying interactive suggestion tags
 */
export const SuggestionTags: React.FC<SuggestionTagsProps> = ({ tags, onTagClick }) => {
	const getTagStyles = useCallback((color: SuggestionTag['color']) => {
		const colorMap = {
			blue: {
				base: 'pktw-bg-blue-500/15 pktw-text-blue-700 dark:pktw-bg-blue-500/20 dark:pktw-text-blue-400',
				hover: 'hover:pktw-bg-blue-500 hover:pktw-text-white dark:hover:pktw-bg-blue-500 dark:hover:pktw-text-white'
			},
			green: {
				base: 'pktw-bg-green-500/15 pktw-text-green-700 dark:pktw-bg-green-500/20 dark:pktw-text-green-400',
				hover: 'hover:pktw-bg-green-500 hover:pktw-text-white dark:hover:pktw-bg-green-500 dark:hover:pktw-text-white'
			},
			purple: {
				base: 'pktw-bg-purple-500/15 pktw-text-purple-700 dark:pktw-bg-purple-500/20 dark:pktw-text-purple-400',
				hover: 'hover:pktw-bg-purple-500 hover:pktw-text-white dark:hover:pktw-bg-purple-500 dark:hover:pktw-text-white'
			},
			orange: {
				base: 'pktw-bg-orange-500/15 pktw-text-orange-700 dark:pktw-bg-orange-500/20 dark:pktw-text-orange-400',
				hover: 'hover:pktw-bg-orange-500 hover:pktw-text-white dark:hover:pktw-bg-orange-500 dark:hover:pktw-text-white'
			},
			red: {
				base: 'pktw-bg-red-500/15 pktw-text-red-700 dark:pktw-bg-red-500/20 dark:pktw-text-red-400',
				hover: 'hover:pktw-bg-red-500 hover:pktw-text-white dark:hover:pktw-bg-red-500 dark:hover:pktw-text-white'
			}
		};
		return colorMap[color];
	}, []);

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-2">
			{tags.map((tag) => {
				const styles = getTagStyles(tag.color);
				return (
					<TooltipProvider key={tag.id}>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() => onTagClick(tag.action)}
									className={`pktw-text-xs pktw-font-medium pktw-px-3 pktw-py-1.5 pktw-rounded-md pktw-transition-all pktw-duration-200 hover:pktw-shadow-md hover:pktw-scale-105 active:pktw-scale-95 pktw-cursor-pointer pktw-select-none ${styles.base} ${styles.hover}`}
								>
									{tag.label}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>{tag.tooltip}</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				);
			})}
		</div>
	);
};