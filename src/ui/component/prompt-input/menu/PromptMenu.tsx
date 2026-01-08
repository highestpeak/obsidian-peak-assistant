import React, { useMemo } from 'react';
import { NavigableMenu, type NavigableMenuItem } from '../../mine/NavigableMenu';

/**
 * External prompt info structure
 */
export interface ExternalPromptInfo {
	promptId: string;
	promptNameForDisplay: string;
	promptCategory: string;
	promptDesc: string;
}

// Use hash to select from a predefined set of colors
const colors = [
	'pktw-bg-blue-500/15 pktw-text-blue-700 dark:pktw-bg-blue-500/20 dark:pktw-text-blue-400',
	'pktw-bg-green-500/15 pktw-text-green-700 dark:pktw-bg-green-500/20 dark:pktw-text-green-400',
	'pktw-bg-purple-500/15 pktw-text-purple-700 dark:pktw-bg-purple-500/20 dark:pktw-text-purple-400',
	'pktw-bg-orange-500/15 pktw-text-orange-700 dark:pktw-bg-orange-500/20 dark:pktw-text-orange-400',
	'pktw-bg-red-500/15 pktw-text-red-700 dark:pktw-bg-red-500/20 dark:pktw-text-red-400',
	'pktw-bg-teal-500/15 pktw-text-teal-700 dark:pktw-bg-teal-500/20 dark:pktw-text-teal-400',
	'pktw-bg-pink-500/15 pktw-text-pink-700 dark:pktw-bg-pink-500/20 dark:pktw-text-pink-400',
	'pktw-bg-indigo-500/15 pktw-text-indigo-700 dark:pktw-bg-indigo-500/20 dark:pktw-text-indigo-400',
	'pktw-bg-yellow-500/15 pktw-text-yellow-700 dark:pktw-bg-yellow-500/20 dark:pktw-text-yellow-400',
	'pktw-bg-cyan-500/15 pktw-text-cyan-700 dark:pktw-bg-cyan-500/20 dark:pktw-text-cyan-400',
];

/**
 * Generate color classes based on prompt category using hash
 */
const generateCategoryColor = (category: string): string => {
	// Simple hash function for category
	let hash = 0;
	for (let i = 0; i < category.length; i++) {
		hash = ((hash << 5) - hash) + category.charCodeAt(i);
		hash = hash & hash; // Convert to 32-bit integer
	}

	const index = Math.abs(hash) % colors.length;
	return colors[index];
};

/**
 * Prompt menu props
 */
export interface PromptMenuProps {
	prompts: ExternalPromptInfo[]; // External prompt list
	query?: string; // For filtering prompts
	onSelect: (promptId: string) => void; // Changed to return promptId instead of promptName
	onClose: () => void;
	className?: string;
}

/**
 * Prompt menu component for slash commands
 */
export const PromptMenu: React.FC<PromptMenuProps> = ({
	prompts,
	query = '',
	onSelect,
	onClose,
	className,
}) => {
	const items = useMemo<NavigableMenuItem[]>(() => {
		return prompts.map(prompt => ({
			id: prompt.promptId,
			label: prompt.promptNameForDisplay,
			description: prompt.promptDesc,
			color: generateCategoryColor(prompt.promptCategory),
			value: prompt.promptId, // Return promptId instead of display name
		})).filter(item => {
			// Filter by query if provided
			if (!query.trim()) return true;
			const searchTerm = query.toLowerCase();
			return item.label.toLowerCase().includes(searchTerm) ||
				   item.description.toLowerCase().includes(searchTerm) ||
				   item.id.toLowerCase().includes(searchTerm);
		});
	}, [prompts, query]);

	return (
		<NavigableMenu
			items={items}
			onSelect={(item) => onSelect(item.value)}
			onClose={onClose}
			className={className}
			isTagStyle={true}
			emptyMessage="No prompts found"
		/>
	);
};

